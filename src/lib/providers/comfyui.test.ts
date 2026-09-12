import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildImg2ImgWorkflow,
  buildTxt2ImgWorkflow,
  comfyTxt2Img,
  comfyWebSocketUrl,
  isFluxModel,
  isSd3Checkpoint,
  isWanT2VHighNoiseModel,
  isWanT2VModel,
  isZImageModel,
  listComfyModels,
  listComfySamplers,
  normalizeComfyBaseUrl,
  parseComfyProgressMessage,
  resolveComfyBaseUrl,
  wanT2VCanonicalModel,
  wanT2VLowNoiseSibling,
  withFluxNexblendTrigger,
} from "@/lib/providers/comfyui";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveComfyBaseUrl", () => {
  it("defaults when unset", () => {
    expect(resolveComfyBaseUrl(null)).toBe("http://127.0.0.1:8188");
  });
});

describe("normalizeComfyBaseUrl", () => {
  it("accepts http URLs and strips slashes", () => {
    expect(normalizeComfyBaseUrl("http://127.0.0.1:8188/")).toBe(
      "http://127.0.0.1:8188",
    );
  });

  it("rejects junk", () => {
    expect(normalizeComfyBaseUrl("nope")).toBeNull();
  });
});

const baseTxt2Img = {
  model: "model.safetensors",
  prompt: "a cat",
  negativePrompt: "blur",
  width: 512,
  height: 768,
  steps: 20,
  cfgScale: 7,
  sampler: "euler",
  seed: 42,
};

