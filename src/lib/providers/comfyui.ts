/**
 * ComfyUI HTTP client + fixed txt2img workflow template.
 * Parallel to Forge — not part of the chat Provider interface.
 */

import { getDatabase } from "@/lib/db/client";
import { getSetting } from "@/lib/db/settings";
import {
  COMFYUI_BASE_URL_KEY,
  COMFYUI_PROVIDER_ID,
  COMFYUI_PROVIDER_NAME,
  DEFAULT_COMFYUI_BASE_URL,
  isFluxModel,
  isWanT2VHighNoiseModel,
  isWanT2VModel,
  isZImageModel,
  normalizeComfyBaseUrl,
  resolveComfyBaseUrl,
  wanT2VCanonicalModel,
  wanT2VLowNoiseSibling,
} from "@/lib/providers/comfyui-shared";
import {
  progressPercentFromCounts,
  type ImageGenerationProgress,
} from "@/lib/providers/image-progress";

export {
  COMFYUI_BASE_URL_KEY,
  COMFYUI_PROVIDER_ID,
  COMFYUI_PROVIDER_NAME,
  DEFAULT_COMFYUI_BASE_URL,
  isFluxModel,
  isWanT2VHighNoiseModel,
  isWanT2VModel,
  isZImageModel,
  normalizeComfyBaseUrl,
  resolveComfyBaseUrl,
  wanT2VCanonicalModel,
  wanT2VLowNoiseSibling,
};

export type { ImageGenerationProgress };

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
  onProgress?: (progress: ImageGenerationProgress) => void;
}

export interface ComfyImg2ImgRequest extends ComfyTxt2ImgRequest {
  /** Filename as known to ComfyUI after /upload/image. */
  imageName: string;
  denoisingStrength: number;
}

export type ComfyMediaKind = "image" | "video";

export interface ComfyTxt2ImgResult {
  imageBase64: string;
  seed: number;
  /** Defaults to image (PNG). Wan T2V returns video (MP4). */
  mediaKind?: ComfyMediaKind;
}

export function getComfyBaseUrl(): string {
  return resolveComfyBaseUrl(getSetting(getDatabase(), COMFYUI_BASE_URL_KEY));
}

/**
 * SD3/SD3.5 checkpoints need a different graph than SD1.x/SDXL: most ship with
 * no text encoders, and their latent has 16 channels instead of 4.
 */
export function isSd3Checkpoint(model: string): boolean {
  return /(^|[^a-z0-9])sd_?3(\.\d+)?([^a-z0-9]|$)/i.test(model);
}

/** Comfy-Org `*_incl_clips_*` builds embed the encoders in the checkpoint. */
export function sd3HasBundledClips(model: string): boolean {
  return /incl_clips/i.test(model);
}

/** TripleCLIPLoader's "sd3" recipe: clip-l, clip-g, t5. */
const SD3_TEXT_ENCODERS = [
  "clip_l.safetensors",
  "clip_g.safetensors",
  "t5xxl_fp16.safetensors",
] as const;

const SD3_SAMPLING_SHIFT = 3;

/** Comfy-Org z_image_turbo split_files companions. */
const Z_IMAGE_TEXT_ENCODER = "qwen_3_4b.safetensors";
const Z_IMAGE_VAE = "ae.safetensors";
const Z_IMAGE_SAMPLING_SHIFT = 3;
const Z_IMAGE_SCHEDULER = "simple";

/** Flux.1 D split-file companions (Fluxed Up / official Flux Dev). */
const FLUX_CLIP_L = "clip_l.safetensors";
const FLUX_T5 = "t5xxl_fp16.safetensors";
const FLUX_VAE = "ae.safetensors";
/** Fluxed Up recommended scheduler; KSampler CFG must stay 1 with FluxGuidance. */
const FLUX_SCHEDULER = "beta";
const FLUX_KSAMPLER_CFG = 1;

/**
 * NexBlend 01 Asian Realistic LoRA (Flux.1 D) — Civitai 2545815 / v2.0.
 * Place under ComfyUI `models/loras/Flux/`.
 */
const FLUX_NEXBLEND_LORA =
  "Flux/NexBlend 01 Asian Realistic Flux.safetensors";
const FLUX_NEXBLEND_STRENGTH = 0.8;
const FLUX_NEXBLEND_TRIGGER = "nexblend";

