import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { request as httpRequest } from "node:http";
import { createApp, getConfig } from "../server/app.js";

const seed = {
  schemaVersion: 1,
  profile: {
    name: "Test Author",
    role: "Engineer",
    headline: "Build useful things",
    intro: "Hello",
    location: "Tashkent",
    email: "",
    github: "",
    linkedin: "",
    availability: "",
    about: "About me",
    portrait: "",
  },
  theme: { accent: "lime", surface: "paper", font: "editorial" },
  sections: [
    {
      id: "projects",
      type: "projects",
      title: "Projects",
      visible: true,
      items: [
        { id: "public-project", title: "Public project", visible: true },
        { id: "private-project", title: "Unannounced project", visible: false },
      ],
    },
    {
      id: "private-notes",
      type: "custom",
      title: "Private notes",
      visible: false,
      items: [{ id: "note", title: "Sensitive note", visible: true }],
    },
  ],
};

async function fixture(t, overrides = {}) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "portfolio-test-"));
  const seedFile = path.join(temp, "seed.json");
  await writeFile(seedFile, JSON.stringify(seed));
  const dataDir = path.join(temp, "data");
  const config = {
    dev: true,
    adminPassword: "",
    appOrigin: "",
    dataDir,
    seedFile,
    rootDir: temp,
    ...overrides,
  };
  const instance = await createApp(config);
  const server = instance.app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await instance.close();
    await rm(temp, { recursive: true, force: true });
  });
  const request = async (url, options = {}) => {
    const headers = {
      ...(config.appOrigin ? { Host: new URL(config.appOrigin).host } : {}),
      ...options.headers,
    };
    // Node fetch discards Host overrides. Raw HTTP is needed to actually test
    // production origins and DNS-rebinding attempts with an ephemeral listener.
    if (!headers.Host) return fetch(`${base}${url}`, { ...options, headers });
    const prepared = new Request(`${base}${url}`, { ...options, headers });
    const body =
      options.body === undefined
        ? undefined
        : Buffer.from(await prepared.arrayBuffer());
    return new Promise((resolve, reject) => {
      const outbound = httpRequest(
        `${base}${url}`,
        {
          method: prepared.method,
          headers: Object.fromEntries(prepared.headers),
        },
        (incoming) => {
          const chunks = [];
          incoming.on("data", (chunk) => chunks.push(chunk));
          incoming.on("end", () =>
            resolve(
              new Response(Buffer.concat(chunks), {
                status: incoming.statusCode,
                headers: incoming.headers,
              }),
            ),
          );
        },
      );
      outbound.on("error", reject);
      outbound.end(body);
    });
  };
  const json = (method, payload, headers = {}) => ({
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  return { request, json, config, temp, dataDir, instance, base };
}

test("public visitors see only published, visible entries; studio retains all draft data", async (t) => {
  const { request, json } = await fixture(t);
  const session = await (await request("/api/session")).json();
  assert.deepEqual(session, { authenticated: true, localMode: true });
  const initial = await (await request("/api/portfolio")).json();
  assert.equal(initial.sections.length, 1);
  assert.equal(initial.sections[0].items.length, 1);
  assert.equal(JSON.stringify(initial).includes("Sensitive note"), false);
  const studio = await (await request("/api/studio")).json();
  assert.equal(studio.draft.sections.length, 2);
  assert.equal(studio.draft.sections[0].items.length, 2);
  studio.draft.profile.name = "Draft name";
  const savedResponse = await request(
    "/api/draft",
    json("PUT", { portfolio: studio.draft, revision: studio.revision }),
  );
  assert.equal(savedResponse.status, 200);
  const saved = await savedResponse.json();
  assert.equal(saved.revision, studio.revision + 1);
  assert.equal(
    (await (await request("/api/portfolio")).json()).profile.name,
    "Test Author",
  );
  const published = await request(
    "/api/publish",
    json("POST", { revision: saved.revision }),
  );
  assert.equal(published.status, 200);
  assert.equal(
    (await (await request("/api/portfolio")).json()).profile.name,
    "Draft name",
  );
  assert.equal(
    JSON.stringify(await (await request("/api/portfolio")).json()).includes(
      "Sensitive note",
    ),
    false,
  );
});

test("parallel edits cannot silently overwrite one another; old revisions cannot publish or restore", async (t) => {
  const { request, json } = await fixture(t);
  const studio = await (await request("/api/studio")).json();
  const updates = ["First edit", "Second edit"].map((name) => {
    const portfolio = structuredClone(studio.draft);
    portfolio.profile.name = name;
    return request(
      "/api/draft",
      json("PUT", { portfolio, revision: studio.revision }),
    );
  });
  const responses = await Promise.all(updates);
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409],
  );
  assert.equal(
    (await request("/api/publish", json("POST", { revision: studio.revision })))
      .status,
    409,
  );
  assert.equal(
    (
      await request(
        `/api/restore/${studio.history[0].id}`,
        json("POST", { revision: studio.revision }),
      )
    ).status,
    409,
  );
  assert.equal(
    (await (await request("/api/studio")).json()).revision,
    studio.revision + 1,
  );
});

