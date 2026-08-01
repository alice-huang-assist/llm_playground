import { OpenAICompatibleProvider } from "./openai-compatible";
import type { Provider, ProviderModels } from "./types";

/** Every provider the playground knows about, in display order. */
export const providers: Provider[] = [
  new OpenAICompatibleProvider({
    id: "ollama",
    name: "Ollama",
    baseUrl: "http://localhost:11434/v1",
  }),
  new OpenAICompatibleProvider({
    id: "lmstudio",
    name: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
  }),
];

/**
 * List one provider's models without throwing: a server that is not running
 * becomes an unreachable result rather than an error the caller must handle.
 */
export async function safeListModels(
  provider: Provider,
): Promise<ProviderModels> {
  try {
    return {
      providerId: provider.id,
      providerName: provider.name,
      reachable: true,
      models: await provider.listModels(),
    };
  } catch (error) {
    return {
      providerId: provider.id,
      providerName: provider.name,
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Aggregate model listings across providers. One provider being down never
 * prevents the others from listing.
 */
export async function listAllProviderModels(
  list: Provider[] = providers,
): Promise<ProviderModels[]> {
  return Promise.all(list.map(safeListModels));
}
