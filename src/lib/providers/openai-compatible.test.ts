import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OpenAICompatibleProvider,
  parseChatCompletionStream,
} from "./openai-compatible";

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

/** A body that delivers exactly these chunks, mimicking arbitrary framing. */
function bodyOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const delta of stream) out.push(delta);
  return out;
}

function sseChunk(content: string) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
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

describe("parseChatCompletionStream", () => {
  it("assembles deltas in order", async () => {
    const stream = parseChatCompletionStream(
      bodyOf(sseChunk("Hello"), sseChunk(", "), sseChunk("world")),
    );

    await expect(collect(stream)).resolves.toEqual(["Hello", ", ", "world"]);
  });

  it("stops at the [DONE] sentinel and ignores anything after it", async () => {
    const stream = parseChatCompletionStream(
      bodyOf(sseChunk("done"), "data: [DONE]\n\n", sseChunk("late")),
    );

    await expect(collect(stream)).resolves.toEqual(["done"]);
  });

  it("reassembles a delta split across chunk boundaries", async () => {
    const full = sseChunk("split");
    const stream = parseChatCompletionStream(
      bodyOf(full.slice(0, 12), full.slice(12), "data: [DONE]\n\n"),
    );

    await expect(collect(stream)).resolves.toEqual(["split"]);
  });

  it("ignores keep-alives, comments, and chunks carrying no content", async () => {
    const stream = parseChatCompletionStream(
      bodyOf(
        ": ping\n\n",
        "\n",
        "data: \n\n",
        'data: {"choices":[{"delta":{}}]}\n\n',
        'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
        "data: not json\n\n",
        sseChunk("only this"),
      ),
    );

    await expect(collect(stream)).resolves.toEqual(["only this"]);
  });

  it("yields a final line the server never terminated with a newline", async () => {
    const stream = parseChatCompletionStream(
      bodyOf(sseChunk("first"), sseChunk("last").trimEnd()),
    );

    await expect(collect(stream)).resolves.toEqual(["first", "last"]);
  });
});

describe("OpenAICompatibleProvider.chat", () => {
  it("posts a streaming request and yields the reply's deltas", async () => {
    const fetchSpy = mockFetch(
      async () =>
        new Response(bodyOf(sseChunk("Hel"), sseChunk("lo"), "data: [DONE]\n\n")),
    );

    await expect(
      collect(
        provider().chat({
          model: "qwen3:4b",
          messages: [
            { role: "system", content: "You reply only in haiku" },
            { role: "user", content: "hi" },
          ],
        }),
      ),
    ).resolves.toEqual(["Hel", "lo"]);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "qwen3:4b",
      messages: [
        { role: "system", content: "You reply only in haiku" },
        { role: "user", content: "hi" },
      ],
      stream: true,
    });
  });

  it("passes the caller's abort signal to the upstream request", async () => {
    const fetchSpy = mockFetch(async () => new Response(bodyOf("data: [DONE]\n\n")));
    const controller = new AbortController();

    await collect(
      provider().chat({
        model: "qwen3:4b",
        messages: [],
        signal: controller.signal,
      }),
    );

    expect(fetchSpy.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it("propagates an abort that lands mid-stream", async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();

    mockFetch(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(streamController) {
              streamController.enqueue(encoder.encode(sseChunk("partial")));
            },
            pull() {
              // The upstream body stays open until the caller aborts.
              return new Promise<void>((_, reject) => {
                controller.signal.addEventListener("abort", () =>
                  reject(
                    new DOMException("The operation was aborted.", "AbortError"),
                  ),
                );
              });
            },
          }),
        ),
    );

    const stream = provider().chat({
      model: "qwen3:4b",
      messages: [],
      signal: controller.signal,
    })[Symbol.asyncIterator]();

    await expect(stream.next()).resolves.toEqual({
      done: false,
      value: "partial",
    });

    const pending = stream.next();
    controller.abort();

    await expect(pending).rejects.toThrow(/aborted/i);
  });

  it("throws when the server answers with an error status", async () => {
    mockFetch(async () => new Response("nope", { status: 404 }));

    await expect(
      collect(provider().chat({ model: "qwen3:4b", messages: [] })),
    ).rejects.toThrow(/Ollama returned 404/);
  });

  it("throws when the response carries no body", async () => {
    mockFetch(async () => new Response(null, { status: 204 }));

    await expect(
      collect(provider().chat({ model: "qwen3:4b", messages: [] })),
    ).rejects.toThrow(/empty response body/);
  });
});
