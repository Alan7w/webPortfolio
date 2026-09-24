import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { portfolioSchema } from "../shared/schema.js";

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function parsePortfolio(value) {
  const result = portfolioSchema.safeParse(value);
  if (!result.success) {
    throw new HttpError(
      400,
      "Please check your portfolio data.",
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

export function studioView(state) {
  return {
    draft: state.draft,
    publishedAt: state.publishedAt,
    updatedAt: state.updatedAt,
    revision: state.revision,
    history: state.history.map(({ id, createdAt, label }) => ({
      id,
      createdAt,
      label,
    })),
    sources: state.sources.map(({ id, name, size, createdAt, note }) => ({
      id,
      name,
      size,
      createdAt,
      note,
    })),
  };
}

// One queue covers both draft edits and source metadata. A successful response is
// sent only after its complete state has been atomically written to disk.
export async function createStore({ dataDir, seedFile }) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await mkdir(path.join(dataDir, "sources"), { recursive: true, mode: 0o700 });
  const filename = path.join(dataDir, "portfolio.json");
  let state;
  let queue = Promise.resolve();

  async function persist(next) {
    const temporary = `${filename}.${randomUUID()}.tmp`;
    let handle;
    try {
      handle = await open(temporary, "wx", 0o600);
      await handle.writeFile(JSON.stringify(next, null, 2));
      await handle.sync();
      await handle.close();
      handle = null;
      await rename(temporary, filename);
    } catch (error) {
      await handle?.close().catch(() => {});
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }

  try {
    state = JSON.parse(await readFile(filename, "utf8"));
    state.draft = portfolioSchema.parse(state.draft);
    state.published = portfolioSchema.parse(state.published);
    if (
      !Number.isSafeInteger(state.revision) ||
      state.revision < 1 ||
      !Array.isArray(state.history) ||
      !Array.isArray(state.sources)
    ) {
      throw new Error("Invalid saved state");
    }
    state.history.forEach((entry) => portfolioSchema.parse(entry.portfolio));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw new Error(
        "Could not read saved portfolio. Keep the data directory intact and restore it from a backup.",
        { cause: error },
      );
    }
    const seed = portfolioSchema.parse(
      JSON.parse(await readFile(seedFile, "utf8")),
    );
    const now = new Date().toISOString();
    state = {
      draft: seed,
      published: seed,
      revision: 1,
      updatedAt: now,
      publishedAt: now,
      history: [
        {
          id: randomUUID(),
          createdAt: now,
          label: "Starting portfolio",
          portfolio: seed,
        },
      ],
      sources: [],
    };
    await persist(state);
  }

  return {
    read: () => structuredClone(state),
    mutate(callback) {
      const operation = queue.then(async () => {
        const next = structuredClone(state);
        await callback(next);
        await persist(next);
        state = next;
        return structuredClone(next);
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}

export function checkRevision(state, revision) {
  if (!Number.isSafeInteger(revision) || revision < 1)
    throw new HttpError(400, "A valid revision is required.");
  if (revision !== state.revision)
    throw new HttpError(
      409,
      "This draft changed in another session. Reload before saving.",
    );
}
