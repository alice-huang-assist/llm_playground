/**
 * ComfyUI identifiers and pure URL helpers. Safe to import from client
 * components — no database or Node built-ins here.
 */

export const COMFYUI_PROVIDER_ID = "comfyui";
export const COMFYUI_PROVIDER_NAME = "ComfyUI";
export const COMFYUI_BASE_URL_KEY = "comfyui_base_url";
export const DEFAULT_COMFYUI_BASE_URL = "http://127.0.0.1:8188";

/** Resolve configured ComfyUI base URL. */
export function resolveComfyBaseUrl(stored: string | null | undefined): string {
  const trimmed = (stored ?? "").trim().replace(/\/+$/, "");
  return trimmed === "" ? DEFAULT_COMFYUI_BASE_URL : trimmed;
}

export function normalizeComfyBaseUrl(value: unknown): string | null {
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
