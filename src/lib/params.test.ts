import { describe, expect, it } from "vitest";

import {
  DEFAULT_PARAMETERS,
  PARAMETERS,
  buildParameterPayload,
  clampParameter,
  parameterSpec,
} from "./params";

describe("PARAMETERS", () => {
  it("covers exactly the parameters the sidebar promises", () => {
    expect(PARAMETERS.map((spec) => spec.key)).toEqual([
      "temperature",
      "top_p",
      "max_tokens",
      "seed",
      "top_k",
      "min_p",
      "repeat_penalty",
    ]);
  });

  it("gives every bounded parameter the step its spec calls for", () => {
    expect(
      PARAMETERS.map((spec) => [spec.key, spec.min, spec.max, spec.step]),
    ).toEqual([
      ["temperature", 0, 2, 0.05],
      ["top_p", 0, 1, 0.01],
      ["max_tokens", 1, undefined, 1],
      ["seed", undefined, undefined, 1],
      ["top_k", 0, undefined, 1],
      ["min_p", 0, 1, 0.01],
      ["repeat_penalty", 0.5, 2, 0.05],
    ]);
  });

  it("documents a default for every parameter", () => {
    for (const spec of PARAMETERS) {
      expect(DEFAULT_PARAMETERS[spec.key]).toBe(spec.default);
      expect(spec.help).not.toBe("");
    }
  });

  it("throws on an unknown key rather than guessing", () => {
    // @ts-expect-error deliberately outside the union
    expect(() => parameterSpec("nonsense")).toThrow(/Unknown parameter/);
  });
});

describe("clampParameter", () => {
  it("clamps above the maximum", () => {
    expect(clampParameter("temperature", 5)).toBe(2);
    expect(clampParameter("top_p", 1.7)).toBe(1);
    expect(clampParameter("repeat_penalty", 9)).toBe(2);
  });

  it("clamps below the minimum", () => {
    expect(clampParameter("temperature", -3)).toBe(0);
    expect(clampParameter("min_p", -0.5)).toBe(0);
    expect(clampParameter("repeat_penalty", 0)).toBe(0.5);
  });

  it("rounds integer parameters", () => {
    expect(clampParameter("max_tokens", 10.7)).toBe(11);
    expect(clampParameter("seed", 42.2)).toBe(42);
    expect(clampParameter("top_k", 39.5)).toBe(40);
  });

  it("accepts numeric strings, as the inputs produce", () => {
    expect(clampParameter("temperature", "0.35")).toBe(0.35);
    expect(clampParameter("seed", "42")).toBe(42);
  });

  it("treats empty, null, and nonsense as unset", () => {
    expect(clampParameter("temperature", "")).toBeNull();
    expect(clampParameter("temperature", null)).toBeNull();
    expect(clampParameter("temperature", undefined)).toBeNull();
    expect(clampParameter("temperature", "abc")).toBeNull();
    expect(clampParameter("seed", Number.NaN)).toBeNull();
    expect(clampParameter("temperature", Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("leaves an in-range value alone", () => {
    expect(clampParameter("temperature", 0.35)).toBe(0.35);
    expect(clampParameter("min_p", 0.05)).toBe(0.05);
  });
});

describe("buildParameterPayload", () => {
  it("omits everything when every parameter is at its default", () => {
    expect(buildParameterPayload(DEFAULT_PARAMETERS)).toEqual({});
  });

  it("omits unset parameters", () => {
    expect(buildParameterPayload({ seed: null, max_tokens: "" })).toEqual({});
  });

  it("includes only the parameters that differ from their default", () => {
    expect(
      buildParameterPayload({
        ...DEFAULT_PARAMETERS,
        temperature: 0,
        seed: 42,
      }),
    ).toEqual({ temperature: 0, seed: 42 });
  });

  it("clamps out-of-range input rather than sending it raw", () => {
    expect(
      buildParameterPayload({
        temperature: 11,
        top_p: -4,
        repeat_penalty: 0.1,
        max_tokens: 10.6,
      }),
    ).toEqual({
      temperature: 2,
      top_p: 0,
      repeat_penalty: 0.5,
      max_tokens: 11,
    });
  });

  it("drops a value that clamps back onto its default", () => {
    // 3 clamps to 2 (kept), but 0.85 rounds to nothing special — temperature
    // sent as exactly its default is what must disappear.
    expect(buildParameterPayload({ temperature: 0.8 })).toEqual({});
    expect(buildParameterPayload({ top_k: -5 })).toEqual({ top_k: 0 });
  });

  it("ignores unknown keys", () => {
    expect(
      buildParameterPayload({
        temperature: 0.2,
        presence_penalty: 1,
      } as Record<string, unknown>),
    ).toEqual({ temperature: 0.2 });
  });

  it("returns an empty payload for null or undefined", () => {
    expect(buildParameterPayload(null)).toEqual({});
    expect(buildParameterPayload(undefined)).toEqual({});
  });
});