describe("buildTxt2ImgWorkflow", () => {
  it("wires the fixed node graph with request fields", () => {
    const workflow = buildTxt2ImgWorkflow({
      model: "model.safetensors",
      prompt: "a cat",
      negativePrompt: "blur",
      width: 512,
      height: 768,
      steps: 20,
      cfgScale: 7,
      sampler: "euler",
      seed: 42,
    });

    expect(workflow).toMatchObject({
      "4": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "model.safetensors" },
      },
      "5": {
        inputs: { width: 512, height: 768, batch_size: 1 },
      },
      "6": { inputs: { text: "a cat" } },
      "7": { inputs: { text: "blur" } },
      "3": {
        class_type: "KSampler",
        inputs: {
          seed: 42,
          steps: 20,
          cfg: 7,
          sampler_name: "euler",
          scheduler: "normal",
          denoise: 1,
        },
      },
    });
  });

  it("keeps the SDXL path free of SD3 nodes", () => {
    const workflow = buildTxt2ImgWorkflow({ ...baseTxt2Img });

    expect(workflow["5"]).toMatchObject({ class_type: "EmptyLatentImage" });
    expect(workflow["6"]).toMatchObject({ inputs: { clip: ["4", 1] } });
    expect(workflow["3"]).toMatchObject({ inputs: { model: ["4", 0] } });
    expect(workflow["10"]).toBeUndefined();
    expect(workflow["11"]).toBeUndefined();
  });

  it("wires SD3 checkpoints to TripleCLIPLoader, SD3 latent, and SD3 sampling", () => {
    const workflow = buildTxt2ImgWorkflow({
      ...baseTxt2Img,
      model: "sd3.5_large.safetensors",
    });

    expect(workflow["5"]).toMatchObject({ class_type: "EmptySD3LatentImage" });
    expect(workflow["10"]).toMatchObject({
      class_type: "TripleCLIPLoader",
      inputs: {
        clip_name1: "clip_l.safetensors",
        clip_name2: "clip_g.safetensors",
        clip_name3: "t5xxl_fp16.safetensors",
      },
    });
    expect(workflow["11"]).toMatchObject({
      class_type: "ModelSamplingSD3",
      inputs: { model: ["4", 0], shift: 3 },
    });
    expect(workflow["6"]).toMatchObject({ inputs: { clip: ["10", 0] } });
    expect(workflow["7"]).toMatchObject({ inputs: { clip: ["10", 0] } });
    expect(workflow["3"]).toMatchObject({ inputs: { model: ["11", 0] } });
  });

  it("skips TripleCLIPLoader when the SD3 checkpoint bundles its encoders", () => {
    const workflow = buildTxt2ImgWorkflow({
      ...baseTxt2Img,
      model: "sd3.5_medium_incl_clips_t5xxlfp8scaled.safetensors",
    });

    expect(workflow["5"]).toMatchObject({ class_type: "EmptySD3LatentImage" });
    expect(workflow["10"]).toBeUndefined();
    expect(workflow["6"]).toMatchObject({ inputs: { clip: ["4", 1] } });
    expect(workflow["3"]).toMatchObject({ inputs: { model: ["11", 0] } });
  });

  it("wires Z-Image to UNET/CLIP/VAE loaders with AuraFlow and simple scheduler", () => {
    const workflow = buildTxt2ImgWorkflow({
      ...baseTxt2Img,
      model: "z_image_turbo_bf16.safetensors",
      steps: 8,
      cfgScale: 1,
      sampler: "res_multistep",
    });

    expect(workflow).toMatchObject({
      "1": {
        class_type: "UNETLoader",
        inputs: {
          unet_name: "z_image_turbo_bf16.safetensors",
          weight_dtype: "default",
        },
      },
      "2": {
        class_type: "CLIPLoader",
        inputs: {
          clip_name: "qwen_3_4b.safetensors",
          type: "lumina2",
        },
      },
      "3": {
        class_type: "VAELoader",
        inputs: { vae_name: "ae.safetensors" },
      },
      "4": {
        class_type: "ModelSamplingAuraFlow",
        inputs: { model: ["1", 0], shift: 3 },
      },
      "5": { class_type: "EmptySD3LatentImage" },
      "6": { inputs: { text: "a cat", clip: ["2", 0] } },
      "7": { inputs: { text: "blur", clip: ["2", 0] } },
      "8": {
        class_type: "KSampler",
        inputs: {
          seed: 42,
          steps: 8,
          cfg: 1,
          sampler_name: "res_multistep",
          scheduler: "simple",
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
    });
  });

  it("wires Fluxed Up to DualCLIP, NexBlend LoRA, and FluxGuidance", () => {
    const workflow = buildTxt2ImgWorkflow({
      ...baseTxt2Img,
      model: "fluxedUpFluxNSFW_71FP16.safetensors",
      steps: 28,
      cfgScale: 3.5,
      sampler: "dpmpp_2m",
    });

    expect(workflow).toMatchObject({
      "1": {
        class_type: "UNETLoader",
        inputs: {
          unet_name: "fluxedUpFluxNSFW_71FP16.safetensors",
          weight_dtype: "default",
        },
      },
      "2": {
        class_type: "DualCLIPLoader",
        inputs: {
          clip_name1: "clip_l.safetensors",
          clip_name2: "t5xxl_fp16.safetensors",
          type: "flux",
        },
      },
      "3": {
        class_type: "VAELoader",
        inputs: { vae_name: "ae.safetensors" },
      },
      "4": {
        class_type: "LoraLoader",
        inputs: {
          model: ["1", 0],
          clip: ["2", 0],
          lora_name: "Flux/NexBlend 01 Asian Realistic Flux.safetensors",
          strength_model: 0.8,
          strength_clip: 0.8,
        },
      },
      "5": { class_type: "EmptySD3LatentImage" },
      "6": { inputs: { text: "nexblend a cat", clip: ["4", 1] } },
      "7": { inputs: { text: "blur", clip: ["4", 1] } },
      "8": {
        class_type: "FluxGuidance",
        inputs: { conditioning: ["6", 0], guidance: 3.5 },
      },
      "9": {
        class_type: "KSampler",
        inputs: {
          seed: 42,
          steps: 28,
          cfg: 1,
          sampler_name: "dpmpp_2m",
          scheduler: "beta",
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
    });
  });
});

describe("withFluxNexblendTrigger", () => {
  it("prefixes nexblend when missing", () => {
    expect(withFluxNexblendTrigger("a portrait")).toBe("nexblend a portrait");
  });

  it("leaves prompts that already include the trigger", () => {
    expect(withFluxNexblendTrigger("NexBlend studio light")).toBe(
      "NexBlend studio light",
    );
  });
});

describe("isSd3Checkpoint", () => {
  it.each([
    "sd3.5_large.safetensors",
    "sd3_medium.safetensors",
    "SD3.5_Large_Turbo.safetensors",
    "my_sd_3.5_finetune.safetensors",
  ])("detects %s", (name) => {
    expect(isSd3Checkpoint(name)).toBe(true);
  });

  it.each([
    "sd_xl_base_1.0.safetensors",
    "RealVisXL_V4.0.safetensors",
    "DreamShaperXL_Lightning.safetensors",
    "Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors",
    "model.safetensors",
  ])("ignores %s", (name) => {
    expect(isSd3Checkpoint(name)).toBe(false);
  });
});

describe("isZImageModel", () => {
  it.each([
    "z_image_turbo_bf16.safetensors",
    "z-image-turbo.safetensors",
    "ZImage_base.safetensors",
  ])("detects %s", (name) => {
    expect(isZImageModel(name)).toBe(true);
  });

  it.each([
    "sd_xl_base_1.0.safetensors",
    "sd3.5_large.safetensors",
    "model.safetensors",
  ])("ignores %s", (name) => {
    expect(isZImageModel(name)).toBe(false);
  });
});

describe("isFluxModel", () => {
  it.each([
    "fluxedUpFluxNSFW_71FP16.safetensors",
    "fluxed_up_flux_nsfw.safetensors",
    "flux1-dev.safetensors",
    "flux1_dev_fp8.safetensors",
    "FLUX.1-dev.safetensors",
  ])("detects %s", (name) => {
    expect(isFluxModel(name)).toBe(true);
  });

  it.each([
    "sd_xl_base_1.0.safetensors",
    "sd3.5_large.safetensors",
    "z_image_turbo_bf16.safetensors",
    "model.safetensors",
  ])("ignores %s", (name) => {
    expect(isFluxModel(name)).toBe(false);
  });
});

describe("isWanT2VModel", () => {
  it.each([
    "wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors",
    "wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors",
    "Wan2.2-T2V-high_noise.safetensors",
  ])("detects %s", (name) => {
    expect(isWanT2VModel(name)).toBe(true);
  });

  it.each([
    "wan2.2_i2v_high_noise_14B_fp16.safetensors",
    "wan2.2_ti2v_5B_fp16.safetensors",
    "flux1-dev.safetensors",
  ])("ignores %s", (name) => {
    expect(isWanT2VModel(name)).toBe(false);
  });
});

describe("wanT2V pairing", () => {
  const high = "wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors";
  const low = "wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors";

  it("canonicalizes to high_noise and derives the low sibling", () => {
    expect(wanT2VCanonicalModel(low)).toBe(high);
    expect(wanT2VLowNoiseSibling(high)).toBe(low);
    expect(wanT2VLowNoiseSibling(low)).toBe(low);
  });

  it("lists only the high-noise expert", () => {
    expect(isWanT2VHighNoiseModel(high)).toBe(true);
    expect(isWanT2VHighNoiseModel(low)).toBe(false);
  });
});

describe("buildTxt2ImgWorkflow Wan T2V", () => {
  it("wires the MoE high/low graph with SaveVideo", () => {
    const workflow = buildTxt2ImgWorkflow({
      ...baseTxt2Img,
      model: "wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors",
      width: 640,
      height: 640,
      steps: 20,
      cfgScale: 3.5,
      sampler: "euler",
    });

    expect(workflow).toMatchObject({
      "1": {
        class_type: "UNETLoader",
        inputs: {
          unet_name: "wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors",
        },
      },
      "2": {
        class_type: "UNETLoader",
        inputs: {
          unet_name: "wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors",
        },
      },
      "3": {
        class_type: "CLIPLoader",
        inputs: {
          clip_name: "umt5_xxl_fp16.safetensors",
          type: "wan",
        },
      },
      "4": {
        class_type: "VAELoader",
        inputs: { vae_name: "wan_2.1_vae.safetensors" },
      },
      "9": {
        class_type: "EmptyHunyuanLatentVideo",
        inputs: { width: 640, height: 640, length: 81 },
      },
      "10": {
        class_type: "KSamplerAdvanced",
        inputs: {
          add_noise: "enable",
          steps: 20,
          end_at_step: 10,
          sampler_name: "euler",
          scheduler: "simple",
        },
      },
      "11": {
        class_type: "KSamplerAdvanced",
        inputs: {
          add_noise: "disable",
          start_at_step: 10,
          end_at_step: 20,
        },
      },
      "13": { class_type: "CreateVideo", inputs: { fps: 16 } },
      "14": { class_type: "SaveVideo" },
    });
  });
});

describe("buildImg2ImgWorkflow", () => {
  it("rejects Wan T2V img2img", () => {
    expect(() =>
      buildImg2ImgWorkflow({
        ...baseTxt2Img,
        model: "wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors",
        imageName: "ref.png",
        denoisingStrength: 0.5,
      }),
    ).toThrow(/text-to-video only/i);
  });

  it("uses LoadImage + VAEEncode and the given denoise", () => {
    expect(
      buildImg2ImgWorkflow({
        model: "model.safetensors",
        prompt: "edit me",
        negativePrompt: "",
        width: 512,
        height: 512,
        steps: 15,
        cfgScale: 7,
        sampler: "euler",
        seed: 3,
        imageName: "ref.png",
        denoisingStrength: 0.4,
      }),
    ).toMatchObject({
      "2": { class_type: "LoadImage", inputs: { image: "ref.png" } },
      "3": { class_type: "VAEEncode" },
      "6": {
        class_type: "KSampler",
        inputs: { denoise: 0.4, sampler_name: "euler" },
      },
    });
  });

  it("wires SD3 checkpoints to TripleCLIPLoader and SD3 sampling", () => {
    const workflow = buildImg2ImgWorkflow({
      ...baseTxt2Img,
      model: "sd3.5_large.safetensors",
      imageName: "ref.png",
      denoisingStrength: 0.6,
    });

    expect(workflow["9"]).toMatchObject({ class_type: "TripleCLIPLoader" });
    expect(workflow["10"]).toMatchObject({
      class_type: "ModelSamplingSD3",
      inputs: { model: ["1", 0], shift: 3 },
    });
    expect(workflow["4"]).toMatchObject({ inputs: { clip: ["9", 0] } });
    expect(workflow["5"]).toMatchObject({ inputs: { clip: ["9", 0] } });
    expect(workflow["6"]).toMatchObject({
      inputs: { model: ["10", 0], denoise: 0.6 },
    });
  });

  it("keeps the SDXL path free of SD3 nodes", () => {
    const workflow = buildImg2ImgWorkflow({
      ...baseTxt2Img,
      imageName: "ref.png",
      denoisingStrength: 0.4,
    });

    expect(workflow["9"]).toBeUndefined();
    expect(workflow["10"]).toBeUndefined();
    expect(workflow["4"]).toMatchObject({ inputs: { clip: ["1", 1] } });
    expect(workflow["6"]).toMatchObject({ inputs: { model: ["1", 0] } });
  });

  it("wires Z-Image img2img through UNET loaders and VAEEncode", () => {
    const workflow = buildImg2ImgWorkflow({
      ...baseTxt2Img,
      model: "z_image_turbo_bf16.safetensors",
      imageName: "ref.png",
      denoisingStrength: 0.55,
      sampler: "res_multistep",
    });

    expect(workflow).toMatchObject({
      "1": { class_type: "UNETLoader" },
      "2": { class_type: "CLIPLoader", inputs: { type: "lumina2" } },
      "3": { class_type: "VAELoader", inputs: { vae_name: "ae.safetensors" } },
      "4": { class_type: "ModelSamplingAuraFlow" },
      "5": { class_type: "LoadImage", inputs: { image: "ref.png" } },
      "6": {
        class_type: "VAEEncode",
        inputs: { pixels: ["5", 0], vae: ["3", 0] },
      },
      "9": {
        class_type: "KSampler",
        inputs: {
          denoise: 0.55,
          scheduler: "simple",
          model: ["4", 0],
          latent_image: ["6", 0],
        },
      },
    });
  });

  it("wires Flux img2img through DualCLIP, NexBlend LoRA, and VAEEncode", () => {
    const workflow = buildImg2ImgWorkflow({
      ...baseTxt2Img,
      model: "fluxedUpFluxNSFW_71FP16.safetensors",
      imageName: "ref.png",
      denoisingStrength: 0.65,
      cfgScale: 3.5,
      sampler: "dpmpp_2m",
    });

    expect(workflow).toMatchObject({
      "1": { class_type: "UNETLoader" },
      "2": { class_type: "DualCLIPLoader", inputs: { type: "flux" } },
      "3": { class_type: "VAELoader", inputs: { vae_name: "ae.safetensors" } },
      "4": {
        class_type: "LoraLoader",
        inputs: {
          lora_name: "Flux/NexBlend 01 Asian Realistic Flux.safetensors",
          strength_model: 0.8,
        },
      },
      "5": { class_type: "LoadImage", inputs: { image: "ref.png" } },
      "6": {
        class_type: "VAEEncode",
        inputs: { pixels: ["5", 0], vae: ["3", 0] },
      },
      "9": {
        class_type: "FluxGuidance",
        inputs: { guidance: 3.5 },
      },
      "10": {
        class_type: "KSampler",
        inputs: {
          denoise: 0.65,
          cfg: 1,
          scheduler: "beta",
          model: ["4", 0],
          latent_image: ["6", 0],
          positive: ["9", 0],
        },
      },
    });
  });
});

describe("ComfyUI HTTP helpers", () => {
  it("lists checkpoints from /models/checkpoints", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/models/checkpoints")) {
        return Response.json(["a.safetensors", "b.safetensors"]);
      }
      if (url.endsWith("/models/diffusion_models")) {
        return Response.json([]);
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    await expect(listComfyModels("http://comfy.test")).resolves.toEqual([
      { id: "a.safetensors", title: "a.safetensors" },
      { id: "b.safetensors", title: "b.safetensors" },
    ]);
  });

  it("merges Z-Image, Flux, and Wan T2V diffusion models into the listing", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/models/checkpoints")) {
        return Response.json(["sdxl.safetensors"]);
      }
      if (url.endsWith("/models/diffusion_models")) {
        return Response.json([
          "z_image_turbo_bf16.safetensors",
          "fluxedUpFluxNSFW_71FP16.safetensors",
          "wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors",
          "wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors",
          "other_unet.safetensors",
        ]);
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    await expect(listComfyModels("http://comfy.test")).resolves.toEqual([
      { id: "sdxl.safetensors", title: "sdxl.safetensors" },
      {
        id: "z_image_turbo_bf16.safetensors",
        title: "z_image_turbo_bf16.safetensors",
      },
      {
        id: "fluxedUpFluxNSFW_71FP16.safetensors",
        title: "fluxedUpFluxNSFW_71FP16.safetensors",
      },
      {
        id: "wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors",
        title: "wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors",
      },
    ]);
  });

  it("lists samplers from KSampler object_info", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        KSampler: {
          input: { required: { sampler_name: [["euler", "dpmpp_2m"]] } },
        },
      }),
    );

    await expect(listComfySamplers("http://comfy.test")).resolves.toEqual([
      "euler",
      "dpmpp_2m",
    ]);
  });

  it("queues a prompt, polls history, and fetches the image", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/prompt")) {
        return Response.json({ prompt_id: "pid-1" });
      }
      if (url.includes("/history/pid-1")) {
        return Response.json({
          "pid-1": {
            outputs: {
              "9": {
                images: [
                  { filename: "out.png", subfolder: "", type: "output" },
                ],
              },
            },
          },
        });
      }
      if (url.includes("/view?")) {
        return new Response(Buffer.from("png-bytes"), { status: 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const result = await comfyTxt2Img(
      {
        model: "model.safetensors",
        prompt: "a cat",
        negativePrompt: "",
        width: 512,
        height: 512,
        steps: 10,
        cfgScale: 7,
        sampler: "euler",
        seed: 9,
      },
      "http://comfy.test",
    );

    expect(result.seed).toBe(9);
    expect(Buffer.from(result.imageBase64, "base64").toString()).toBe(
      "png-bytes",
    );

    const promptCall = fetchSpy.mock.calls.find((call) =>
      String(call[0]).endsWith("/prompt"),
    );
    expect(promptCall).toBeTruthy();
    const body = JSON.parse(String((promptCall?.[1] as RequestInit).body)) as {
      prompt: { "4": { inputs: { ckpt_name: string } } };
    };
    expect(body.prompt["4"].inputs.ckpt_name).toBe("model.safetensors");
  });
});

describe("comfy progress helpers", () => {
  it("builds a websocket URL from the HTTP base", () => {
    expect(comfyWebSocketUrl("http://127.0.0.1:8188", "abc")).toBe(
      "ws://127.0.0.1:8188/ws?clientId=abc",
    );
    expect(comfyWebSocketUrl("https://example.test", "x y")).toBe(
      "wss://example.test/ws?clientId=x%20y",
    );
  });

  it("parses matching progress frames", () => {
    expect(
      parseComfyProgressMessage(
        { type: "progress", data: { value: 3, max: 12, prompt_id: "p1" } },
        "p1",
      ),
    ).toEqual({ percent: 25 });

    expect(
      parseComfyProgressMessage(
        { type: "progress", data: { value: 3, max: 12, prompt_id: "other" } },
        "p1",
      ),
    ).toBeNull();
  });
});
