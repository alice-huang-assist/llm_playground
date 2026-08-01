import { NextResponse } from "next/server";

import {
  FORGE_PROVIDER_ID,
  FORGE_PROVIDER_NAME,
  getForgeBaseUrl,
  listForgeModels,
} from "@/lib/providers/forge";

export const dynamic = "force-dynamic";

/**
 * Image-provider model discovery. Today only Forge is offered; unreachable
 * backends return reachable:false so the UI can stay up.
 */
export async function GET() {
  const baseUrl = getForgeBaseUrl();

  try {
    const models = await listForgeModels(baseUrl);
    return NextResponse.json({
      providers: [
        {
          providerId: FORGE_PROVIDER_ID,
          providerName: FORGE_PROVIDER_NAME,
          reachable: true,
          baseUrl,
          models,
        },
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      providers: [
        {
          providerId: FORGE_PROVIDER_ID,
          providerName: FORGE_PROVIDER_NAME,
          reachable: false,
          baseUrl,
          error: message,
          models: [],
        },
      ],
    });
  }
}
