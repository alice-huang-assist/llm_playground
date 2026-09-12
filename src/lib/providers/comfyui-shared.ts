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

/**
 * Z-Image / Z-Image-Turbo live under ComfyUI `diffusion_models/`, not
 * checkpoints. Name match covers `z_image_turbo_bf16.safetensors` and similar.
 */
export function isZImageModel(model: string): boolean {
  return /z[_-]?image/i.test(model);
}

/** Recommended sampler / steps / CFG when the user picks a Z-Image model. */
export const Z_IMAGE_DEFAULT_STEPS = 8;
export const Z_IMAGE_DEFAULT_CFG = 1;
export const Z_IMAGE_DEFAULT_SAMPLER = "res_multistep";

/**
 * Flux.1 / Fluxed Up split UNET weights live under `diffusion_models/` (no
 * baked CLIP/VAE). Covers `fluxedUpFluxNSFW_71FP16.safetensors`, `flux1-dev`, etc.
 */
export function isFluxModel(model: string): boolean {
  return /fluxed[_-]?up|flux1[_.-]|flux\.1/i.test(model);
}

/**
 * Fluxed Up creator defaults (Civitai 847101 / showcase post): DPM++ 2M + beta
 * scheduler. CFG maps to FluxGuidance; KSampler CFG stays 1.
 */
export const FLUX_DEFAULT_STEPS = 28;
export const FLUX_DEFAULT_CFG = 3.5;
export const FLUX_DEFAULT_SAMPLER = "dpmpp_2m";

/**
 * Wan2.2 T2V MoE (Comfy-Org split files under `diffusion_models/`).
 * Covers `wan2.2_t2v_high_noise_14B_fp16.safetensors` and siblings.
 */
export function isWanT2VModel(model: string): boolean {
  return /wan2\.?2.*t2v/i.test(model);
}

/** High-noise expert — preferred list id; low-noise is paired by name. */
export function isWanT2VHighNoiseModel(model: string): boolean {
  return isWanT2VModel(model) && /high[_-]?noise/i.test(model);
}

/** Map a Wan T2V filename to the high-noise twin used as the UI model id. */
export function wanT2VCanonicalModel(model: string): string {
  if (!isWanT2VModel(model)) return model;
  return model.replace(/low([_-]?noise)/i, "high$1");
}

/** Derive the low-noise expert filename from the high-noise (or either) name. */
export function wanT2VLowNoiseSibling(model: string): string {
  const high = wanT2VCanonicalModel(model);
  const low = high.replace(/high([_-]?noise)/i, "low$1");
  if (low === high) {
    throw new Error(
      `Wan T2V model "${model}" must include high_noise / low_noise in the filename so the MoE pair can be resolved.`,
    );
  }
  return low;
}

/**
 * Official ComfyUI Wan2.2 14B T2V template defaults (Lightning LoRA off):
 * euler + simple, 20 steps split across high/low experts, 640², ~5s @ 16fps.
 */
export const WAN_T2V_DEFAULT_STEPS = 20;
export const WAN_T2V_DEFAULT_CFG = 3.5;
export const WAN_T2V_DEFAULT_SAMPLER = "euler";
export const WAN_T2V_DEFAULT_WIDTH = 640;
export const WAN_T2V_DEFAULT_HEIGHT = 640;