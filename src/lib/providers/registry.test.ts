import { describe, expect, it } from "vitest";

import {
  listAllProviderModels,
  providers,
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
    async chat() {
      throw new Error("not used in this test");
    },
  };
}

function model(id: string, providerId: string, providerName: string): Model {
  return { id, providerId, providerName };
}

describe("providers", () => {
  it("registers Ollama and LM Studio", () => {
    expect(providers.map((provider) => [provider.id, provider.name])).toEqual([
      ["ollama", "Ollama"],
      ["lmstudio", "LM Studio"],
    ]);
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
