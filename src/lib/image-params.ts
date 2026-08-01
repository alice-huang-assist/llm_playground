/**
 * Image-generation parameters and server-side clamping for Forge txt2img.
 * Mirrors the chat params spirit: clamp everything, omit true defaults from
 * the upstream payload where practical (seed -1 / random is always explicit).
 */

export type ImageParamKey =
  | "width"
  | "height"
  | "steps"
  | "cfgScale"
  | "seed";

export interface ImageParamValues {
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  /** null means random (Forge seed -1). */
  seed: number | null;
}

export const DEFAULT_IMAGE_PARAMS: ImageParamValues = {
  width: 1024,
  height: 1024,
  steps: 20,
  cfgScale: 7,
  seed: null,
};

const SIZE_MIN = 256;
const SIZE_MAX = 2048;
const SIZE_STEP = 64;
const STEPS_MIN = 1;
const STEPS_MAX = 150;
const CFG_MIN = 1;
const CFG_MAX = 30;
const STRENGTH_MIN = 0.01;
const STRENGTH_MAX = 1;
export const DEFAULT_DENOISING_STRENGTH = 0.75;
/** Hard cap on reference image decoded bytes (AC-7). */
export const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;

export const DEFAULT_IMAGE_COUNT = 1;
export const MIN_IMAGE_COUNT = 1;
export const MAX_IMAGE_COUNT = 8;

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function clampImageSize(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const clamped = Math.min(SIZE_MAX, Math.max(SIZE_MIN, numeric));
  return roundToStep(clamped, SIZE_STEP);
}

export function clampSteps(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(STEPS_MAX, Math.max(STEPS_MIN, Math.round(numeric)));
}

export function clampCfgScale(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const clamped = Math.min(CFG_MAX, Math.max(CFG_MIN, numeric));
  return Math.round(clamped * 100) / 100;
}

/**
 * Empty / null / undefined → random (null).
 * Otherwise a non-negative integer.
 */
export function clampSeed(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.trunc(numeric));
}

export function clampImageParams(
  values: Partial<Record<ImageParamKey, unknown>> | null | undefined,
): ImageParamValues {
  return {
    width: clampImageSize(values?.width, DEFAULT_IMAGE_PARAMS.width),
    height: clampImageSize(values?.height, DEFAULT_IMAGE_PARAMS.height),
    steps: clampSteps(values?.steps, DEFAULT_IMAGE_PARAMS.steps),
    cfgScale: clampCfgScale(values?.cfgScale, DEFAULT_IMAGE_PARAMS.cfgScale),
    seed: clampSeed(values?.seed),
  };
}

/** Seed value for Forge: -1 when unset (random). */
export function forgeSeed(seed: number | null): number {
  return seed === null ? -1 : seed;
}

/** Clamp image count to 1–8 (default 1). */
export function clampImageCount(
  value: unknown,
  fallback: number = DEFAULT_IMAGE_COUNT,
): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(
    MAX_IMAGE_COUNT,
    Math.max(MIN_IMAGE_COUNT, Math.round(numeric)),
  );
}

/**
 * Concrete base seed for a multi-image run. When the UI left seed empty,
 * pick a random base so we can increment (AC-2).
 */
export function resolveBaseSeed(seed: number | null): number {
  if (seed !== null) return seed;
  return Math.floor(Math.random() * 2_147_483_647);
}

/** Seed for image index i in a batch (0-based). */
export function seedForIndex(baseSeed: number, index: number): number {
  return baseSeed + index;
}

/**
 * Map per-image provider progress into one overall 0–100 bar for a batch.
 */
export function overallProgressPercent(
  imageIndex: number,
  imageCount: number,
  localPercent: number,
): number {
  if (imageCount <= 0) return 0;
  const local = Math.min(100, Math.max(0, localPercent)) / 100;
  const ratio = (imageIndex + local) / imageCount;
  if (ratio <= 0) return 0;
  if (ratio >= 1) return 100;
  return Math.round(ratio * 100);
}

export function clampDenoisingStrength(
  value: unknown,
  fallback: number = DEFAULT_DENOISING_STRENGTH,
): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const clamped = Math.min(STRENGTH_MAX, Math.max(STRENGTH_MIN, numeric));
  return Math.round(clamped * 1000) / 1000;
}

export type ReferenceKind = "png" | "jpeg" | "webp";

export interface ParsedReferenceImage {
  bytes: Buffer;
  kind: ReferenceKind;
  /** Raw base64 without data-URL prefix, for Forge. */
  base64: string;
}

function detectKind(bytes: Buffer): ReferenceKind | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/**
 * Parse a browser data-URL or raw base64 reference image. Rejects oversized
 * or non-image payloads.
 */
export function parseReferenceImage(value: unknown): ParsedReferenceImage | { error: string } {
  if (typeof value !== "string" || value.trim() === "") {
    return { error: "Reference image data is required when provided." };
  }

  let base64 = value.trim();
  const dataUrl = /^data:image\/(png|jpeg|jpg|webp);base64,/i.exec(base64);
  if (dataUrl) {
    base64 = base64.slice(dataUrl[0].length);
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, "base64");
  } catch {
    return { error: "Reference image must be valid base64." };
  }

  if (bytes.length === 0) {
    return { error: "Reference image is empty." };
  }
  if (bytes.length > MAX_REFERENCE_BYTES) {
    return {
      error: `Reference image must be at most ${MAX_REFERENCE_BYTES / (1024 * 1024)} MB.`,
    };
  }

  const kind = detectKind(bytes);
  if (kind === null) {
    return { error: "Reference image must be a PNG, JPEG, or WebP file." };
  }

  return { bytes, kind, base64 };
}
