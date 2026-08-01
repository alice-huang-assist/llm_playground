/**
 * Forge / A1111-compatible `/sdapi/v1` client for local image generation.
 * Separate from the chat `Provider` interface — txt2img is not chat.
 */

import { getDatabase } from "@/lib/db/client";
import { getSetting } from "@/lib/db/settings";

import {
  FORGE_BASE_URL_KEY,
  DEFAULT_FORGE_BASE_URL,
} from "./forge-shared";

export {
  FORGE_BASE_URL_KEY,
  FORGE_PROVIDER_ID,
  FORGE_PROVIDER_NAME,
  DEFAULT_FORGE_BASE_URL,
} from "./forge-shared";

export interface ForgeModel {
  id: string;
  title: string;
}

export interface Txt2ImgRequest {
  model: string;
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  sampler: string;
  /** Forge uses -1 for random. */
  seed: number;
  signal?: AbortSignal;
}

export interface Img2ImgRequest extends Txt2ImgRequest {
  /** Raw base64 image (no data-URL prefix). */
  initImageBase64: string;
  denoisingStrength: number;
}

export interface Txt2ImgResult {
  imageBase64: string;
  seed: number | null;
}

export interface ForgeTxt2ImgPayload {
  prompt: string;
  negative_prompt: string;
  width: number;
  height: number;
  steps: number;
  cfg_scale: number;
  sampler_name: string;
  seed: number;
  override_settings: { sd_model_checkpoint: string };
  override_settings_restore_afterwards: true;
}

export interface ForgeImg2ImgPayload extends ForgeTxt2ImgPayload {
  init_images: string[];
  denoising_strength: number;
}

/** Resolve the configured Forge base URL, falling back to the localhost default. */
export function resolveForgeBaseUrl(stored: string | null | undefined): string {
  const trimmed = (stored ?? "").trim().replace(/\/+$/, "");
  return trimmed === "" ? DEFAULT_FORGE_BASE_URL : trimmed;
}

export function getForgeBaseUrl(): string {
  return resolveForgeBaseUrl(getSetting(getDatabase(), FORGE_BASE_URL_KEY));
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

/** Shape the A1111 txt2img body. Exported for unit tests. */
export function buildTxt2ImgPayload(request: Txt2ImgRequest): ForgeTxt2ImgPayload {
  return {
    prompt: request.prompt,
    negative_prompt: request.negativePrompt,
    width: request.width,
    height: request.height,
    steps: request.steps,
    cfg_scale: request.cfgScale,
    sampler_name: request.sampler,
    seed: request.seed,
    override_settings: {
      sd_model_checkpoint: request.model,
    },
    override_settings_restore_afterwards: true,
  };
}

/** Shape the A1111 img2img body. Exported for unit tests. */
export function buildImg2ImgPayload(request: Img2ImgRequest): ForgeImg2ImgPayload {
  return {
    ...buildTxt2ImgPayload(request),
    init_images: [request.initImageBase64],
    denoising_strength: request.denoisingStrength,
  };
}

async function forgeGet<T>(
  baseUrl: string,
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { signal });
  if (!response.ok) {
    throw new Error(`Forge returned ${response.status} for ${path}`);
  }
  return (await response.json()) as T;
}

export async function listForgeModels(
  baseUrl: string = getForgeBaseUrl(),
  signal?: AbortSignal,
): Promise<ForgeModel[]> {
  const rows = await forgeGet<
    Array<{ title?: unknown; model_name?: unknown }>
  >(baseUrl, "/sdapi/v1/sd-models", signal);

  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => {
      const id =
        typeof row.model_name === "string" && row.model_name.trim() !== ""
          ? row.model_name
          : typeof row.title === "string"
            ? row.title
            : "";
      if (id === "") return null;
      const title =
        typeof row.title === "string" && row.title.trim() !== ""
          ? row.title
          : id;
      return { id, title };
    })
    .filter((model): model is ForgeModel => model !== null);
}

export async function listForgeSamplers(
  baseUrl: string = getForgeBaseUrl(),
  signal?: AbortSignal,
): Promise<string[]> {
  const rows = await forgeGet<Array<{ name?: unknown }>>(
    baseUrl,
    "/sdapi/v1/samplers",
    signal,
  );
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => (typeof row.name === "string" ? row.name : ""))
    .filter((name) => name !== "");
}

export async function forgeTxt2Img(
  request: Txt2ImgRequest,
  baseUrl: string = getForgeBaseUrl(),
): Promise<Txt2ImgResult> {
  return forgeGenerateImage(
    `${baseUrl}/sdapi/v1/txt2img`,
    buildTxt2ImgPayload(request),
    request.signal,
    "txt2img",
  );
}

export async function forgeImg2Img(
  request: Img2ImgRequest,
  baseUrl: string = getForgeBaseUrl(),
): Promise<Txt2ImgResult> {
  return forgeGenerateImage(
    `${baseUrl}/sdapi/v1/img2img`,
    buildImg2ImgPayload(request),
    request.signal,
    "img2img",
  );
}

async function forgeGenerateImage(
  url: string,
  body: unknown,
  signal: AbortSignal | undefined,
  label: string,
): Promise<Txt2ImgResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.text()).slice(0, 200);
    } catch {
      /* ignore */
    }
    throw new Error(
      `Forge ${label} failed with ${response.status}${detail ? `: ${detail}` : ""}`,
    );
  }

  const payload = (await response.json()) as {
    images?: unknown;
    info?: unknown;
  };

  const images = payload.images;
  if (!Array.isArray(images) || typeof images[0] !== "string" || images[0] === "") {
    throw new Error("Forge returned no image data.");
  }

  let seed: number | null = null;
  if (typeof payload.info === "string") {
    try {
      const info = JSON.parse(payload.info) as { seed?: unknown };
      if (typeof info.seed === "number" && Number.isFinite(info.seed)) {
        seed = Math.trunc(info.seed);
      }
    } catch {
      /* info is best-effort */
    }
  }

  return { imageBase64: images[0], seed };
}

/** Best-effort cancel of an in-flight Forge job. */
export async function interruptForge(
  baseUrl: string = getForgeBaseUrl(),
): Promise<void> {
  try {
    await fetch(`${baseUrl}/sdapi/v1/interrupt`, { method: "POST" });
  } catch {
    /* cancel is best-effort */
  }
}