test("saved data survives a new app instance and version restore affects only the draft", async (t) => {
  const { request, json, config, dataDir } = await fixture(t);
  const original = await (await request("/api/studio")).json();
  original.draft.profile.name = "Published revision";
  const saved = await (
    await request(
      "/api/draft",
      json("PUT", { portfolio: original.draft, revision: original.revision }),
    )
  ).json();
  const published = await (
    await request("/api/publish", json("POST", { revision: saved.revision }))
  ).json();
  assert.equal(published.history.length, 2);
  const restored = await (
    await request(
      `/api/restore/${original.history[0].id}`,
      json("POST", { revision: published.revision }),
    )
  ).json();
  assert.equal(restored.draft.profile.name, "Test Author");
  assert.equal(
    (await (await request("/api/portfolio")).json()).profile.name,
    "Published revision",
  );
  const second = await createApp(config);
  const secondServer = second.app.listen(0, "127.0.0.1");
  await new Promise((resolve) => secondServer.once("listening", resolve));
  t.after(async () => {
    await new Promise((resolve) => secondServer.close(resolve));
    await second.close();
  });
  const secondStudio = await (
    await fetch(`http://127.0.0.1:${secondServer.address().port}/api/studio`)
  ).json();
  assert.equal(secondStudio.draft.profile.name, "Test Author");
  assert.equal(secondStudio.revision, restored.revision);
  const persisted = JSON.parse(
    await readFile(path.join(dataDir, "portfolio.json"), "utf8"),
  );
  assert.equal(persisted.published.profile.name, "Published revision");
});

test("invalid imports and dangerous URL protocols are rejected without changing saved state", async (t) => {
  const { request, json } = await fixture(t);
  const initial = await (await request("/api/studio")).json();
  const badUrl = structuredClone(initial.draft);
  badUrl.profile.github = "javascript:alert(1)";
  const duplicate = structuredClone(initial.draft);
  duplicate.sections.push(duplicate.sections[0]);
  for (const portfolio of [
    null,
    {},
    { ...initial.draft, schemaVersion: 99 },
    badUrl,
    duplicate,
  ]) {
    const response = await request(
      "/api/draft",
      json("PUT", { portfolio, revision: initial.revision }),
    );
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, "string");
  }
  assert.equal(
    (await (await request("/api/studio")).json()).revision,
    initial.revision,
  );
  const brokenJson = await request("/api/draft", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: "{bad",
  });
  assert.equal(brokenJson.status, 400);
  assert.equal(
    (await brokenJson.json()).error,
    "The request contains invalid JSON.",
  );
});