/** Comfy-Org Wan 2.2 T2V split-file companions (see docs.comfy.org Wan2.2). */
const WAN_T2V_CLIP = "umt5_xxl_fp16.safetensors";
const WAN_T2V_VAE = "wan_2.1_vae.safetensors";
const WAN_T2V_SCHEDULER = "simple";
const WAN_T2V_SAMPLING_SHIFT = 5;
/** Official template: 5s @ 16fps → length = floor(5*16)+1 = 81. */
const WAN_T2V_FPS = 16;
const WAN_T2V_LENGTH = 81;

/** Ensure the NexBlend trigger word is present in the positive prompt. */
export function withFluxNexblendTrigger(prompt: string): string {
  if (/\bnexblend\b/i.test(prompt)) return prompt;
  const trimmed = prompt.trim();
  return trimmed === ""
    ? FLUX_NEXBLEND_TRIGGER
    : `${FLUX_NEXBLEND_TRIGGER} ${trimmed}`;
}

/**
 * MoE text-to-video graph matching ComfyUI's Wan2.2 14B T2V template
 * (Lightning LoRA off): high-noise then low-noise KSamplerAdvanced → CreateVideo.
 */
function buildWanT2VWorkflow(
  request: ComfyTxt2ImgRequest,
): Record<string, unknown> {
  const highNoise = wanT2VCanonicalModel(request.model);
  const lowNoise = wanT2VLowNoiseSibling(highNoise);
  const splitStep = Math.max(1, Math.floor(request.steps / 2));

  return {
    "1": {
      class_type: "UNETLoader",
      inputs: {
        unet_name: highNoise,
        weight_dtype: "default",
      },
    },
    "2": {
      class_type: "UNETLoader",
      inputs: {
        unet_name: lowNoise,
        weight_dtype: "default",
      },
    },
    "3": {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: WAN_T2V_CLIP,
        type: "wan",
        device: "default",
      },
    },
    "4": {
      class_type: "VAELoader",
      inputs: { vae_name: WAN_T2V_VAE },
    },
    "5": {
      class_type: "ModelSamplingSD3",
      inputs: { model: ["1", 0], shift: WAN_T2V_SAMPLING_SHIFT },
    },
    "6": {
      class_type: "ModelSamplingSD3",
      inputs: { model: ["2", 0], shift: WAN_T2V_SAMPLING_SHIFT },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: request.prompt, clip: ["3", 0] },
    },
    "8": {
      class_type: "CLIPTextEncode",
      inputs: { text: request.negativePrompt, clip: ["3", 0] },
    },
    "9": {
      class_type: "EmptyHunyuanLatentVideo",
      inputs: {
        width: request.width,
        height: request.height,
        length: WAN_T2V_LENGTH,
        batch_size: 1,
      },
    },
    "10": {
      class_type: "KSamplerAdvanced",
      inputs: {
        add_noise: "enable",
        noise_seed: request.seed,
        steps: request.steps,
        cfg: request.cfgScale,
        sampler_name: request.sampler,
        scheduler: WAN_T2V_SCHEDULER,
        start_at_step: 0,
        end_at_step: splitStep,
        return_with_leftover_noise: "enable",
        model: ["5", 0],
        positive: ["7", 0],
        negative: ["8", 0],
        latent_image: ["9", 0],
      },
    },
    "11": {
      class_type: "KSamplerAdvanced",
      inputs: {
        add_noise: "disable",
        noise_seed: 0,
        steps: request.steps,
        cfg: request.cfgScale,
        sampler_name: request.sampler,
        scheduler: WAN_T2V_SCHEDULER,
        start_at_step: splitStep,
        end_at_step: request.steps,
        return_with_leftover_noise: "disable",
        model: ["6", 0],
        positive: ["7", 0],
        negative: ["8", 0],
        latent_image: ["10", 0],
      },
    },
    "12": {
      class_type: "VAEDecode",
      inputs: { samples: ["11", 0], vae: ["4", 0] },
    },
    "13": {
      class_type: "CreateVideo",
      inputs: {
        images: ["12", 0],
        fps: WAN_T2V_FPS,
      },
    },
    "14": {
      class_type: "SaveVideo",
      inputs: {
        video: ["13", 0],
        filename_prefix: "llm_playground_wan_t2v",
        format: "auto",
        codec: "auto",
      },
    },
  };
}

