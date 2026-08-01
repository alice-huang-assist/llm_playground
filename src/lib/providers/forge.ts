/**
 * Forge / A1111-compatible `/sdapi/v1` client for local image generation.
 * Separate from the chat `Provider` interface — txt2img is not chat.
 */

import { getDatabase } from "@/lib/db/client";
import { getSetting } from "@/lib/db/settings";
import {
  DEFAULT_FORGE_BASE_URL,
  FORGE_BASE_URL_KEY,
  FORGE_PROVIDER_ID,
  FORGE_PROVIDER_NAME,
  normalizeForgeBaseUrl,
  resolveForgeBaseUrl,
} from "@/lib/providers/forge-shared";
import {
  progressPercentFromRatio,
  type ImageGenerationProgress,
} from "@/lib/providers/image-progress";

export {
  DEFAULT_FORGE_BASE_URL,
  FORGE_BASE_URL_KEY,
  FORGE_PROVIDER_ID,
  FORGE_PROVIDER_NAME,
  normalizeForgeBaseUrl,
  resolveForgeBaseUrl,
};

export type { ImageGenerationProgress };

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
  onProgress?: (progress: ImageGenerationProgress) => void;
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

export function getForgeBaseUrl(): string {
  return resolveForgeBaseUrl(getSetting(getDatabase(), FORGE_BASE_URL_KEY));
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
    baseUrl,
    "/sdapi/v1/txt2img",
    buildTxt2ImgPayload(request),
    request.signal,
    "txt2img",
    request.onProgress,
  );
}

export async function forgeImg2Img(
  request: Img2ImgRequest,
  baseUrl: string = getForgeBaseUrl(),
): Promise<Txt2ImgResult> {
  return forgeGenerateImage(
    baseUrl,
    "/sdapi/v1/img2img",
    buildImg2ImgPayload(request),
    request.signal,
    "img2img",
    request.onProgress,
  );
}

/** Parse Forge `/sdapi/v1/progress` JSON into a progress event. Exported for tests. */
export function parseForgeProgressPayload(
  payload: unknown,
): ImageGenerationProgress | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as {
    progress?: unknown;
    current_image?: unknown;
  };
  if (typeof row.progress !== "number" || !Number.isFinite(row.progress)) {
    return null;
  }
  const percent = progressPercentFromRatio(row.progress);
  const currentImageBase64 =
    typeof row.current_image === "string" && row.current_image !== ""
      ? row.current_image
      : undefined;
  return currentImageBase64
    ? { percent, currentImageBase64 }
    : { percent };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function pollForgeProgress(
  baseUrl: string,
  onProgress: (progress: ImageGenerationProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  let lastImage: string | undefined;
  while (!signal?.aborted) {
    try {
      const payload = await forgeGet<unknown>(
        baseUrl,
        "/sdapi/v1/progress",
        signal,
      );
      const event = parseForgeProgressPayload(payload);
      if (event) {
        if (
          event.currentImageBase64 !== undefined &&
          event.currentImageBase64 === lastImage
        ) {
          onProgress({ percent: event.percent });
        } else {
          if (event.currentImageBase64 !== undefined) {
            lastImage = event.currentImageBase64;
          }
          onProgress(event);
        }
      }
    } catch {
      if (signal?.aborted) return;
      /* progress is best-effort while txt2img runs */
    }
    try {
      await sleep(500, signal);
    } catch {
      return;
    }
  }
}

async function forgeGenerateImage(
  baseUrl: string,
  path: string,
  body: unknown,
  signal: AbortSignal | undefined,
  label: string,
  onProgress?: (progress: ImageGenerationProgress) => void,
): Promise<Txt2ImgResult> {
  const pollController = new AbortController();
  const stopPolling = () => {
    if (!pollController.signal.aborted) pollController.abort();
  };
  if (signal) {
    if (signal.aborted) stopPolling();
    else signal.addEventListener("abort", stopPolling, { once: true });
  }

  const pollTask =
    onProgress !== undefined
      ? pollForgeProgress(baseUrl, onProgress, pollController.signal)
      : Promise.resolve();

  try {
    const response = await fetch(`${baseUrl}${path}`, {
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
    if (
      !Array.isArray(images) ||
      typeof images[0] !== "string" ||
      images[0] === ""
    ) {
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
  } finally {
    stopPolling();
    await pollTask.catch(() => undefined);
  }
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
