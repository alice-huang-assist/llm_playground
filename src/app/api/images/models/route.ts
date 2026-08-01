import { NextResponse } from "next/server";

import {
  COMFYUI_PROVIDER_ID,
  COMFYUI_PROVIDER_NAME,
  getComfyBaseUrl,
  listComfyModels,
} from "@/lib/providers/comfyui";
import {
  FORGE_PROVIDER_ID,
  FORGE_PROVIDER_NAME,
  getForgeBaseUrl,
  listForgeModels,
} from "@/lib/providers/forge";

export const dynamic = "force-dynamic";

async function forgeProvider() {
  const baseUrl = getForgeBaseUrl();
  try {
    const models = await listForgeModels(baseUrl);
    return {
      providerId: FORGE_PROVIDER_ID,
      providerName: FORGE_PROVIDER_NAME,
      reachable: true,
      baseUrl,
      models,
    };
  } catch (error) {
    return {
      providerId: FORGE_PROVIDER_ID,
      providerName: FORGE_PROVIDER_NAME,
      reachable: false,
      baseUrl,
      error: error instanceof Error ? error.message : String(error),
      models: [],
    };
  }
}

async function comfyProvider() {
  const baseUrl = getComfyBaseUrl();
  try {
    const models = await listComfyModels(baseUrl);
    return {
      providerId: COMFYUI_PROVIDER_ID,
      providerName: COMFYUI_PROVIDER_NAME,
      reachable: true,
      baseUrl,
      models,
    };
  } catch (error) {
    return {
      providerId: COMFYUI_PROVIDER_ID,
      providerName: COMFYUI_PROVIDER_NAME,
      reachable: false,
      baseUrl,
      error: error instanceof Error ? error.message : String(error),
      models: [],
    };
  }
}

/** Image-provider model discovery for Forge and ComfyUI. */
export async function GET() {
  const providers = await Promise.all([forgeProvider(), comfyProvider()]);
  return NextResponse.json({ providers });
}
