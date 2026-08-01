import { NextResponse } from "next/server";

import { listAllProviderModels } from "@/lib/providers/registry";

// Providers are local servers whose model lists change as models are pulled or
// loaded, so this must never be cached.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ providers: await listAllProviderModels() });
}
