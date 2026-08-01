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
