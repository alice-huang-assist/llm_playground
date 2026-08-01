import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDatabase } from "@/lib/db/client";
import { clearSetting, getSetting, setSetting } from "@/lib/db/settings";
import { OPENROUTER_API_KEY } from "@/lib/providers/openrouter";

const KEY = "sk-or-v1-super-secret-value-9876";

const fake = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("@/lib/db/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/db/client")>("@/lib/db/client");
  return {
    ...actual,
    getDatabase: () => fake.db as ReturnType<typeof actual.getDatabase>,
  };
});

const { GET, PUT, DELETE } = await import("./route");

function mockFetch(implementation: typeof fetch) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(implementation);
}

function put(body: unknown) {
  return PUT(
    new Request("http://localhost:3000/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  fake.db = openDatabase(":memory:");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/settings", () => {
  it("reports an unconfigured provider", async () => {
    await expect((await GET()).json()).resolves.toEqual({
      openrouter: { configured: false, hint: null },
    });
  });

  it("reports configured with only a masked hint — never the key", async () => {
    setSetting(fake.db as never, OPENROUTER_API_KEY, KEY);

    const response = await GET();
    const raw = await response.text();

    expect(JSON.parse(raw)).toEqual({
      openrouter: { configured: true, hint: "…9876" },
    });
    expect(raw).not.toContain(KEY);
    expect(raw).not.toContain("super-secret");
  });
});

describe("PUT /api/settings", () => {
  it("stores a key OpenRouter accepts and answers without it", async () => {
    mockFetch(async () => Response.json({ data: { label: "test" } }));

    const response = await put({ apiKey: KEY });
    const raw = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(raw)).toEqual({
      openrouter: { configured: true, hint: "…9876" },
    });
    expect(raw).not.toContain(KEY);
    expect(getSetting(fake.db as never, OPENROUTER_API_KEY)).toBe(KEY);
  });

  it("trims surrounding whitespace before storing", async () => {
    mockFetch(async () => Response.json({}));

    await put({ apiKey: `  ${KEY}  ` });

    expect(getSetting(fake.db as never, OPENROUTER_API_KEY)).toBe(KEY);
  });

  it("rejects a key OpenRouter refuses, and stores nothing", async () => {
    mockFetch(async () => new Response("", { status: 401 }));

    const response = await put({ apiKey: KEY });
    const raw = await response.text();

    expect(response.status).toBe(400);
    expect(JSON.parse(raw)).toEqual({ error: "OpenRouter rejected that key." });
    expect(raw).not.toContain(KEY);
    expect(getSetting(fake.db as never, OPENROUTER_API_KEY)).toBeNull();
  });

  it("keeps an existing key when a replacement is refused", async () => {
    setSetting(fake.db as never, OPENROUTER_API_KEY, KEY);
    mockFetch(async () => new Response("", { status: 401 }));

    await put({ apiKey: "sk-or-wrong" });

    expect(getSetting(fake.db as never, OPENROUTER_API_KEY)).toBe(KEY);
  });

  it("rejects a missing or blank key without calling OpenRouter", async () => {
    const fetchSpy = mockFetch(async () => Response.json({}));

    for (const body of [{}, { apiKey: "" }, { apiKey: "   " }, { apiKey: 7 }]) {
      const response = await put(body);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "An OpenRouter API key is required.",
      });
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/settings", () => {
  it("clears the key and reports unconfigured", async () => {
    setSetting(fake.db as never, OPENROUTER_API_KEY, KEY);

    const response = await DELETE();

    await expect(response.json()).resolves.toEqual({
      openrouter: { configured: false, hint: null },
    });
    expect(getSetting(fake.db as never, OPENROUTER_API_KEY)).toBeNull();
  });

  it("is harmless when nothing is stored", async () => {
    clearSetting(fake.db as never, OPENROUTER_API_KEY);

    expect((await DELETE()).status).toBe(200);
  });
});

describe("no response ever carries the key", () => {
  it("holds across every settings endpoint", async () => {
    mockFetch(async () => Response.json({}));

    const bodies = [
      await (await put({ apiKey: KEY })).text(),
      await (await GET()).text(),
      await (await DELETE()).text(),
    ];

    for (const body of bodies) {
      expect(body).not.toContain(KEY);
      expect(body).not.toContain("super-secret");
    }
  });
});
