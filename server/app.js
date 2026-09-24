import express from "express";
import multer from "multer";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publicPortfolio } from "../shared/schema.js";
import {
  checkRevision,
  createStore,
  HttpError,
  parsePortfolio,
  studioView,
} from "./store.js";

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const SESSION_MS = 12 * 60 * 60 * 1000;
const RATE_LIMIT_MS = 15 * 60 * 1000;
const COOKIE = "portfolio_session";
const hash = (value) => createHash("sha256").update(value).digest();
const isLoopback = (address) =>
  ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address);

function localHost(host) {
  if (
    typeof host !== "string" ||
    !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host)
  )
    return false;
  try {
    const parsed = new URL(`http://${host}`);
    return (
      !parsed.username &&
      !parsed.password &&
      ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function getConfig(options = {}) {
  const dev = options.dev ?? false;
  const rootDir = options.rootDir ?? projectDir;
  const adminPassword =
    options.adminPassword ?? process.env.ADMIN_PASSWORD ?? "";
  const originText = options.appOrigin ?? process.env.APP_ORIGIN ?? "";
  let origin;
  if (originText) {
    try {
      const candidate = new URL(originText);
      if (
        !["http:", "https:"].includes(candidate.protocol) ||
        candidate.username ||
        candidate.password ||
        candidate.pathname !== "/" ||
        candidate.search ||
        candidate.hash
      )
        throw new Error();
      origin = candidate;
    } catch {
      throw new Error(
        "APP_ORIGIN must be a complete http(s) origin, for example https://your-domain.com.",
      );
    }
  }
  if (adminPassword && adminPassword.length < 12)
    throw new Error("ADMIN_PASSWORD must contain at least 12 characters.");
  if (!dev && (!adminPassword || !origin))
    throw new Error(
      "Production requires ADMIN_PASSWORD (12+ characters) and APP_ORIGIN.",
    );
  return {
    dev,
    rootDir,
    adminPassword,
    origin,
    dataDir: path.resolve(
      options.dataDir ?? process.env.DATA_DIR ?? path.join(rootDir, "data"),
    ),
    seedFile: options.seedFile ?? path.join(rootDir, "shared", "seed.json"),
    useVite: options.useVite ?? false,
  };
}

export async function createApp(options = {}) {
  const config = getConfig(options);
  const store = await createStore(config);
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  const sessions = new Map();
  const attempts = new Map();
  const passwordHash = hash(config.adminPassword);
  const cookieOptions = {
    httpOnly: true,
    sameSite: "strict",
    secure: config.origin?.protocol === "https:",
    path: "/",
  };

  function prune() {
    const now = Date.now();
    for (const [key, expires] of sessions)
      if (expires <= now) sessions.delete(key);
    for (const [key, value] of attempts)
      if (value.until <= now) attempts.delete(key);
  }
  function token(req) {
    const cookie = (req.headers.cookie ?? "")
      .split(";")
      .find((value) => value.trim().startsWith(`${COOKIE}=`));
    const value = cookie?.trim().slice(COOKIE.length + 1);
    return value && /^[a-f0-9]{64}$/.test(value)
      ? hash(value).toString("hex")
      : "";
  }
  function localRequest(req) {
    return isLoopback(req.socket.remoteAddress) && localHost(req.headers.host);
  }
  function localMode(req) {
    return config.dev && !config.adminPassword && localRequest(req);
  }
  function authenticated(req) {
    prune();
    return localMode(req) || (sessions.get(token(req)) ?? 0) > Date.now();
  }
  function requireAuth(req, res, next) {
    if (!authenticated(req))
      return next(new HttpError(401, "Sign in to open your studio."));
    next();
  }

  // Apply host restrictions even to public pages, before Vite. This prevents
  // DNS rebinding from turning password-free local development into a remote API.
  app.use((req, res, next) => {
    const hostAllowed =
      (config.origin &&
        req.headers.host?.toLowerCase() === config.origin.host.toLowerCase()) ||
      (config.dev && localHost(req.headers.host));
    if (!hostAllowed)
      return next(new HttpError(403, "This host is not allowed."));
    if (config.dev && !config.adminPassword && !localRequest(req))
      return next(
        new HttpError(
          403,
          "Password-free development is available only on this computer.",
        ),
      );
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "strict-origin-when-cross-origin");
    res.set("X-Frame-Options", "DENY");
    if (!config.dev)
      res.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: http: data:; font-src 'self' https: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
      );
    next();
  });
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const supplied = req.headers.origin;
    const expected = config.origin?.origin;
    let valid = supplied && supplied === expected;
    if (config.dev && supplied && localRequest(req))
      valid ||=
        supplied === `http://${req.headers.host}` ||
        supplied === `https://${req.headers.host}`;
    if (!supplied && config.dev && localRequest(req)) valid = true;
    if (!valid)
      return next(
        new HttpError(
          403,
          "This request must come from your portfolio website.",
        ),
      );
    next();
  });
  app.use("/api", express.json({ limit: "2mb" }));

  app.get("/api/portfolio", (req, res) =>
    res.json(publicPortfolio(store.read().published)),
  );
  app.get("/api/session", (req, res) =>
    res.json({ authenticated: authenticated(req), localMode: localMode(req) }),
  );
  app.post("/api/login", (req, res, next) => {
    if (localMode(req))
      return res.json({ authenticated: true, localMode: true });
    prune();
    const key = req.socket.remoteAddress;
    const record = attempts.get(key) ?? {
      count: 0,
      until: Date.now() + RATE_LIMIT_MS,
    };
    if (record.count >= 5) {
      res.set(
        "Retry-After",
        String(Math.ceil((record.until - Date.now()) / 1000)),
      );
      return next(
        new HttpError(
          429,
          "Too many sign-in attempts. Please try again in 15 minutes.",
        ),
      );
    }
    record.count += 1;
    attempts.set(key, record);
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    if (!config.adminPassword || !timingSafeEqual(hash(password), passwordHash))
      return next(new HttpError(401, "That password is incorrect."));
    attempts.delete(key);
    const sessionToken = randomBytes(32).toString("hex");
    sessions.set(hash(sessionToken).toString("hex"), Date.now() + SESSION_MS);
    res.cookie(COOKIE, sessionToken, { ...cookieOptions, maxAge: SESSION_MS });
    res.json({ authenticated: true, localMode: false });
  });
  app.post("/api/logout", (req, res) => {
    sessions.delete(token(req));
    res.clearCookie(COOKIE, cookieOptions);
    res.json({ authenticated: localMode(req), localMode: localMode(req) });
  });
  app.get("/api/studio", requireAuth, (req, res) =>
    res.json(studioView(store.read())),
  );
  app.put("/api/draft", requireAuth, async (req, res) => {
    const portfolio = parsePortfolio(req.body?.portfolio);
    const state = await store.mutate((next) => {
      checkRevision(next, req.body?.revision);
      next.draft = portfolio;
      next.revision += 1;
      next.updatedAt = new Date().toISOString();
    });
    res.json(studioView(state));
  });
  app.post("/api/publish", requireAuth, async (req, res) => {
    const state = await store.mutate((next) => {
      checkRevision(next, req.body?.revision);
      next.published = parsePortfolio(next.draft);
      next.publishedAt = new Date().toISOString();
      next.revision += 1;
      next.history.unshift({
        id: randomUUID(),
        createdAt: next.publishedAt,
        label: "Published portfolio",
        portfolio: next.published,
      });
      next.history = next.history.slice(0, 20);
    });
    res.json(studioView(state));
  });
  app.post("/api/restore/:id", requireAuth, async (req, res) => {
    const state = await store.mutate((next) => {
      checkRevision(next, req.body?.revision);
      const snapshot = next.history.find((entry) => entry.id === req.params.id);
      if (!snapshot)
        throw new HttpError(404, "This saved version could not be found.");
      next.draft = parsePortfolio(snapshot.portfolio);
      next.revision += 1;
      next.updatedAt = new Date().toISOString();
    });
    res.json(studioView(state));
  });

  const allowedTypes = {
    ".pdf": "application/pdf",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  };
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1,
      fields: 1,
      fieldSize: 4000,
      parts: 2,
    },
    fileFilter(req, file, done) {
      if (!allowedTypes[path.extname(file.originalname).toLowerCase()])
        return done(
          new HttpError(400, "Choose a PDF, DOCX, TXT, PNG, or JPG file."),
        );
      done(null, true);
    },
  });
  app.post(
    "/api/sources",
    requireAuth,
    upload.single("file"),
    async (req, res) => {
      if (!req.file || req.file.size === 0)
        throw new HttpError(400, "Choose a file with some content.");
      const ext = path.extname(req.file.originalname).toLowerCase();
      const bytes = req.file.buffer;
      const signatureValid =
        ext === ".pdf"
          ? bytes.subarray(0, 5).toString() === "%PDF-"
          : ext === ".docx"
            ? bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
            : ext === ".png"
              ? bytes
                  .subarray(0, 8)
                  .equals(
                    Buffer.from([
                      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
                    ]),
                  )
              : ext === ".jpg" || ext === ".jpeg"
                ? bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
                : !bytes.includes(0);
      if (!signatureValid)
        throw new HttpError(
          400,
          "The file contents do not match its file type.",
        );
      if (
        typeof req.body.note !== "undefined" &&
        (typeof req.body.note !== "string" || req.body.note.length > 1000)
      )
        throw new HttpError(
          400,
          "Keep the source note under 1,000 characters.",
        );
      const id = randomUUID();
      const filename = `${id}${ext}`;
      const filePath = path.join(config.dataDir, "sources", filename);
      await writeFile(filePath, bytes, { flag: "wx", mode: 0o600 });
      let state;
      try {
        state = await store.mutate((next) => {
          if (next.sources.length >= 100)
            throw new HttpError(
              400,
              "Your source library holds up to 100 files. Remove one before uploading another.",
            );
          next.sources.unshift({
            id,
            filename,
            mime: allowedTypes[ext],
            name: path
              .basename(req.file.originalname)
              .replace(/[\x00-\x1f\x7f]/g, "")
              .slice(0, 200),
            size: req.file.size,
            createdAt: new Date().toISOString(),
            note: req.body.note ?? "",
          });
        });
      } catch (error) {
        await unlink(filePath).catch(() => {});
        throw error;
      }
      res.status(201).json(studioView(state));
    },
  );
  app.get("/api/sources/:id/file", requireAuth, (req, res, next) => {
    const source = store
      .read()
      .sources.find((entry) => entry.id === req.params.id);
    if (!source)
      return next(new HttpError(404, "This source file could not be found."));
    res.download(
      path.join(config.dataDir, "sources", source.filename),
      source.name,
      { headers: { "Content-Type": source.mime } },
      (error) => {
        if (error && !res.headersSent)
          next(new HttpError(404, "This source file could not be found."));
      },
    );
  });
  app.delete("/api/sources/:id", requireAuth, async (req, res) => {
    let filename;
    const state = await store.mutate((next) => {
      const source = next.sources.find((entry) => entry.id === req.params.id);
      if (!source)
        throw new HttpError(404, "This source file could not be found.");
      filename = source.filename;
      next.sources = next.sources.filter((entry) => entry.id !== req.params.id);
    });
    await unlink(path.join(config.dataDir, "sources", filename)).catch(
      () => {},
    );
    res.json(studioView(state));
  });
  app.use("/api", (req, res, next) =>
    next(new HttpError(404, "This API endpoint could not be found.")),
  );

  // Vite normally serves files from the repository. The repository also holds
  // personal source documents, so intercept sensitive paths before its middleware.
  app.use((req, res, next) => {
    let pathname;
    try {
      pathname = decodeURIComponent(req.path).replace(/\\/g, "/");
    } catch {
      return res.sendStatus(400);
    }
    const segments = pathname.split("/");
    const dataRelative = path
      .relative(config.rootDir, config.dataDir)
      .replace(/\\/g, "/");
    const blocked =
      segments.some(
        (segment, index) =>
          segment.startsWith(".") &&
          segment !== "." &&
          !(segment === ".vite" && segments[index - 1] === "node_modules"),
      ) ||
      /\.(pdf|docx)(?:$|[/?])/i.test(pathname) ||
      /^\/(?:data|tmp|server|tests)(?:\/|$)/i.test(pathname) ||
      /^\/shared\/(?!schema\.js$)/i.test(pathname) ||
      /^\/(?:package(?:-lock)?\.json|vite\.config\.[^/]+|tsconfig[^/]*\.json|README[^/]*|REEADME[^/]*)$/i.test(
        pathname,
      ) ||
      (dataRelative &&
        !dataRelative.startsWith("..") &&
        (pathname === `/${dataRelative}` ||
          pathname.startsWith(`/${dataRelative}/`))) ||
      (pathname.startsWith("/@fs/") && !pathname.includes("/node_modules/"));
    if (blocked) return res.sendStatus(404);
    next();
  });

  let vite;
  if (config.dev && config.useVite) {
    const { createServer } = await import("vite");
    vite = await createServer({
      root: config.rootDir,
      server: {
        host: "127.0.0.1",
        middlewareMode: options.httpServer
          ? { server: options.httpServer }
          : true,
        hmr: options.httpServer
          ? { server: options.httpServer }
          : { host: "127.0.0.1" },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(
      express.static(path.join(config.rootDir, "dist"), {
        index: false,
        dotfiles: "deny",
      }),
    );
    app.get("/{*path}", (req, res, next) => {
      res.sendFile(path.join(config.rootDir, "dist", "index.html"), (error) => {
        if (error && !res.headersSent)
          next(
            new HttpError(
              404,
              "Run npm run build before starting the production server.",
            ),
          );
      });
    });
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    let status = error.status ?? 500;
    let message = error.message;
    if (error instanceof multer.MulterError) {
      status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Choose a file smaller than 10 MB."
          : "Upload one file and an optional source note.";
    } else if (error.type === "entity.too.large") {
      status = 413;
      message = "This portfolio is too large. Keep the JSON file under 2 MB.";
    } else if (error.type === "entity.parse.failed") {
      status = 400;
      message = "The request contains invalid JSON.";
    } else if (!(error instanceof HttpError)) {
      status = 500;
      message =
        "Something went wrong while saving your portfolio. Please try again.";
    }
    res
      .status(status)
      .json({
        error: message,
        ...(error.details ? { details: error.details } : {}),
      });
  });
  return {
    app,
    config,
    close: async () => {
      sessions.clear();
      attempts.clear();
      await vite?.close();
    },
  };
}