test("password sessions protect studio and sources; logout revokes the session", async (t) => {
  const password = "correct-password-for-tests";
  const { request, json } = await fixture(t, { adminPassword: password });
  assert.equal((await request("/api/studio")).status, 401);
  assert.equal((await request("/api/sources/missing/file")).status, 401);
  assert.equal(
    (await request("/api/sources/missing", { method: "DELETE" })).status,
    401,
  );
  assert.equal(
    (await request("/api/login", json("POST", { password: "wrong" }))).status,
    401,
  );
  const login = await request("/api/login", json("POST", { password }));
  assert.equal(login.status, 200);
  const rawCookie = login.headers.get("set-cookie");
  assert.match(rawCookie, /HttpOnly/);
  assert.match(rawCookie, /SameSite=Strict/);
  const cookie = rawCookie.split(";")[0];
  assert.equal(
    (await request("/api/studio", { headers: { Cookie: cookie } })).status,
    200,
  );
  assert.equal(
    (
      await request("/api/session", {
        headers: { Cookie: "portfolio_session=forged" },
      }).then((r) => r.json())
    ).authenticated,
    false,
  );
  assert.equal(
    (await request("/api/logout", json("POST", {}, { Cookie: cookie }))).status,
    200,
  );
  assert.equal(
    (await request("/api/studio", { headers: { Cookie: cookie } })).status,
    401,
  );
});

test("unsafe imported IDs are rejected without changing the draft or public portfolio", async (t) => {
  const { request, json } = await fixture(t);
  const initial = await (await request("/api/studio")).json();
  const publicBefore = await (await request("/api/portfolio")).json();
  for (const [target, id] of [
    ["section", "\ud800"],
    ["section", "unsafe/id#fragment"],
    ["item", "\ud800"],
    ["item", "../private"],
    ["item", "with spaces"],
  ]) {
    const portfolio = structuredClone(initial.draft);
    if (target === "section") portfolio.sections[0].id = id;
    else portfolio.sections[0].items[0].id = id;
    const response = await request(
      "/api/draft",
      json("PUT", { portfolio, revision: initial.revision }),
    );
    assert.equal(response.status, 400);
    const error = await response.json();
    const expectedPath =
      target === "section" ? "sections.0.id" : "sections.0.items.0.id";
    assert.ok(error.details.some((issue) => issue.path === expectedPath));
  }
  const after = await (await request("/api/studio")).json();
  assert.equal(after.revision, initial.revision);
  assert.deepEqual(after.draft, initial.draft);
  assert.deepEqual(
    await (await request("/api/portfolio")).json(),
    publicBefore,
  );
});

test("failed login attempts are limited", async (t) => {
  const { request, json } = await fixture(t, {
    adminPassword: "correct-password-for-tests",
  });
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await request("/api/login", json("POST", { password: "wrong" }))).status,
      401,
    );
  const limited = await request(
    "/api/login",
    json("POST", { password: "correct-password-for-tests" }),
  );
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
});

