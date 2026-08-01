import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PullProgress } from "@/lib/providers/ollama";

const fake = vi.hoisted(() => {
  const state: {
    name: string | null;
    signal: AbortSignal | undefined;
    updates: PullProgress[];
    failWith: Error | null;
  } = { name: null, signal: undefined, updates: [], failWith: null };

  return { state };
});

vi.mock("@/lib/providers/ollama", () => ({
  async *pullModel({ name, signal }: { name: string; signal?: AbortSignal }) {
    fake.state.name = name;
    fake.state.signal = signal;
    for (const update of fake.state.updates) yield update;
    if (fake.state.failWith) throw fake.state.failWith;
  },
}));

const { POST } = await import("./route");

function progress(status: string, percent: number | null): PullProgress {
  return { status, digest: null, completed: null, total: null, percent };
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost:3000/api/models/pull", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function events(response: Response) {
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

beforeEach(() => {
  fake.state.name = null;
  fake.state.signal = undefined;
  fake.state.updates = [];
  fake.state.failWith = null;
});

describe("POST /api/models/pull", () => {
  it("streams progress events and ends with done", async () => {
    fake.state.updates = [
      progress("pulling manifest", null),
      progress("pulling 2af3b8", 42),
    ];

    const response = await post({ name: "qwen3:0.6b" });

    expect(response.status).toBe(200);
    await expect(events(response)).resolves.toEqual([
      {
        type: "progress",
        status: "pulling manifest",
        percent: null,
        digest: null,
        completed: null,
        total: null,
      },
      {
        type: "progress",
        status: "pulling 2af3b8",
        percent: 42,
        digest: null,
        completed: null,
        total: null,
      },
      { type: "done" },
    ]);
  });

  it("trims the requested name before handing it to Ollama", async () => {
    const response = await post({ name: "  qwen3:0.6b  " });
    await response.text();

    expect(fake.state.name).toBe("qwen3:0.6b");
  });

  it("forwards the request's abort signal", async () => {
    const response = await post({ name: "qwen3:0.6b" });
    await response.text();

    expect(fake.state.signal).toBeInstanceOf(AbortSignal);
  });

  it("delivers a mid-stream failure as an error event, keeping earlier progress", async () => {
    fake.state.updates = [progress("pulling manifest", null)];
    fake.state.failWith = new Error("pull model manifest: file does not exist");

    const response = await post({ name: "notarealmodel:xyz" });

    expect(response.status).toBe(200);
    await expect(events(response)).resolves.toEqual([
      {
        type: "progress",
        status: "pulling manifest",
        percent: null,
        digest: null,
        completed: null,
        total: null,
      },
      {
        type: "error",
        message: "pull model manifest: file does not exist",
      },
    ]);
  });

  it("rejects a missing or blank model name", async () => {
    for (const body of [{}, { name: "" }, { name: "   " }, { name: 7 }]) {
      const response = await post(body);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "A model name is required.",
      });
    }
  });
});
