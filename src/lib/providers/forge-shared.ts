/**
 * Forge identifiers and pure URL helpers. Safe to import from client
 * components — no database or Node built-ins here.
 */

export const FORGE_PROVIDER_ID = "forge";
export const FORGE_PROVIDER_NAME = "Forge";
export const FORGE_BASE_URL_KEY = "forge_base_url";
export const DEFAULT_FORGE_BASE_URL = "http://127.0.0.1:7860";

/** Resolve the configured Forge base URL, falling back to the localhost default. */
export function resolveForgeBaseUrl(stored: string | null | undefined): string {
  const trimmed = (stored ?? "").trim().replace(/\/+$/, "");
  return trimmed === "" ? DEFAULT_FORGE_BASE_URL : trimmed;
}

export function normalizeForgeBaseUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed === "") return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return trimmed;
}
