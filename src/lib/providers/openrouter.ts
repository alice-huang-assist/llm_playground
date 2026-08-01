import { OpenAICompatibleProvider } from "./openai-compatible";
import type { Provider } from "./types";

export const OPENROUTER_PROVIDER_ID = "openrouter";
export const OPENROUTER_NAME = "OpenRouter";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** Settings key the API stores the credential under. */
export const OPENROUTER_API_KEY = "openrouter_api_key";

/**
 * OpenRouter model ids are `vendor/model`, and its catalogue is mostly closed
 * models this playground does not want. An allowlist of open-weight vendors is
 * deliberate: the failure mode is missing a model, not smuggling a proprietary
 * one past the project's open-weight-only rule.
 *
 * `google` is absent because it publishes both Gemma (open) and Gemini
 * (closed); Gemma is matched by its own prefix instead.
 */
export const OPEN_WEIGHT_PREFIXES = [
  "ai21/",
  "allenai/",
  "alibaba/",
  "deepseek/",
  "google/gemma",
  "ibm-granite/",
  "meta-llama/",
  "microsoft/phi",
  "mistralai/",
  "moonshotai/",
  "nousresearch/",
  "nvidia/",
  "openchat/",
  "qwen/",
  "sao10k/",
  "thudm/",
  "tngtech/",
  "z-ai/",
];

/** True when a model id belongs to a family that publishes its weights. */
export function isOpenWeightModel(id: string): boolean {
  const normalised = id.toLowerCase();
  return OPEN_WEIGHT_PREFIXES.some((prefix) => normalised.startsWith(prefix));
}

/**
 * A hint the settings screen can show without ever handling the credential:
 * enough to recognise which key is stored, useless to anyone who sees it.
 */
export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 4) return "…";
  return `…${trimmed.slice(-4)}`;
}

export function createOpenRouterProvider(apiKey: string): Provider {
  return new OpenAICompatibleProvider({
    id: OPENROUTER_PROVIDER_ID,
    name: OPENROUTER_NAME,
    baseUrl: OPENROUTER_BASE_URL,
    headers: { Authorization: `Bearer ${apiKey}` },
    includeModel: isOpenWeightModel,
  });
}

/**
 * Check a key against OpenRouter before storing it, so a typo surfaces on the
 * settings screen rather than as an empty model list later. The key is only
 * ever sent to OpenRouter; nothing about it reaches the returned message.
 */
export async function verifyApiKey(
  apiKey: string,
): Promise<{ valid: true } | { valid: false; error: string }> {
  let response: Response;
  try {
    response = await fetch(`${OPENROUTER_BASE_URL}/key`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
  } catch {
    return {
      valid: false,
      error: "Could not reach OpenRouter. Check your network and try again.",
    };
  }

  if (response.status === 401 || response.status === 403) {
    return { valid: false, error: "OpenRouter rejected that key." };
  }

  if (!response.ok) {
    return {
      valid: false,
      error: `OpenRouter returned ${response.status} ${response.statusText}.`,
    };
  }

  return { valid: true };
}
