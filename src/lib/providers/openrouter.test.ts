import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OPENROUTER_PROVIDER_ID,
  createOpenRouterProvider,
  isOpenWeightModel,
  maskApiKey,
  verifyApiKey,
} from "./openrouter";

const KEY = "sk-or-v1-secret-value-1234";

function mockFetch(implementation: typeof fetch) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(implementation);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isOpenWeightModel", () => {
  it("accepts open-weight families", () => {
    for (const id of [
      "meta-llama/llama-3.3-70b-instruct",
      "qwen/qwen3-235b-a22b",
      "deepseek/deepseek-r1",
      "mistralai/mistral-large",
      "google/gemma-3-27b-it",
      "microsoft/phi-4",
      "nousresearch/hermes-3-llama-3.1-405b",
    ]) {
      expect(isOpenWeightModel(id), id).toBe(true);
    }
  });

  it("rejects the proprietary models the project rules out", () => {
    for (const id of [
      "openai/gpt-4o",
      "openai/o3",
      "anthropic/claude-sonnet-4",
      "google/gemini-2.5-pro",
      "x-ai/grok-4",
      "cohere/command-r-plus",
      "perplexity/sonar",
    ]) {
      expect(isOpenWeightModel(id), id).toBe(false);
    }
  });

  it("separates Gemma from Gemini, which share a vendor", () => {
    expect(isOpenWeightModel("google/gemma-2-9b-it")).toBe(true);
    expect(isOpenWeightModel("google/gemini-flash-1.5")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isOpenWeightModel("Meta-Llama/Llama-3.3-70B")).toBe(true);
  });

  it("rejects anything it does not recognise, rather than letting it through", () => {
    expect(isOpenWeightModel("brand-new-vendor/mystery-model")).toBe(false);
    expect(isOpenWeightModel("")).toBe(false);
  });
});

describe("maskApiKey", () => {
  it("keeps only the last four characters", () => {
    expect(maskApiKey(KEY)).toBe("…1234");
  });

  it("never leaks a short key", () => {
    expect(maskApiKey("abcd")).toBe("…");
    expect(maskApiKey("ab")).toBe("…");
  });

  it("reveals nothing else of the key", () => {
    expect(maskApiKey(KEY)).not.toContain("secret");
    expect(KEY.startsWith(maskApiKey(KEY))).toBe(false);
  });
});

describe("createOpenRouterProvider", () => {
  it("authenticates and lists only open-weight models", async () => {
    const fetchSpy = mockFetch(async () =>
      Response.json({
        data: [
          { id: "meta-llama/llama-3.3-70b-instruct" },
          { id: "openai/gpt-4o" },
          { id: "qwen/qwen3-32b" },
          { id: "anthropic/claude-sonnet-4" },
        ],
      }),
    );

    const models = await createOpenRouterProvider(KEY).listModels();

    expect(models.map((model) => model.id)).toEqual([
      "meta-llama/llama-3.3-70b-instruct",
      "qwen/qwen3-32b",
    ]);
    expect(models.every((model) => model.providerName === "OpenRouter")).toBe(
      true,
    );

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/models");
    expect(
      (init?.headers as Record<string, string>).Authorization,
    ).toBe(`Bearer ${KEY}`);
  });

  it("uses the same streaming chat path as a local provider", async () => {
    const encoder = new TextEncoder();
    const fetchSpy = mockFetch(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    choices: [{ delta: { content: "hi" } }],
                  })}\n\ndata: [DONE]\n\n`,
                ),
              );
              controller.close();
            },
          }),
        ),
    );

    const out: string[] = [];
    for await (const delta of createOpenRouterProvider(KEY).chat({
      model: "qwen/qwen3-32b",
      messages: [{ role: "user", content: "hi" }],
    })) {
      out.push(delta);
    }

    expect(out).toEqual(["hi"]);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(
      (init?.headers as Record<string, string>).Authorization,
    ).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(String(init?.body)).stream).toBe(true);
  });

  it("carries the provider id the picker tags models with", () => {
    expect(createOpenRouterProvider(KEY).id).toBe(OPENROUTER_PROVIDER_ID);
  });
});

describe("verifyApiKey", () => {
  it("accepts a key OpenRouter recognises", async () => {
    mockFetch(async () => Response.json({ data: { label: "test" } }));

    await expect(verifyApiKey(KEY)).resolves.toEqual({ valid: true });
  });

  it("reports a rejected key without echoing it", async () => {
    mockFetch(async () => new Response("", { status: 401 }));

    const verdict = await verifyApiKey(KEY);

    expect(verdict).toEqual({
      valid: false,
      error: "OpenRouter rejected that key.",
    });
    expect(JSON.stringify(verdict)).not.toContain("secret");
  });

  it("reports an unreachable network without echoing the key", async () => {
    mockFetch(async () => {
      throw new Error(`fetch failed for ${KEY}`);
    });

    const verdict = await verifyApiKey(KEY);

    expect(verdict).toEqual({
      valid: false,
      error: "Could not reach OpenRouter. Check your network and try again.",
    });
    expect(JSON.stringify(verdict)).not.toContain(KEY);
  });

  it("reports an unexpected status without echoing the key", async () => {
    mockFetch(async () => new Response("", { status: 500 }));

    const verdict = await verifyApiKey(KEY);

    expect(verdict).toMatchObject({ valid: false });
    expect(JSON.stringify(verdict)).not.toContain("secret");
  });
});
