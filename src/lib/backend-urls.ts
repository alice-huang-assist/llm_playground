import {
  DEFAULT_COMFYUI_BASE_URL,
  normalizeComfyBaseUrl,
} from "@/lib/providers/comfyui-shared";
import {
  DEFAULT_FORGE_BASE_URL,
  normalizeForgeBaseUrl,
} from "@/lib/providers/forge-shared";

export interface BackendUrls {
  forgeUrl: string;
  comfyUrl: string;
}

/**
 * Resolve the Forge and ComfyUI base URLs the app shell should link to, from a
 * `/api/settings` payload.
 *
 * Every failure mode collapses to the shared default rather than to an empty or
 * broken href: a missing payload, a missing field, or a value the provider's
 * normaliser rejects. `/api/settings` already refuses to store a malformed URL,
 * so this is the second line of defence rather than the only one — but the
 * shell renders links on the first paint, before any response has arrived, and
 * those must point somewhere real.
 */
export function resolveBackendUrls(payload: unknown): BackendUrls {
  const record =
    typeof payload === "object" && payload !== null
      ? (payload as {
          forge?: { baseUrl?: unknown };
          comfyui?: { baseUrl?: unknown };
        })
      : {};

  return {
    forgeUrl:
      normalizeForgeBaseUrl(record.forge?.baseUrl) ?? DEFAULT_FORGE_BASE_URL,
    comfyUrl:
      normalizeComfyBaseUrl(record.comfyui?.baseUrl) ??
      DEFAULT_COMFYUI_BASE_URL,
  };
}

export const DEFAULT_BACKEND_URLS: BackendUrls = {
  forgeUrl: DEFAULT_FORGE_BASE_URL,
  comfyUrl: DEFAULT_COMFYUI_BASE_URL,
};
