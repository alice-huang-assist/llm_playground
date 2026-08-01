import { describe, expect, it } from "vitest";

import {
  progressPercentFromCounts,
  progressPercentFromRatio,
} from "@/lib/providers/image-progress";

describe("progressPercentFromRatio", () => {
  it("clamps and rounds", () => {
    expect(progressPercentFromRatio(0)).toBe(0);
    expect(progressPercentFromRatio(0.401)).toBe(40);
    expect(progressPercentFromRatio(1)).toBe(100);
    expect(progressPercentFromRatio(1.5)).toBe(100);
    expect(progressPercentFromRatio(-1)).toBe(0);
  });
});

describe("progressPercentFromCounts", () => {
  it("converts value/max", () => {
    expect(progressPercentFromCounts(5, 20)).toBe(25);
    expect(progressPercentFromCounts(0, 20)).toBe(0);
    expect(progressPercentFromCounts(20, 20)).toBe(100);
    expect(progressPercentFromCounts(1, 0)).toBe(0);
  });
});
