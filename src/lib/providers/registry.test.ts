import { describe, expect, it } from "vitest";

import {
  getProviders,
  listAllProviderModels,
  localProviders,
  safeListModels,
} from "./registry";
import type { Model, Provider } from "./types";

function fakeProvider(
  id: string,
  name: string,
  result: Model[] | Error,
): Provider {
  return {
    id,
    name,
    async listModels() {
      if (result instanceof Error) throw result;
      return result;
    },
    async *chat() {
      throw new Error("not used in this test");
    },
  };
}

function model(id: string, providerId: string, providerName: string): Model {
  return { id, providerId, providerName };
}

describe("localProviders", () => {
  it("registers Ollama and LM Studio", () => {
    expect(
      localProviders.map((provider) => [provider.id, provider.name]),
    ).toEqual([
      ["ollama", "Ollama"],
      ["lmstudio", "LM Studio"],
    ]);
  });
});

describe("getProviders", () => {
  it("omits OpenRouter when no key is stored", () => {
    expect(getProviders(null).map((provider) => provider.id)).toEqual([
      "ollama",
      "lmstudio",
    ]);
  });

  it("omits OpenRouter for an empty key", () => {
    expect(getProviders("").map((provider) => provider.id)).toEqual([
      "ollama",
      "lmstudio",
    ]);
  });

  it("appends OpenRouter once a key is present", () => {
    expect(getProviders("sk-or-test").map((provider) => provider.id)).toEqual([
      "ollama",
      "lmstudio",
      "openrouter",
    ]);
  });

  it("leaves the local providers untouched either way", () => {
    expect(getProviders(null)).toEqual(localProviders);
    expect(getProviders("sk-or-test").slice(0, 2)).toEqual(localProviders);
  });
});

describe("safeListModels", () => {
  it("reports a reachable provider's models", async () => {
    const models = [model("qwen3:4b", "ollama", "Ollama")];

    await expect(
      safeListModels(fakeProvider("ollama", "Ollama", models)),
    ).resolves.toEqual({
      providerId: "ollama",
      providerName: "Ollama",
      reachable: true,
      models,
    });
  });

  it("turns a connection refusal into an unreachable result, not a throw", async () => {
    const refused = fakeProvider(
      "lmstudio",
      "LM Studio",
      new Error("fetch failed: ECONNREFUSED"),
    );

    await expect(safeListModels(refused)).resolves.toEqual({
      providerId: "lmstudio",
      providerName: "LM Studio",
      reachable: false,
      error: "fetch failed: ECONNREFUSED",
    });
  });
});

describe("listAllProviderModels", () => {
  it("aggregates across providers and tolerates one failing", async () => {
    const ollamaModels = [
      model("qwen3:4b", "ollama", "Ollama"),
      model("tinyllama", "ollama", "Ollama"),
    ];

    const results = await listAllProviderModels([
      fakeProvider("ollama", "Ollama", ollamaModels),
      fakeProvider("lmstudio", "LM Studio", new Error("ECONNREFUSED")),
    ]);

    expect(results).toEqual([
      {
        providerId: "ollama",
        providerName: "Ollama",
        reachable: true,
        models: ollamaModels,
      },
      {
        providerId: "lmstudio",
        providerName: "LM Studio",
        reachable: false,
        error: "ECONNREFUSED",
      },
    ]);
  });

  it("keeps providers in registration order", async () => {
    const results = await listAllProviderModels([
      fakeProvider("a", "A", []),
      fakeProvider("b", "B", []),
      fakeProvider("c", "C", []),
    ]);

    expect(results.map((result) => result.providerId)).toEqual(["a", "b", "c"]);
  });
});
