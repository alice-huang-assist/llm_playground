import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/db/client";
import { createGeneration } from "@/lib/db/generations";
import { clampImageParams, forgeSeed } from "@/lib/image-params";
import {
  COMFYUI_PROVIDER_ID,
  comfyRandomSeed,
  comfyTxt2Img,
  getComfyBaseUrl,
  interruptComfy,
} from "@/lib/providers/comfyui";
import {
  FORGE_PROVIDER_ID,
  forgeTxt2Img,
  getForgeBaseUrl,
  interruptForge,
} from "@/lib/providers/forge";

export const dynamic = "force-dynamic";

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export async function POST(request: Request) {
  let body: {
    providerId?: unknown;
    model?: unknown;
    prompt?: unknown;
    negativePrompt?: unknown;
    width?: unknown;
    height?: unknown;
    steps?: unknown;
    cfgScale?: unknown;
    seed?: unknown;
    sampler?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return badRequest("Request body must be JSON.");
  }

  const providerId =
    typeof body.providerId === "string" ? body.providerId.trim() : "";
  if (
    providerId !== FORGE_PROVIDER_ID &&
    providerId !== COMFYUI_PROVIDER_ID
  ) {
    return badRequest(
      providerId === ""
        ? "A provider must be selected."
        : `Unknown image provider "${providerId}".`,
    );
  }

  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (model === "") return badRequest("A model must be selected.");

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (prompt === "") return badRequest("A prompt is required.");

  const negativePrompt =
    typeof body.negativePrompt === "string" ? body.negativePrompt.trim() : "";

  const sampler = typeof body.sampler === "string" ? body.sampler.trim() : "";
  if (sampler === "") return badRequest("A sampler must be selected.");

  const params = clampImageParams({
    width: body.width,
    height: body.height,
    steps: body.steps,
    cfgScale: body.cfgScale,
    seed: body.seed,
  });

  const forgeBase = getForgeBaseUrl();
  const comfyBase = getComfyBaseUrl();

  try {
    let imageBase64: string;
    let resultSeed: number | null;

    if (providerId === FORGE_PROVIDER_ID) {
      const result = await forgeTxt2Img(
        {
          model,
          prompt,
          negativePrompt,
          width: params.width,
          height: params.height,
          steps: params.steps,
          cfgScale: params.cfgScale,
          sampler,
          seed: forgeSeed(params.seed),
          signal: request.signal,
        },
        forgeBase,
      );
      imageBase64 = result.imageBase64;
      resultSeed = result.seed;
    } else {
      const seed =
        params.seed !== null ? params.seed : comfyRandomSeed();
      const result = await comfyTxt2Img(
        {
          model,
          prompt,
          negativePrompt,
          width: params.width,
          height: params.height,
          steps: params.steps,
          cfgScale: params.cfgScale,
          sampler,
          seed,
          signal: request.signal,
        },
        comfyBase,
      );
      imageBase64 = result.imageBase64;
      resultSeed = result.seed;
    }

    const imageBytes = Buffer.from(imageBase64, "base64");
    const storedSeed =
      params.seed !== null
        ? params.seed
        : resultSeed !== null && resultSeed >= 0
          ? resultSeed
          : null;

    const generation = createGeneration(getDatabase(), {
      providerId,
      modelId: model,
      prompt,
      negativePrompt,
      width: params.width,
      height: params.height,
      steps: params.steps,
      seed: storedSeed,
      cfgScale: params.cfgScale,
      sampler,
      imageBytes,
    });

    return NextResponse.json({ generation });
  } catch (error) {
    if (request.signal.aborted) {
      if (providerId === FORGE_PROVIDER_ID) await interruptForge(forgeBase);
      else await interruptComfy(comfyBase);
      return NextResponse.json(
        { error: "Generation cancelled." },
        { status: 499 },
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    const name =
      providerId === FORGE_PROVIDER_ID ? "Forge" : "ComfyUI";
    return NextResponse.json(
      { error: `${name} could not complete the request: ${message}` },
      { status: 502 },
    );
  }
}