/**
 * UNETLoader + DualCLIP(flux) + NexBlend LoRA + VAE + FluxGuidance +
 * EmptySD3Latent → KSampler(cfg=1, scheduler=beta) → VAEDecode → SaveImage.
 */
function buildFluxTxt2ImgWorkflow(
  request: ComfyTxt2ImgRequest,
): Record<string, unknown> {
  const prompt = withFluxNexblendTrigger(request.prompt);
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: {
        unet_name: request.model,
        weight_dtype: "default",
      },
    },
    "2": {
      class_type: "DualCLIPLoader",
      inputs: {
        clip_name1: FLUX_CLIP_L,
        clip_name2: FLUX_T5,
        type: "flux",
        device: "default",
      },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: FLUX_VAE },
    },
    "4": {
      class_type: "LoraLoader",
      inputs: {
        model: ["1", 0],
        clip: ["2", 0],
        lora_name: FLUX_NEXBLEND_LORA,
        strength_model: FLUX_NEXBLEND_STRENGTH,
        strength_clip: FLUX_NEXBLEND_STRENGTH,
      },
    },
    "5": {
      class_type: "EmptySD3LatentImage",
      inputs: {
        width: request.width,
        height: request.height,
        batch_size: 1,
      },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["4", 1] },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: request.negativePrompt, clip: ["4", 1] },
    },
    "8": {
      class_type: "FluxGuidance",
      inputs: { conditioning: ["6", 0], guidance: request.cfgScale },
    },
    "9": {
      class_type: "KSampler",
      inputs: {
        seed: request.seed,
        steps: request.steps,
        cfg: FLUX_KSAMPLER_CFG,
        sampler_name: request.sampler,
        scheduler: FLUX_SCHEDULER,
        denoise: 1,
        model: ["4", 0],
        positive: ["8", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "10": {
      class_type: "VAEDecode",
      inputs: { samples: ["9", 0], vae: ["3", 0] },
    },
    "11": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: "llm_playground_flux",
        images: ["10", 0],
      },
    },
  };
}

/**
 * Same Flux + NexBlend stack as txt2img, latent from LoadImage + VAEEncode.
 */
function buildFluxImg2ImgWorkflow(
  request: ComfyImg2ImgRequest,
): Record<string, unknown> {
  const prompt = withFluxNexblendTrigger(request.prompt);
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: {
        unet_name: request.model,
        weight_dtype: "default",
      },
    },
    "2": {
      class_type: "DualCLIPLoader",
      inputs: {
        clip_name1: FLUX_CLIP_L,
        clip_name2: FLUX_T5,
        type: "flux",
        device: "default",
      },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: FLUX_VAE },
    },
    "4": {
      class_type: "LoraLoader",
      inputs: {
        model: ["1", 0],
        clip: ["2", 0],
        lora_name: FLUX_NEXBLEND_LORA,
        strength_model: FLUX_NEXBLEND_STRENGTH,
        strength_clip: FLUX_NEXBLEND_STRENGTH,
      },
    },
    "5": {
      class_type: "LoadImage",
      inputs: { image: request.imageName },
    },
    "6": {
      class_type: "VAEEncode",
      inputs: { pixels: ["5", 0], vae: ["3", 0] },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["4", 1] },
    },
    "8": {
      class_type: "CLIPTextEncode",
      inputs: { text: request.negativePrompt, clip: ["4", 1] },
    },
    "9": {
      class_type: "FluxGuidance",
      inputs: { conditioning: ["7", 0], guidance: request.cfgScale },
    },
    "10": {
      class_type: "KSampler",
      inputs: {
        seed: request.seed,
        steps: request.steps,
        cfg: FLUX_KSAMPLER_CFG,
        sampler_name: request.sampler,
        scheduler: FLUX_SCHEDULER,
        denoise: request.denoisingStrength,
        model: ["4", 0],
        positive: ["9", 0],
        negative: ["8", 0],
        latent_image: ["6", 0],
      },
    },
    "11": {
      class_type: "VAEDecode",
      inputs: { samples: ["10", 0], vae: ["3", 0] },
    },
    "12": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: "llm_playground_flux_i2i",
        images: ["11", 0],
      },
    },
  };
}

