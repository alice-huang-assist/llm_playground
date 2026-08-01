/**
 * ComfyUI HTTP client + fixed txt2img workflow template.
 * Parallel to Forge — not part of the chat Provider interface.
 */

import { getDatabase } from "@/lib/db/client";
import { getSetting } from "@/lib/db/settings";

export const COMFYUI_PROVIDER_ID = "comfyui";
export const COMFYUI_PROVIDER_NAME = "ComfyUI";
export const COMFYUI_BASE_URL_KEY = "comfyui_base_url";
export const DEFAULT_COMFYUI_BASE_URL = "http://127.0.0.1:8188";

export interface ComfyModel {
  id: string;
  title: string;
}

export interface ComfyTxt2ImgRequest {
  model: string;
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  sampler: string;
  /** Concrete seed (ComfyUI always wants a number). */
  seed: number;
  signal?: AbortSignal;
}

export interface ComfyImg2ImgRequest extends ComfyTxt2ImgRequest {
  /** Filename as known to ComfyUI after /upload/image. */
  imageName: string;
  denoisingStrength: number;
}

export interface ComfyTxt2ImgResult {
  imageBase64: string;
  seed: number;
}

/** Resolve configured ComfyUI base URL. */
export function resolveComfyBaseUrl(stored: string | null | undefined): string {
  const trimmed = (stored ?? "").trim().replace(/\/+$/, "");
  return trimmed === "" ? DEFAULT_COMFYUI_BASE_URL : trimmed;
}

export function getComfyBaseUrl(): string {
  return resolveComfyBaseUrl(getSetting(getDatabase(), COMFYUI_BASE_URL_KEY));
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

/**
 * Fixed CheckpointLoader → encode → EmptyLatent → KSampler → VAEDecode → SaveImage
 * workflow. Node ids stay stable so tests can assert shaping.
 */
export function buildTxt2ImgWorkflow(
  request: ComfyTxt2ImgRequest,
): Record<string, unknown> {
  return {
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: request.seed,
        steps: request.steps,
        cfg: request.cfgScale,
        sampler_name: request.sampler,
        scheduler: "normal",
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: request.model },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: {
        width: request.width,
        height: request.height,
        batch_size: 1,
      },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: request.prompt, clip: ["4", 1] },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: request.negativePrompt, clip: ["4", 1] },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: { samples: ["3", 0], vae: ["4", 2] },
    },
    "9": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: "llm_playground",
        images: ["8", 0],
      },
    },
  };
}

/**
 * Fixed LoadImage → VAEEncode → KSampler(denoise) → VAEDecode → SaveImage.
 * `imageName` is the filename returned by ComfyUI's `/upload/image`.
 */
export function buildImg2ImgWorkflow(
  request: ComfyImg2ImgRequest,
): Record<string, unknown> {
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: request.model },
    },
    "2": {
      class_type: "LoadImage",
      inputs: { image: request.imageName },
    },
    "3": {
      class_type: "VAEEncode",
      inputs: { pixels: ["2", 0], vae: ["1", 2] },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: request.prompt, clip: ["1", 1] },
    },
    "5": {
      class_type: "CLIPTextEncode",
      inputs: { text: request.negativePrompt, clip: ["1", 1] },
    },
    "6": {
      class_type: "KSampler",
      inputs: {
        seed: request.seed,
        steps: request.steps,
        cfg: request.cfgScale,
        sampler_name: request.sampler,
        scheduler: "normal",
        denoise: request.denoisingStrength,
        model: ["1", 0],
        positive: ["4", 0],
        negative: ["5", 0],
        latent_image: ["3", 0],
      },
    },
    "7": {
      class_type: "VAEDecode",
      inputs: { samples: ["6", 0], vae: ["1", 2] },
    },
    "8": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: "llm_playground_i2i",
        images: ["7", 0],
      },
    },
  };
}

async function comfyFetch(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(`${baseUrl}${path}`, init);
  if (!response.ok) {
    throw new Error(`ComfyUI returned ${response.status} for ${path}`);
  }
  return response;
}

export async function listComfyModels(
  baseUrl: string = getComfyBaseUrl(),
  signal?: AbortSignal,
): Promise<ComfyModel[]> {
  // Prefer the dedicated models endpoint; fall back to object_info.
  try {
    const response = await comfyFetch(baseUrl, "/models/checkpoints", {
      signal,
    });
    const payload = (await response.json()) as unknown;
    if (Array.isArray(payload)) {
      return payload
        .filter((name): name is string => typeof name === "string" && name !== "")
        .map((name) => ({ id: name, title: name }));
    }
  } catch {
    /* try object_info */
  }

  const response = await comfyFetch(baseUrl, "/object_info/CheckpointLoaderSimple", {
    signal,
  });
  const info = (await response.json()) as {
    CheckpointLoaderSimple?: {
      input?: { required?: { ckpt_name?: [string[]] } };
    };
  };
  const names =
    info.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? [];
  return names
    .filter((name) => typeof name === "string" && name !== "")
    .map((name) => ({ id: name, title: name }));
}

