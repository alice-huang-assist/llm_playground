import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildImg2ImgWorkflow,
  buildTxt2ImgWorkflow,
  comfyTxt2Img,
  comfyWebSocketUrl,
  isSd3Checkpoint,
  listComfyModels,
  listComfySamplers,
  normalizeComfyBaseUrl,
  parseComfyProgressMessage,
  resolveComfyBaseUrl,
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

describe("buildImg2ImgWorkflow", () => {
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
});

describe("ComfyUI HTTP helpers", () => {
  it("lists checkpoints from /models/checkpoints", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(["a.safetensors", "b.safetensors"]),
    );

    await expect(listComfyModels("http://comfy.test")).resolves.toEqual([
      { id: "a.safetensors", title: "a.safetensors" },
      { id: "b.safetensors", title: "b.safetensors" },
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
