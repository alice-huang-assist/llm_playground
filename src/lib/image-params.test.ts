import { describe, expect, it } from "vitest";

import {
  clampImageParams,
  clampImageSize,
  clampSeed,
  forgeSeed,
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