test("host and Origin checks reject cross-site requests and untrusted forwarded addresses", async (t) => {
  const { request, json } = await fixture(t);
  assert.equal(
    (
      await request("/api/studio", {
        headers: { Host: "attacker.example", "X-Forwarded-Host": "localhost" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/logout",
        json("POST", {}, { Origin: "https://attacker.example" }),
      )
    ).status,
    403,
  );
  assert.equal(
    (await request("/api/logout", json("POST", {}, { Origin: "null" }))).status,
    403,
  );
  const { request: productionRequest, json: productionJson } = await fixture(
    t,
    {
      dev: false,
      adminPassword: "correct-password-for-tests",
      appOrigin: "https://portfolio.example",
    },
  );
  assert.equal(
    (
      await productionRequest(
        "/api/login",
        productionJson("POST", { password: "correct-password-for-tests" }),
      )
    ).status,
    403,
  );
  const login = await productionRequest(
    "/api/login",
    productionJson(
      "POST",
      { password: "correct-password-for-tests" },
      { Origin: "https://portfolio.example" },
    ),
  );
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /Secure/);
  assert.equal((await productionRequest("/api/session")).status, 200);
});

test("source files are private attachments, excluded from public data, and removable", async (t) => {
  const { request, json } = await fixture(t, {
    adminPassword: "correct-password-for-tests",
  });
  const login = await request(
    "/api/login",
    json("POST", { password: "correct-password-for-tests" }),
  );
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const body = new FormData();
  body.append(
    "file",
    new Blob(["My private source material."], { type: "text/plain" }),
    "notes.txt",
  );
  body.append("note", "Confirm these dates before publishing.");
  const response = await request("/api/sources", {
    method: "POST",
    headers: { Cookie: cookie },
    body,
  });
  assert.equal(response.status, 201);
  const uploaded = await response.json();
  const source = uploaded.sources[0];
  assert.equal(source.name, "notes.txt");
  assert.equal(source.note, "Confirm these dates before publishing.");
  assert.equal("filename" in source, false);
  assert.equal(
    JSON.stringify(await (await request("/api/portfolio")).json()).includes(
      "notes.txt",
    ),
    false,
  );
  assert.equal((await request(`/api/sources/${source.id}/file`)).status, 401);
  const download = await request(`/api/sources/${source.id}/file`, {
    headers: { Cookie: cookie },
  });
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-disposition"), /attachment/);
  assert.match(download.headers.get("content-disposition"), /notes\.txt/);
  assert.equal(await download.text(), "My private source material.");
  const removed = await request(`/api/sources/${source.id}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).sources.length, 0);
  assert.equal(
    (
      await request(`/api/sources/${source.id}/file`, {
        headers: { Cookie: cookie },
      })
    ).status,
    404,
  );
});

test("uploads reject executable types, mismatched file content, and over-limit files", async (t) => {
  const { request } = await fixture(t);
  const cases = [
    { name: "script.html", content: "<script>bad()</script>", expected: 400 },
    { name: "fake.pdf", content: "<script>bad()</script>", expected: 400 },
    {
      name: "huge.txt",
      content: "a".repeat(10 * 1024 * 1024 + 1),
      expected: 413,
    },
  ];
  for (const item of cases) {
    const body = new FormData();
    body.append("file", new Blob([item.content]), item.name);
    assert.equal(
      (await request("/api/sources", { method: "POST", body })).status,
      item.expected,
    );
  }
});

test("sensitive repository and data paths are blocked before static or development serving", async (t) => {
  const { request, temp } = await fixture(t);
  await mkdir(path.join(temp, "dist"));
  await writeFile(
    path.join(temp, "dist", "index.html"),
    "<html>Public page</html>",
  );
  for (const filename of [
    "/Resume.pdf",
    "/Resume.pdf?raw",
    "/%2eenv",
    "/data/portfolio.json",
    "/tmp/extracted.txt",
    "/shared/seed.json",
    "/server/app.js",
    "/@fs/private/Resume.pdf",
    "/@fs/private/data/portfolio.json",
  ]) {
    assert.equal((await request(filename)).status, 404, filename);
  }
  assert.equal((await request("/studio")).status, 200);
});

test("production fails closed without secure configuration and corrupt state is not overwritten", async (t) => {
  assert.throws(
    () => getConfig({ dev: false, adminPassword: "", appOrigin: "" }),
    /Production requires/,
  );
  assert.throws(
    () =>
      getConfig({
        dev: false,
        adminPassword: "short",
        appOrigin: "https://portfolio.example",
      }),
    /12 characters/,
  );
  assert.throws(
    () =>
      getConfig({
        dev: false,
        adminPassword: "long-password-for-tests",
        appOrigin: "https://portfolio.example/subpath",
      }),
    /APP_ORIGIN/,
  );
  const { dataDir, config } = await fixture(t);
  await writeFile(path.join(dataDir, "portfolio.json"), "{malformed");
  await assert.rejects(createApp(config), /Could not read saved portfolio/);
  assert.equal(
    await readFile(path.join(dataDir, "portfolio.json"), "utf8"),
    "{malformed",
  );
});
