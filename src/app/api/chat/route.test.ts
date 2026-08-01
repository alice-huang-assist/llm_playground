import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatMessage, Provider } from "@/lib/providers/types";

const fake = vi.hoisted(() => {
  const state: {
    sent: ChatMessage[] | null;
    signal: AbortSignal | undefined;
    deltas: string[];
    failWith: Error | null;
  } = { sent: null, signal: undefined, deltas: [], failWith: null };

  const provider = {
    id: "ollama",
    name: "Ollama",
    async listModels() {
      return [];
    },
    async *chat(request: {
      messages: ChatMessage[];
      signal?: AbortSignal;
    }): AsyncGenerator<string> {
      state.sent = request.messages;
      state.signal = request.signal;
      if (state.failWith) throw state.failWith;
      for (const delta of state.deltas) yield delta;
    },
  };

  return { state, provider };
});

vi.mock("@/lib/providers/registry", () => ({
  providers: [fake.provider as unknown as Provider],
}));

const { POST } = await import("./route");

function post(body: unknown) {
  return POST(
    new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  fake.state.sent = null;
  fake.state.signal = undefined;
  fake.state.deltas = [];
  fake.state.failWith = null;
});

describe("POST /api/chat", () => {
  it("streams the reply back as text", async () => {
    fake.state.deltas = ["Hel", "lo"];

    const response = await post({
      providerId: "ollama",
      model: "qwen3:4b",
      systemPrompt: "You reply only in haiku",
      messages: [{ role: "user", content: "explain gravity" }],
    });

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("Hello");
  });

  it("puts the system prompt first and keeps the full history after it", async () => {
    fake.state.deltas = ["ok"];

    const response = await post({
      providerId: "ollama",
      model: "qwen3:4b",
      systemPrompt: "  You reply only in haiku  ",
      messages: [
        { role: "user", content: "explain gravity" },
        { role: "assistant", content: "mass draws to mass" },
        { role: "user", content: "again, shorter" },
      ],
    });
    await response.text();

    expect(fake.state.sent).toEqual([
      { role: "system", content: "You reply only in haiku" },
      { role: "user", content: "explain gravity" },
      { role: "assistant", content: "mass draws to mass" },
      { role: "user", content: "again, shorter" },
    ]);
  });

  it("omits the system message when the prompt is blank", async () => {
    fake.state.deltas = ["ok"];

    const response = await post({
      providerId: "ollama",
      model: "qwen3:4b",
      systemPrompt: "   ",
      messages: [{ role: "user", content: "hi" }],
    });
    await response.text();

    expect(fake.state.sent).toEqual([{ role: "user", content: "hi" }]);
  });

  it("forwards the request's abort signal to the provider", async () => {
    fake.state.deltas = ["ok"];

    const response = await post({
      providerId: "ollama",
      model: "qwen3:4b",
      messages: [{ role: "user", content: "hi" }],
    });
    await response.text();

    expect(fake.state.signal).toBeInstanceOf(AbortSignal);
  });

  it("answers 502 with a readable message when the provider fails", async () => {
    fake.state.failWith = new Error("fetch failed");

    const response = await post({
      providerId: "ollama",
      model: "qwen3:4b",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Ollama could not complete the request: fetch failed",
    });
  });

  it("rejects an unknown provider", async () => {
    const response = await post({
      providerId: "nope",
      model: "qwen3:4b",
      messages: [],
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Unknown provider "nope".',
    });
  });

  it("rejects a missing model", async () => {
    const response = await post({ providerId: "ollama", messages: [] });

    expect(response.status).toBe(400);
  });

  it("rejects malformed messages", async () => {
    const response = await post({
      providerId: "ollama",
      model: "qwen3:4b",
      messages: [{ role: "system", content: "sneaky" }],
    });

    expect(response.status).toBe(400);
  });
});
