import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildImg2ImgWorkflow,
  buildTxt2ImgWorkflow,
  comfyTxt2Img,
  listComfyModels,
  listComfySamplers,
  normalizeComfyBaseUrl,
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
