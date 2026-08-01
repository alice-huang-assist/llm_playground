import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDatabase } from "@/lib/db/client";
import { clearSetting, getSetting, setSetting } from "@/lib/db/settings";
import {
  DEFAULT_FORGE_BASE_URL,
  FORGE_BASE_URL_KEY,
} from "@/lib/providers/forge";
import { OPENROUTER_API_KEY } from "@/lib/providers/openrouter";

const KEY = "sk-or-v1-super-secret-value-9876";

const defaultForge = {
  baseUrl: DEFAULT_FORGE_BASE_URL,
  isDefault: true,
};

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
  it("reports an unconfigured provider and default Forge URL", async () => {
    await expect((await GET()).json()).resolves.toEqual({
      openrouter: { configured: false, hint: null },
      forge: defaultForge,
    });
  });

  it("reports configured with only a masked hint — never the key", async () => {
    setSetting(fake.db as never, OPENROUTER_API_KEY, KEY);

    const response = await GET();
    const raw = await response.text();

    expect(JSON.parse(raw)).toEqual({
      openrouter: { configured: true, hint: "…9876" },
      forge: defaultForge,
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
      forge: defaultForge,
    });
    expect(raw).not.toContain(KEY);
    expect(getSetting(fake.db as never, OPENROUTER_API_KEY)).toBe(KEY);
  });

  it("stores a custom Forge base URL", async () => {
    const response = await put({ forgeBaseUrl: "http://127.0.0.1:7861/" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      openrouter: { configured: false, hint: null },
      forge: { baseUrl: "http://127.0.0.1:7861", isDefault: false },
    });
    expect(getSetting(fake.db as never, FORGE_BASE_URL_KEY)).toBe(
      "http://127.0.0.1:7861",
    );
  });

  it("clears a stored Forge URL when saving the default", async () => {
    setSetting(fake.db as never, FORGE_BASE_URL_KEY, "http://127.0.0.1:9000");

    const response = await put({ forgeBaseUrl: DEFAULT_FORGE_BASE_URL });

    expect(response.status).toBe(200);
    expect(getSetting(fake.db as never, FORGE_BASE_URL_KEY)).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      forge: defaultForge,
    });
  });

  it("rejects an invalid Forge URL", async () => {
    const response = await put({ forgeBaseUrl: "not-a-url" });
    expect(response.status).toBe(400);
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

  it("rejects a blank OpenRouter key without calling OpenRouter", async () => {
    const fetchSpy = mockFetch(async () => Response.json({}));

    for (const body of [{ apiKey: "" }, { apiKey: "   " }, { apiKey: 7 }]) {
      const response = await put(body);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "An OpenRouter API key is required.",
      });
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects an empty body", async () => {
    const response = await put({});
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Provide an OpenRouter API key and/or a Forge base URL.",
    });
  });
});

describe("DELETE /api/settings", () => {
  it("clears the key and reports unconfigured", async () => {
    setSetting(fake.db as never, OPENROUTER_API_KEY, KEY);

    const response = await DELETE();

    await expect(response.json()).resolves.toEqual({
      openrouter: { configured: false, hint: null },
      forge: defaultForge,
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
