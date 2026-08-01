import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/db/client";
import { createGeneration } from "@/lib/db/generations";
import { clampImageParams, forgeSeed } from "@/lib/image-params";
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
  if (providerId !== FORGE_PROVIDER_ID) {
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

  const baseUrl = getForgeBaseUrl();
  const seedForForge = forgeSeed(params.seed);

  try {
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
        seed: seedForForge,
        signal: request.signal,
      },
      baseUrl,
    );

    const imageBytes = Buffer.from(result.imageBase64, "base64");
    const storedSeed =
      params.seed !== null
        ? params.seed
        : result.seed !== null && result.seed >= 0
          ? result.seed
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
      await interruptForge(baseUrl);
      return NextResponse.json(
        { error: "Generation cancelled." },
        { status: 499 },
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Forge could not complete the request: ${message}` },
      { status: 502 },
    );
  }
}
