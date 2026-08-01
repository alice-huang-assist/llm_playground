import { NextResponse } from "next/server";

import {
  COMFYUI_PROVIDER_ID,
  getComfyBaseUrl,
  listComfySamplers,
} from "@/lib/providers/comfyui";
import {
  FORGE_PROVIDER_ID,
  getForgeBaseUrl,
  listForgeSamplers,
} from "@/lib/providers/forge";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const providerId =
    new URL(request.url).searchParams.get("providerId") ?? FORGE_PROVIDER_ID;

  if (providerId === FORGE_PROVIDER_ID) {
    const baseUrl = getForgeBaseUrl();
    try {
      const samplers = await listForgeSamplers(baseUrl);
      return NextResponse.json({ providerId, reachable: true, samplers });
    } catch (error) {
      return NextResponse.json({
        providerId,
        reachable: false,
        error: error instanceof Error ? error.message : String(error),
        samplers: [],
      });
    }
  }

  if (providerId === COMFYUI_PROVIDER_ID) {
    const baseUrl = getComfyBaseUrl();
    try {
      const samplers = await listComfySamplers(baseUrl);
      return NextResponse.json({ providerId, reachable: true, samplers });
    } catch (error) {
      return NextResponse.json({
        providerId,
        reachable: false,
        error: error instanceof Error ? error.message : String(error),
        samplers: [],
      });
    }
  }

  return NextResponse.json(
    { error: `Unknown image provider "${providerId}".` },
    { status: 400 },
  );
}