/**
 * UNETLoader + CLIP(lumina2) + VAE + ModelSamplingAuraFlow + EmptySD3Latent →
 * KSampler → VAEDecode → SaveImage. Matches the local Z-Image-Turbo graph.
 */
function buildZImageTxt2ImgWorkflow(
  request: ComfyTxt2ImgRequest,
): Record<string, unknown> {
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: {
        unet_name: request.model,
        weight_dtype: "default",
      },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: Z_IMAGE_TEXT_ENCODER,
        type: "lumina2",
        device: "default",
      },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: Z_IMAGE_VAE },
    },
    "4": {
      class_type: "ModelSamplingAuraFlow",
      inputs: { model: ["1", 0], shift: Z_IMAGE_SAMPLING_SHIFT },
    },
    "5": {
      class_type: "EmptySD3LatentImage",
      inputs: {
        width: request.width,
        height: request.height,
        batch_size: 1,
      },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: request.prompt, clip: ["2", 0] },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: request.negativePrompt, clip: ["2", 0] },
    },
    "8": {
      class_type: "KSampler",
      inputs: {
        seed: request.seed,
        steps: request.steps,
        cfg: request.cfgScale,
        sampler_name: request.sampler,
        scheduler: Z_IMAGE_SCHEDULER,
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "9": {
      class_type: "VAEDecode",
      inputs: { samples: ["8", 0], vae: ["3", 0] },
    },
    "10": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: "llm_playground_zimage",
        images: ["9", 0],
      },
    },
  };
}

/**
 * Same Z-Image loaders/sampling as txt2img, but latent from LoadImage + VAEEncode.
 */
function buildZImageImg2ImgWorkflow(
  request: ComfyImg2ImgRequest,
): Record<string, unknown> {
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: {
        unet_name: request.model,
        weight_dtype: "default",
      },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: Z_IMAGE_TEXT_ENCODER,
        type: "lumina2",
        device: "default",
      },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: Z_IMAGE_VAE },
    },
    "4": {
      class_type: "ModelSamplingAuraFlow",
      inputs: { model: ["1", 0], shift: Z_IMAGE_SAMPLING_SHIFT },
    },
    "5": {
      class_type: "LoadImage",
      inputs: { image: request.imageName },
    },
    "6": {
      class_type: "VAEEncode",
      inputs: { pixels: ["5", 0], vae: ["3", 0] },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: request.prompt, clip: ["2", 0] },
    },
    "8": {
      class_type: "CLIPTextEncode",
      inputs: { text: request.negativePrompt, clip: ["2", 0] },
    },
    "9": {
      class_type: "KSampler",
      inputs: {
        seed: request.seed,
        steps: request.steps,
        cfg: request.cfgScale,
        sampler_name: request.sampler,
        scheduler: Z_IMAGE_SCHEDULER,
        denoise: request.denoisingStrength,
        model: ["4", 0],
        positive: ["7", 0],
        negative: ["8", 0],
        latent_image: ["6", 0],
      },
    },
    "10": {
      class_type: "VAEDecode",
      inputs: { samples: ["9", 0], vae: ["3", 0] },
    },
    "11": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: "llm_playground_zimage_i2i",
        images: ["10", 0],
      },
    },
  };
}

/**
 * Fixed CheckpointLoader → encode → EmptyLatent → KSampler → VAEDecode → SaveImage
 * workflow. Node ids stay stable so tests can assert shaping. SD3 checkpoints add
 * nodes 10/11 and rewire clip/model to them. Z-Image and Flux use separate UNET graphs.
 */
