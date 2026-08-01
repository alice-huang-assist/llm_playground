import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenAICompatibleProvider } from "./openai-compatible";

function provider() {
  return new OpenAICompatibleProvider({
    id: "ollama",
    name: "Ollama",
    baseUrl: "http://localhost:11434/v1",
  });
}

function mockFetch(implementation: typeof fetch) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(implementation);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OpenAICompatibleProvider.listModels", () => {
  it("parses a /v1/models payload", async () => {
    const fetchSpy = mockFetch(async () =>
      Response.json({
        object: "list",
        data: [
          { id: "qwen3:4b", object: "model" },
          { id: "tinyllama", object: "model" },
        ],
      }),
    );

    await expect(provider().listModels()).resolves.toEqual([
      { id: "qwen3:4b", providerId: "ollama", providerName: "Ollama" },
      { id: "tinyllama", providerId: "ollama", providerName: "Ollama" },
    ]);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:11434/v1/models",
      expect.anything(),
    );
  });

  it("skips entries without a usable id", async () => {
    mockFetch(async () =>
      Response.json({ data: [{ id: "qwen3:4b" }, { id: 7 }, {}] }),
    );

    const models = await provider().listModels();

    expect(models.map((model) => model.id)).toEqual(["qwen3:4b"]);
  });

  it("returns an empty list when the payload has no data array", async () => {
    mockFetch(async () => Response.json({}));

    await expect(provider().listModels()).resolves.toEqual([]);
  });

  it("throws when the server answers with an error status", async () => {
    mockFetch(async () => new Response("nope", { status: 500 }));

    await expect(provider().listModels()).rejects.toThrow(/Ollama returned 500/);
  });

  it("propagates a connection refusal", async () => {
    mockFetch(async () => {
      throw new Error("fetch failed: ECONNREFUSED");
    });

    await expect(provider().listModels()).rejects.toThrow(/ECONNREFUSED/);
  });

  it("does not double up slashes when the base URL has a trailing slash", async () => {
    const fetchSpy = mockFetch(async () => Response.json({ data: [] }));

    await new OpenAICompatibleProvider({
      id: "lmstudio",
      name: "LM Studio",
      baseUrl: "http://localhost:1234/v1/",
    }).listModels();

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:1234/v1/models",
      expect.anything(),
    );
  });
});

describe("OpenAICompatibleProvider.chat", () => {
  it("posts the request and returns the first choice's content", async () => {
    const fetchSpy = mockFetch(async () =>
      Response.json({ choices: [{ message: { content: "hello" } }] }),
    );

    await expect(
      provider().chat({
        model: "qwen3:4b",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).resolves.toEqual({ content: "hello" });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "qwen3:4b",
      messages: [{ role: "user", content: "hi" }],
      stream: false,
    });
  });

  it("throws when the server answers with an error status", async () => {
    mockFetch(async () => new Response("nope", { status: 404 }));

    await expect(
      provider().chat({ model: "qwen3:4b", messages: [] }),
    ).rejects.toThrow(/Ollama returned 404/);
  });
});
