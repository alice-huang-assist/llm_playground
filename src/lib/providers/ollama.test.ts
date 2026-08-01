import { afterEach, describe, expect, it, vi } from "vitest";

import { parsePullLine, parsePullStream, pullModel } from "./ollama";

function bodyOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of stream) out.push(item);
  return out;
}

function mockFetch(implementation: typeof fetch) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(implementation);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parsePullLine", () => {
  it("computes a percentage from the byte counts", () => {
    const line = JSON.stringify({
      status: "pulling 2af3b81862c6",
      digest: "sha256:2af3b81862c6",
      completed: 250,
      total: 1000,
    });

    expect(parsePullLine(line)).toEqual({
      type: "progress",
      progress: {
        status: "pulling 2af3b81862c6",
        digest: "sha256:2af3b81862c6",
        completed: 250,
        total: 1000,
        percent: 25,
      },
    });
  });

  it("leaves the percentage null for lines with no byte counts", () => {
    const parsed = parsePullLine(JSON.stringify({ status: "pulling manifest" }));

    expect(parsed).toEqual({
      type: "progress",
      progress: {
        status: "pulling manifest",
        digest: null,
        completed: null,
        total: null,
        percent: null,
      },
    });
  });

  it("never divides by zero", () => {
    const parsed = parsePullLine(
      JSON.stringify({ status: "starting", completed: 0, total: 0 }),
    );

    expect(parsed).toMatchObject({ progress: { percent: null } });
  });

  it("caps the percentage at 100", () => {
    const parsed = parsePullLine(
      JSON.stringify({ status: "pulling", completed: 120, total: 100 }),
    );

    expect(parsed).toMatchObject({ progress: { percent: 100 } });
  });

  it("recognises an error payload", () => {
    const parsed = parsePullLine(
      JSON.stringify({ error: "pull model manifest: file does not exist" }),
    );

    expect(parsed).toEqual({
      type: "error",
      message: "pull model manifest: file does not exist",
    });
  });

  it("ignores blank and unparseable lines", () => {
    expect(parsePullLine("")).toEqual({ type: "ignore" });
    expect(parsePullLine("   ")).toEqual({ type: "ignore" });
    expect(parsePullLine("not json")).toEqual({ type: "ignore" });
    expect(parsePullLine(JSON.stringify({ unrelated: true }))).toEqual({
      type: "ignore",
    });
  });
});

describe("parsePullStream", () => {
  it("yields each progress line in order", async () => {
    const stream = parsePullStream(
      bodyOf(
        `${JSON.stringify({ status: "pulling manifest" })}\n`,
        `${JSON.stringify({ status: "pulling abc", completed: 5, total: 10 })}\n`,
        `${JSON.stringify({ status: "success" })}\n`,
      ),
    );

    await expect(
      collect(stream).then((items) =>
        items.map((item) => [item.status, item.percent]),
      ),
    ).resolves.toEqual([
      ["pulling manifest", null],
      ["pulling abc", 50],
      ["success", null],
    ]);
  });

  it("reassembles a line split across chunk boundaries", async () => {
    const line = `${JSON.stringify({ status: "pulling", completed: 1, total: 4 })}\n`;
    const stream = parsePullStream(bodyOf(line.slice(0, 9), line.slice(9)));

    await expect(
      collect(stream).then((items) => items.map((item) => item.percent)),
    ).resolves.toEqual([25]);
  });

  it("yields a final line the server never terminated with a newline", async () => {
    const stream = parsePullStream(
      bodyOf(JSON.stringify({ status: "success" })),
    );

    await expect(
      collect(stream).then((items) => items.map((item) => item.status)),
    ).resolves.toEqual(["success"]);
  });

  it("surfaces an error that arrives mid-stream rather than swallowing it", async () => {
    const stream = parsePullStream(
      bodyOf(
        `${JSON.stringify({ status: "pulling manifest" })}\n`,
        `${JSON.stringify({ error: "no space left on device" })}\n`,
        `${JSON.stringify({ status: "success" })}\n`,
      ),
    );

    const seen: string[] = [];
    await expect(
      (async () => {
        for await (const progress of stream) seen.push(progress.status);
      })(),
    ).rejects.toThrow("no space left on device");

    // The healthy lines before the failure were still delivered.
    expect(seen).toEqual(["pulling manifest"]);
  });
});

describe("pullModel", () => {
  it("posts the model name to Ollama's pull endpoint and streams progress", async () => {
    const fetchSpy = mockFetch(
      async () =>
        new Response(
          bodyOf(`${JSON.stringify({ status: "pulling manifest" })}\n`),
        ),
    );

    await expect(
      collect(pullModel({ name: "qwen3:0.6b" })).then((items) =>
        items.map((item) => item.status),
      ),
    ).resolves.toEqual(["pulling manifest"]);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/pull");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "qwen3:0.6b",
      stream: true,
    });
  });

  it("passes the caller's abort signal to Ollama", async () => {
    const fetchSpy = mockFetch(async () => new Response(bodyOf("")));
    const controller = new AbortController();

    await collect(pullModel({ name: "qwen3:0.6b", signal: controller.signal }));

    expect(fetchSpy.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it("prefers Ollama's error text over the status line", async () => {
    mockFetch(
      async () =>
        new Response(JSON.stringify({ error: "model not found" }), {
          status: 404,
        }),
    );

    await expect(collect(pullModel({ name: "nope:xyz" }))).rejects.toThrow(
      "model not found",
    );
  });

  it("falls back to the status when the error body is not JSON", async () => {
    mockFetch(async () => new Response("", { status: 500 }));

    await expect(collect(pullModel({ name: "x" }))).rejects.toThrow(
      /Ollama returned 500/,
    );
  });
});