export async function listComfySamplers(
  baseUrl: string = getComfyBaseUrl(),
  signal?: AbortSignal,
): Promise<string[]> {
  const response = await comfyFetch(baseUrl, "/object_info/KSampler", {
    signal,
  });
  const info = (await response.json()) as {
    KSampler?: {
      input?: { required?: { sampler_name?: [string[]] } };
    };
  };
  const names = info.KSampler?.input?.required?.sampler_name?.[0] ?? [];
  return names.filter((name) => typeof name === "string" && name !== "");
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

export async function comfyTxt2Img(
  request: ComfyTxt2ImgRequest,
  baseUrl: string = getComfyBaseUrl(),
): Promise<ComfyTxt2ImgResult> {
  return runComfyWorkflow(buildTxt2ImgWorkflow(request), request.seed, baseUrl, request.signal);
}

export async function uploadComfyImage(
  bytes: Buffer,
  filename: string,
  baseUrl: string = getComfyBaseUrl(),
  signal?: AbortSignal,
): Promise<string> {
  const form = new FormData();
  form.append(
    "image",
    new Blob([new Uint8Array(bytes)]),
    filename,
  );
  form.append("overwrite", "true");

  const response = await fetch(`${baseUrl}/upload/image`, {
    method: "POST",
    body: form,
    signal,
  });
  if (!response.ok) {
    throw new Error(`ComfyUI upload failed with ${response.status}`);
  }
  const payload = (await response.json()) as { name?: unknown };
  if (typeof payload.name !== "string" || payload.name === "") {
    throw new Error("ComfyUI upload did not return an image name.");
  }
  return payload.name;
}

export async function comfyImg2Img(
  request: Omit<ComfyImg2ImgRequest, "imageName"> & {
    imageBytes: Buffer;
    imageFilename: string;
  },
  baseUrl: string = getComfyBaseUrl(),
): Promise<ComfyTxt2ImgResult> {
  const imageName = await uploadComfyImage(
    request.imageBytes,
    request.imageFilename,
    baseUrl,
    request.signal,
  );
  return runComfyWorkflow(
    buildImg2ImgWorkflow({ ...request, imageName }),
    request.seed,
    baseUrl,
    request.signal,
  );
}

async function runComfyWorkflow(
  workflow: Record<string, unknown>,
  seed: number,
  baseUrl: string,
  signal?: AbortSignal,
): Promise<ComfyTxt2ImgResult> {
  const clientId = crypto.randomUUID();

  const queueResponse = await comfyFetch(baseUrl, "/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    signal,
  });
  const queued = (await queueResponse.json()) as {
    prompt_id?: unknown;
    error?: unknown;
  };
  if (typeof queued.prompt_id !== "string" || queued.prompt_id === "") {
    throw new Error("ComfyUI did not return a prompt_id.");
  }
  const promptId = queued.prompt_id;

  let imageMeta: { filename: string; subfolder: string; type: string } | null =
    null;

  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const historyResponse = await comfyFetch(
      baseUrl,
      `/history/${encodeURIComponent(promptId)}`,
      { signal },
    );
    const history = (await historyResponse.json()) as Record<
      string,
      {
        status?: { status_str?: string; completed?: boolean };
        outputs?: Record<
          string,
          { images?: Array<{ filename?: string; subfolder?: string; type?: string }> }
        >;
      }
    >;

    const entry = history[promptId];
    if (entry?.outputs) {
      for (const output of Object.values(entry.outputs)) {
        const image = output.images?.[0];
        if (image?.filename) {
          imageMeta = {
            filename: image.filename,
            subfolder: image.subfolder ?? "",
            type: image.type ?? "output",
          };
          break;
        }
      }
    }

    if (imageMeta) break;

    const status = entry?.status?.status_str;
    if (status === "error") {
      throw new Error("ComfyUI reported an error while generating.");
    }

    await sleep(500, signal);
  }

  if (!imageMeta) {
    throw new Error("ComfyUI timed out waiting for an image.");
  }

  const params = new URLSearchParams({
    filename: imageMeta.filename,
    subfolder: imageMeta.subfolder,
    type: imageMeta.type,
  });
  const viewResponse = await comfyFetch(baseUrl, `/view?${params}`, {
    signal,
  });
  const bytes = Buffer.from(await viewResponse.arrayBuffer());

  return {
    imageBase64: bytes.toString("base64"),
    seed,
  };
}

export async function interruptComfy(
  baseUrl: string = getComfyBaseUrl(),
): Promise<void> {
  try {
    await fetch(`${baseUrl}/interrupt`, { method: "POST" });
  } catch {
    /* best-effort */
  }
}

/** Pick a concrete seed when the UI left it random. */
export function comfyRandomSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}
