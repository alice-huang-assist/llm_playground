import { NextResponse } from "next/server";

import {
  FORGE_PROVIDER_ID,
  getForgeBaseUrl,
  listForgeSamplers,
} from "@/lib/providers/forge";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const providerId =
    new URL(request.url).searchParams.get("providerId") ?? FORGE_PROVIDER_ID;

  if (providerId !== FORGE_PROVIDER_ID) {
    return NextResponse.json(
      { error: `Unknown image provider "${providerId}".` },
      { status: 400 },
    );
  }

  const baseUrl = getForgeBaseUrl();
  try {
    const samplers = await listForgeSamplers(baseUrl);
    return NextResponse.json({ providerId, reachable: true, samplers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      providerId,
      reachable: false,
      error: message,
      samplers: [],
    });
  }
}
