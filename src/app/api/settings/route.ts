import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/db/client";
import { clearSetting, getSetting, setSetting } from "@/lib/db/settings";
import {
  OPENROUTER_API_KEY,
  maskApiKey,
  verifyApiKey,
} from "@/lib/providers/openrouter";

export const dynamic = "force-dynamic";

/**
 * What the browser is allowed to know about a stored credential: that it
 * exists, and just enough of it to recognise which one. The value itself never
 * leaves the server.
 */
function settingsPayload() {
  const key = getSetting(getDatabase(), OPENROUTER_API_KEY);
  return {
    openrouter: {
      configured: key !== null,
      hint: key === null ? null : maskApiKey(key),
    },
  };
}

export async function GET() {
  return NextResponse.json(settingsPayload());
}

export async function PUT(request: Request) {
  let body: { apiKey?: unknown };
  try {
    body = (await request.json()) as { apiKey?: unknown };
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (apiKey === "") {
    return NextResponse.json(
      { error: "An OpenRouter API key is required." },
      { status: 400 },
    );
  }

  // Checked before it is stored, so a bad key is an error the user sees now
  // rather than an empty model list later.
  const verdict = await verifyApiKey(apiKey);
  if (!verdict.valid) {
    return NextResponse.json({ error: verdict.error }, { status: 400 });
  }

  setSetting(getDatabase(), OPENROUTER_API_KEY, apiKey);
  return NextResponse.json(settingsPayload());
}

export async function DELETE() {
  clearSetting(getDatabase(), OPENROUTER_API_KEY);
  return NextResponse.json(settingsPayload());
}
