import { getDatabase } from "@/lib/db/client";
import { getSetting } from "@/lib/db/settings";

import { OLLAMA_HOST, OLLAMA_PROVIDER_ID } from "./ollama";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { OPENROUTER_API_KEY, createOpenRouterProvider } from "./openrouter";
import type { Provider, ProviderModels } from "./types";

/** The runtimes that are always present, in display order. */
export const localProviders: Provider[] = [
  new OpenAICompatibleProvider({
    id: OLLAMA_PROVIDER_ID,
    name: "Ollama",
    baseUrl: `${OLLAMA_HOST}/v1`,
  }),
  new OpenAICompatibleProvider({
    id: "lmstudio",
    name: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
  }),
];

/**
 * Build the provider list for this request. OpenRouter only exists when a key
 * has been saved, so with no key the app is exactly what it was before.
 *
 * Reading the key here — server side, per request — is why it never has to be
 * held anywhere the browser can reach.
 */
export function getProviders(apiKey?: string | null): Provider[] {
  const key =
    apiKey === undefined
      ? getSetting(getDatabase(), OPENROUTER_API_KEY)
      : apiKey;

  return key ? [...localProviders, createOpenRouterProvider(key)] : localProviders;
}

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
  list: Provider[] = getProviders(),
): Promise<ProviderModels[]> {
  return Promise.all(list.map(safeListModels));
}