export function buildTxt2ImgWorkflow(
  request: ComfyTxt2ImgRequest,
): Record<string, unknown> {
  if (isZImageModel(request.model)) {
    return buildZImageTxt2ImgWorkflow(request);
  }
  if (isFluxModel(request.model)) {
    return buildFluxTxt2ImgWorkflow(request);
  }
  if (isWanT2VModel(request.model)) {
    return buildWanT2VWorkflow(request);
  }
  const sd3 = isSd3Checkpoint(request.model);
  const loadsExternalClip = sd3 && !sd3HasBundledClips(request.model);
  const clip = loadsExternalClip ? ["10", 0] : ["4", 1];
  const model = sd3 ? ["11", 0] : ["4", 0];

  const workflow: Record<string, unknown> = {
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: request.seed,
        steps: request.steps,
        cfg: request.cfgScale,
        sampler_name: request.sampler,
        scheduler: "normal",
        denoise: 1,
        model,
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
      class_type: sd3 ? "EmptySD3LatentImage" : "EmptyLatentImage",
      inputs: {
        width: request.width,
        height: request.height,
        batch_size: 1,
      },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: request.prompt, clip },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: request.negativePrompt, clip },
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

  if (loadsExternalClip) {
    workflow["10"] = {
      class_type: "TripleCLIPLoader",
      inputs: {
        clip_name1: SD3_TEXT_ENCODERS[0],
        clip_name2: SD3_TEXT_ENCODERS[1],
        clip_name3: SD3_TEXT_ENCODERS[2],
      },
    };
  }
  if (sd3) {
    workflow["11"] = {
      class_type: "ModelSamplingSD3",
      inputs: { model: ["4", 0], shift: SD3_SAMPLING_SHIFT },
    };
  }
  return workflow;
}

/**
 * Fixed LoadImage → VAEEncode → KSampler(denoise) → VAEDecode → SaveImage.
 * `imageName` is the filename returned by ComfyUI's `/upload/image`. SD3
 * checkpoints add nodes 9/10; the latent comes from VAEEncode either way, so no
 * EmptyLatent swap is needed here.
 */
export function buildImg2ImgWorkflow(
  request: ComfyImg2ImgRequest,
): Record<string, unknown> {
  if (isWanT2VModel(request.model)) {
    throw new Error(
      "Wan2.2 T2V is text-to-video only in this app (no img2img). Clear the reference image.",
    );
  }
  if (isZImageModel(request.model)) {
    return buildZImageImg2ImgWorkflow(request);
  }
  if (isFluxModel(request.model)) {
    return buildFluxImg2ImgWorkflow(request);
  }
  const sd3 = isSd3Checkpoint(request.model);
  const loadsExternalClip = sd3 && !sd3HasBundledClips(request.model);
  const clip = loadsExternalClip ? ["9", 0] : ["1", 1];
  const model = sd3 ? ["10", 0] : ["1", 0];

  const workflow: Record<string, unknown> = {
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
      inputs: { text: request.prompt, clip },
    },
    "5": {
      class_type: "CLIPTextEncode",
      inputs: { text: request.negativePrompt, clip },
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
        model,
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

  if (loadsExternalClip) {
    workflow["9"] = {
      class_type: "TripleCLIPLoader",
      inputs: {
        clip_name1: SD3_TEXT_ENCODERS[0],
        clip_name2: SD3_TEXT_ENCODERS[1],
        clip_name3: SD3_TEXT_ENCODERS[2],
      },
    };
  }
  if (sd3) {
    workflow["10"] = {
      class_type: "ModelSamplingSD3",
      inputs: { model: ["1", 0], shift: SD3_SAMPLING_SHIFT },
    };
  }
  return workflow;
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

function namesToModels(names: string[]): ComfyModel[] {
  return names
    .filter((name) => typeof name === "string" && name !== "")
    .map((name) => ({ id: name, title: name }));
}

async function listCheckpointNames(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<string[]> {
  // Prefer the dedicated models endpoint; fall back to object_info.
  try {
    const response = await comfyFetch(baseUrl, "/models/checkpoints", {
      signal,
    });
    const payload = (await response.json()) as unknown;
    if (Array.isArray(payload)) {
      return payload.filter(
        (name): name is string => typeof name === "string" && name !== "",
      );
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
  return (
    info.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? []
  ).filter((name): name is string => typeof name === "string" && name !== "");
}

/**
 * Best-effort Z-Image / Flux / Wan T2V entries from diffusion_models/
 * (split UNET families that need dedicated Comfy graphs). Wan lists only the
 * high-noise expert; the low-noise twin is paired by filename at generate time.
 */
async function listSpecialDiffusionNames(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<string[]> {
  try {
    const response = await comfyFetch(baseUrl, "/models/diffusion_models", {
      signal,
    });
    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) return [];
    return payload.filter(
      (name): name is string =>
        typeof name === "string" &&
        name !== "" &&
        (isZImageModel(name) ||
          isFluxModel(name) ||
          isWanT2VHighNoiseModel(name)),
    );
  } catch {
    return [];
  }
}

export async function listComfyModels(
  baseUrl: string = getComfyBaseUrl(),
  signal?: AbortSignal,
): Promise<ComfyModel[]> {
  const checkpoints = await listCheckpointNames(baseUrl, signal);
  const special = await listSpecialDiffusionNames(baseUrl, signal);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const name of [...checkpoints, ...special]) {
    if (seen.has(name)) continue;
    seen.add(name);
    merged.push(name);
  }
  return namesToModels(merged);
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
  return runComfyWorkflow(
    buildTxt2ImgWorkflow(request),
    request.seed,
    baseUrl,
    request.signal,
    request.onProgress,
  );
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
    request.onProgress,
  );
}

/** Map ComfyUI base HTTP URL to its websocket endpoint. Exported for tests. */
export function comfyWebSocketUrl(baseUrl: string, clientId: string): string {
  const wsBase = baseUrl.replace(/^http/i, "ws");
  return `${wsBase}/ws?clientId=${encodeURIComponent(clientId)}`;
}

/** Parse a ComfyUI websocket JSON message into progress, or null. */
export function parseComfyProgressMessage(
  raw: unknown,
  promptId: string,
): ImageGenerationProgress | null {
  if (!raw || typeof raw !== "object") return null;
  const message = raw as { type?: unknown; data?: unknown };
  if (message.type !== "progress" || !message.data || typeof message.data !== "object") {
    return null;
  }
  const data = message.data as {
    value?: unknown;
    max?: unknown;
    prompt_id?: unknown;
  };
  if (typeof data.prompt_id === "string" && data.prompt_id !== promptId) {
    return null;
  }
  if (typeof data.value !== "number" || typeof data.max !== "number") {
    return null;
  }
  return { percent: progressPercentFromCounts(data.value, data.max) };
}

function openComfyProgressSocket(
  baseUrl: string,
  clientId: string,
  signal?: AbortSignal,
): Promise<WebSocket | null> {
  if (typeof WebSocket === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(comfyWebSocketUrl(baseUrl, clientId));
    } catch {
      resolve(null);
      return;
    }

    const finish = (socket: WebSocket | null) => {
      if (settled) return;
      settled = true;
      resolve(socket);
    };

    const onAbort = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      finish(null);
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });

    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      finish(null);
    }, 2000);

    ws.addEventListener("open", () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      finish(ws);
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      finish(null);
    });
  });
}

