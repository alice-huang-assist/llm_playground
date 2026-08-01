import type { DatabaseSync } from "node:sqlite";

import { beforeEach, describe, expect, it } from "vitest";

import { openDatabase } from "./client";
import { LATEST_VERSION, MIGRATIONS, applyMigrations } from "./schema";
import {
  createSession,
  deleteSession,
  deriveSessionName,
  getSession,
  listSessions,
  updateSession,
} from "./sessions";

let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(":memory:");
});

describe("migrations", () => {
  it("apply cleanly to an empty database", () => {
    const fresh = openDatabase(":memory:");
    const tables = fresh
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as unknown as { name: string }[];

    expect(tables.map((table) => table.name)).toEqual(
      expect.arrayContaining(["sessions", "messages"]),
    );
    expect(
      (fresh.prepare("PRAGMA user_version").get() as { user_version: number })
        .user_version,
    ).toBe(LATEST_VERSION);
  });

  it("are idempotent — re-running changes nothing", () => {
    expect(applyMigrations(db)).toBe(LATEST_VERSION);
    expect(applyMigrations(db)).toBe(LATEST_VERSION);
  });

  it("declares versions in ascending order", () => {
    const versions = MIGRATIONS.map((migration) => migration.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(new Set(versions).size).toBe(versions.length);
  });
});

describe("createSession", () => {
  it("round-trips a session with its model, prompt, and messages", () => {
    const created = createSession(db, {
      name: "haiku test",
      providerId: "ollama",
      modelId: "qwen3:0.6b",
      systemPrompt: "You reply only in haiku",
      messages: [
        { role: "user", content: "explain gravity" },
        { role: "assistant", content: "mass draws to mass" },
      ],
    });

    expect(getSession(db, created.id)).toEqual({
      id: created.id,
      name: "haiku test",
      providerId: "ollama",
      modelId: "qwen3:0.6b",
      systemPrompt: "You reply only in haiku",
      messages: [
        { role: "user", content: "explain gravity" },
        { role: "assistant", content: "mass draws to mass" },
      ],
      messageCount: 2,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  });

  it("creates an empty unnamed session by default", () => {
    const created = createSession(db);

    expect(created.name).toBe("");
    expect(created.messages).toEqual([]);
    expect(created.providerId).toBeNull();
    expect(created.modelId).toBeNull();
  });
});

describe("listSessions", () => {
  it("returns sessions newest first", () => {
    const first = createSession(db, { name: "first" });
    const second = createSession(db, { name: "second" });
    const third = createSession(db, { name: "third" });

    expect(listSessions(db).map((session) => session.id)).toEqual([
      third.id,
      second.id,
      first.id,
    ]);
  });

  it("moves a session to the top when it is updated", () => {
    const first = createSession(db, { name: "first" });
    createSession(db, { name: "second" });

    updateSession(db, first.id, {
      messages: [{ role: "user", content: "poke" }],
    });

    expect(listSessions(db)[0]?.id).toBe(first.id);
  });

  it("counts messages per session", () => {
    createSession(db, {
      name: "two",
      messages: [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
      ],
    });

    expect(listSessions(db)[0]?.messageCount).toBe(2);
  });
});

describe("updateSession", () => {
  it("keeps message order stable across rewrites", () => {
    const session = createSession(db, { name: "ordered" });
    const messages = Array.from({ length: 12 }, (_, index) => ({
      role: (index % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `message ${index}`,
    }));

    updateSession(db, session.id, { messages });

    expect(getSession(db, session.id)?.messages).toEqual(messages);
  });

  it("replaces rather than appends", () => {
    const session = createSession(db, {
      messages: [{ role: "user", content: "old" }],
    });

    updateSession(db, session.id, {
      messages: [{ role: "user", content: "new" }],
    });

    expect(getSession(db, session.id)?.messages).toEqual([
      { role: "user", content: "new" },
    ]);
  });

  it("leaves untouched fields alone", () => {
    const session = createSession(db, {
      name: "keep me",
      providerId: "ollama",
      modelId: "qwen3:0.6b",
      systemPrompt: "stay",
    });

    const updated = updateSession(db, session.id, {
      messages: [{ role: "user", content: "hi" }],
    });

    expect(updated).toMatchObject({
      name: "keep me",
      providerId: "ollama",
      modelId: "qwen3:0.6b",
      systemPrompt: "stay",
    });
  });

  it("names an unnamed session from its first user message", () => {
    const session = createSession(db);

    const updated = updateSession(db, session.id, {
      messages: [
        { role: "user", content: "explain gravity please" },
        { role: "assistant", content: "it pulls" },
      ],
    });

    expect(updated?.name).toBe("explain gravity please");
  });

  it("does not rename a session the user already named", () => {
    const session = createSession(db, { name: "haiku test" });

    const updated = updateSession(db, session.id, {
      messages: [{ role: "user", content: "something else entirely" }],
    });

    expect(updated?.name).toBe("haiku test");
  });

  it("renames on request", () => {
    const session = createSession(db, { name: "old" });

    expect(updateSession(db, session.id, { name: "new" })?.name).toBe("new");
  });

  it("returns null for an unknown session", () => {
    expect(updateSession(db, "nope", { name: "x" })).toBeNull();
  });

  it("does not disturb other sessions", () => {
    const kept = createSession(db, {
      name: "kept",
      messages: [{ role: "user", content: "mine" }],
    });
    const other = createSession(db, { name: "other" });

    updateSession(db, other.id, {
      messages: [{ role: "user", content: "theirs" }],
    });

    expect(getSession(db, kept.id)).toMatchObject({
      name: "kept",
      messages: [{ role: "user", content: "mine" }],
    });
  });
});

describe("deleteSession", () => {
  it("removes the session and its messages", () => {
    const session = createSession(db, {
      messages: [{ role: "user", content: "bye" }],
    });

    expect(deleteSession(db, session.id)).toBe(true);
    expect(getSession(db, session.id)).toBeNull();
    expect(
      (
        db.prepare("SELECT COUNT(*) AS n FROM messages").get() as { n: number }
      ).n,
    ).toBe(0);
  });

  it("reports false for an unknown session", () => {
    expect(deleteSession(db, "nope")).toBe(false);
  });

  it("leaves other sessions in place", () => {
    const doomed = createSession(db, { name: "doomed" });
    const kept = createSession(db, { name: "kept" });

    deleteSession(db, doomed.id);

    expect(listSessions(db).map((session) => session.id)).toEqual([kept.id]);
  });
});

describe("deriveSessionName", () => {
  it("uses the first user message", () => {
    expect(
      deriveSessionName([
        { role: "assistant", content: "hello there" },
        { role: "user", content: "explain gravity" },
      ]),
    ).toBe("explain gravity");
  });

  it("collapses whitespace", () => {
    expect(
      deriveSessionName([{ role: "user", content: "  explain\n\n gravity  " }]),
    ).toBe("explain gravity");
  });

  it("truncates a long message", () => {
    const name = deriveSessionName([{ role: "user", content: "a".repeat(200) }]);

    expect(name).toHaveLength(48);
    expect(name.endsWith("…")).toBe(true);
  });

  it("falls back when there is nothing to name it after", () => {
    expect(deriveSessionName([])).toBe("Untitled session");
    expect(deriveSessionName([{ role: "user", content: "   " }])).toBe(
      "Untitled session",
    );
  });
});
