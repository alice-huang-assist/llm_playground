import { describe, expect, it } from "vitest";

import {
  clampDenoisingStrength,
  clampImageCount,
  clampImageParams,
  clampImageSize,
  clampSeed,
  forgeSeed,
  overallProgressPercent,
  parseReferenceImage,
  seedForIndex,
} from "@/lib/image-params";

describe("clampImageSize", () => {
  it("clamps and snaps to multiples of 64", () => {
    expect(clampImageSize(100, 1024)).toBe(256);
    expect(clampImageSize(3000, 1024)).toBe(2048);
    expect(clampImageSize(1000, 1024)).toBe(1024);
  });
});

describe("clampSeed / forgeSeed", () => {
  it("treats empty as random", () => {
    expect(clampSeed("")).toBeNull();
    expect(clampSeed(null)).toBeNull();
    expect(forgeSeed(null)).toBe(-1);
    expect(forgeSeed(7)).toBe(7);
  });
});

describe("clampImageCount / seed helpers", () => {
  it("clamps count to 1–8", () => {
    expect(clampImageCount(undefined)).toBe(1);
    expect(clampImageCount(0)).toBe(1);
    expect(clampImageCount(4)).toBe(4);
    expect(clampImageCount(99)).toBe(8);
  });

  it("increments seeds and maps overall progress", () => {
    expect(seedForIndex(10, 0)).toBe(10);
    expect(seedForIndex(10, 2)).toBe(12);
    expect(overallProgressPercent(0, 4, 50)).toBe(13);
    expect(overallProgressPercent(3, 4, 100)).toBe(100);
  });
});

describe("clampDenoisingStrength", () => {
  it("clamps into 0.01–1", () => {
    expect(clampDenoisingStrength(0)).toBe(0.01);
    expect(clampDenoisingStrength(2)).toBe(1);
    expect(clampDenoisingStrength(0.55)).toBe(0.55);
  });
});

describe("parseReferenceImage", () => {
  it("accepts a PNG data URL", () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);
    const result = parseReferenceImage(
      `data:image/png;base64,${png.toString("base64")}`,
    );
    expect(result).toMatchObject({ kind: "png" });
  });

  it("rejects non-images", () => {
    const result = parseReferenceImage(
      `data:image/png;base64,${Buffer.from("hello").toString("base64")}`,
    );
    expect(result).toEqual({
      error: "Reference image must be a PNG, JPEG, or WebP file.",
    });
  });
});

describe("clampImageParams", () => {
  it("fills defaults and clamps", () => {
    expect(clampImageParams({})).toEqual({
      width: 1024,
      height: 1024,
      steps: 20,
      cfgScale: 7,
      seed: null,
    });

    expect(
      clampImageParams({
        width: 500,
        height: 9000,
        steps: 999,
        cfgScale: 0.2,
        seed: 3.9,
      }),
    ).toEqual({
      width: 512,
      height: 2048,
      steps: 150,
      cfgScale: 1,
      seed: 3,
    });
  });
});