async function runComfyWorkflow(
  workflow: Record<string, unknown>,
  seed: number,
  baseUrl: string,
  signal?: AbortSignal,
  onProgress?: (progress: ImageGenerationProgress) => void,
): Promise<ComfyTxt2ImgResult> {
  const clientId = crypto.randomUUID();
  const socket =
    onProgress !== undefined
      ? await openComfyProgressSocket(baseUrl, clientId, signal)
      : null;

  let promptIdForProgress = "";
  const onMessage = (event: MessageEvent) => {
    if (typeof event.data !== "string" || !onProgress || promptIdForProgress === "") {
      return;
    }
    try {
      const parsed = JSON.parse(event.data) as unknown;
      const progress = parseComfyProgressMessage(parsed, promptIdForProgress);
      if (progress) onProgress(progress);
    } catch {
      /* ignore malformed frames */
    }
  };
  socket?.addEventListener("message", onMessage);

  const closeSocket = () => {
    socket?.removeEventListener("message", onMessage);
    try {
      socket?.close();
    } catch {
      /* ignore */
    }
  };

  try {
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
    promptIdForProgress = promptId;

    let imageMeta: { filename: string; subfolder: string; type: string } | null =
      null;

    // Video MoE runs can exceed 5+ minutes on a 4090; poll up to ~20 minutes.
    for (let attempt = 0; attempt < 2400; attempt += 1) {
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
            {
              images?: Array<{
                filename?: string;
                subfolder?: string;
                type?: string;
              }>;
            }
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
    const mediaKind: ComfyMediaKind = /\.(mp4|webm|mov)$/i.test(
      imageMeta.filename,
    )
      ? "video"
      : "image";

    return {
      imageBase64: bytes.toString("base64"),
      seed,
      mediaKind,
    };
  } finally {
    closeSocket();
  }
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
