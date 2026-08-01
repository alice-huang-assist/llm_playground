import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildTxt2ImgPayload,
  forgeTxt2Img,
  listForgeModels,
  listForgeSamplers,
  normalizeForgeBaseUrl,
  resolveForgeBaseUrl,
} from "@/lib/providers/forge";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveForgeBaseUrl", () => {
  it("defaults when unset", () => {
    expect(resolveForgeBaseUrl(null)).toBe("http://127.0.0.1:7860");
    expect(resolveForgeBaseUrl("  ")).toBe("http://127.0.0.1:7860");
  });

  it("strips trailing slashes", () => {
    expect(resolveForgeBaseUrl("http://127.0.0.1:7860/")).toBe(
      "http://127.0.0.1:7860",
    );
  });
});

describe("normalizeForgeBaseUrl", () => {
  it("accepts http(s) URLs", () => {
    expect(normalizeForgeBaseUrl("http://127.0.0.1:7860/")).toBe(
      "http://127.0.0.1:7860",
    );
  });

  it("rejects junk", () => {
    expect(normalizeForgeBaseUrl("ftp://x")).toBeNull();
    expect(normalizeForgeBaseUrl("nope")).toBeNull();
    expect(normalizeForgeBaseUrl(3)).toBeNull();
  });
});

describe("buildTxt2ImgPayload", () => {
  it("shapes the A1111 request including model override", () => {
    expect(
      buildTxt2ImgPayload({
        model: "sdxl.safetensors",
        prompt: "a cat",
        negativePrompt: "blur",
        width: 1024,
        height: 768,
        steps: 25,
        cfgScale: 7.5,
        sampler: "Euler a",
        seed: -1,
      }),
    ).toEqual({
      prompt: "a cat",
      negative_prompt: "blur",
      width: 1024,
      height: 768,
      steps: 25,
      cfg_scale: 7.5,
      sampler_name: "Euler a",
      seed: -1,
      override_settings: { sd_model_checkpoint: "sdxl.safetensors" },
      override_settings_restore_afterwards: true,
    });
  });
});

describe("Forge HTTP helpers", () => {
  it("lists models from /sdapi/v1/sd-models", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json([
        { title: "SDXL [abcd]", model_name: "sdxl.safetensors" },
        { title: "orphan" },
      ]),
    );

    await expect(listForgeModels("http://forge.test")).resolves.toEqual([
      { id: "sdxl.safetensors", title: "SDXL [abcd]" },
      { id: "orphan", title: "orphan" },
    ]);

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      "http://forge.test/sdapi/v1/sd-models",
    );
  });

  it("lists samplers", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json([{ name: "Euler a" }, { name: "DPM++ 2M" }]),
    );

    await expect(listForgeSamplers("http://forge.test")).resolves.toEqual([
      "Euler a",
      "DPM++ 2M",
    ]);
  });

  it("posts txt2img and returns the first image", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        images: ["aGVsbG8="],
        info: JSON.stringify({ seed: 42 }),
      }),
    );

    const result = await forgeTxt2Img(
      {
        model: "sdxl.safetensors",
        prompt: "a cat",
        negativePrompt: "",
        width: 512,
        height: 512,
        steps: 10,
        cfgScale: 7,
        sampler: "Euler a",
        seed: -1,
      },
      "http://forge.test",
    );

    expect(result).toEqual({ imageBase64: "aGVsbG8=", seed: 42 });

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      "http://forge.test/sdapi/v1/txt2img",
    );
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      prompt: "a cat",
      seed: -1,
      override_settings: { sd_model_checkpoint: "sdxl.safetensors" },
    });
  });
});
