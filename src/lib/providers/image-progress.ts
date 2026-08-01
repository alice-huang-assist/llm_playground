/**
 * Shared progress events for Forge / ComfyUI generation adapters.
 */

export interface ImageGenerationProgress {
  /** Integer percent in [0, 100]. */
  percent: number;
  /** Raw base64 preview frame (Forge only; no data-URL prefix). */
  currentImageBase64?: string;
}

/** Convert a 0–1 ratio or value/max pair into a clamped integer percent. */
export function progressPercentFromRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  if (ratio >= 1) return 100;
  return Math.round(ratio * 100);
}

export function progressPercentFromCounts(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return progressPercentFromRatio(value / max);
}
