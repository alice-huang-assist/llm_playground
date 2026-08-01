import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/db/client";
import { clearSetting, getSetting, setSetting } from "@/lib/db/settings";
import {
  DEFAULT_FORGE_BASE_URL,
  FORGE_BASE_URL_KEY,
  normalizeForgeBaseUrl,
  resolveForgeBaseUrl,
} from "@/lib/providers/forge";
import {
  OPENROUTER_API_KEY,
  maskApiKey,
  verifyApiKey,
} from "@/lib/providers/openrouter";

export const dynamic = "force-dynamic";

/**
 * What the browser is allowed to know about stored settings. The OpenRouter
 * key never leaves the server; the Forge URL is not a secret.
 */
function settingsPayload() {
  const key = getSetting(getDatabase(), OPENROUTER_API_KEY);
  const forgeStored = getSetting(getDatabase(), FORGE_BASE_URL_KEY);
  return {
    openrouter: {
      configured: key !== null,
      hint: key === null ? null : maskApiKey(key),
    },
    forge: {
      baseUrl: resolveForgeBaseUrl(forgeStored),
      isDefault: forgeStored === null || forgeStored.trim() === "",
    },
  };
}

export async function GET() {
  return NextResponse.json(settingsPayload());
}

export async function PUT(request: Request) {
  let body: { apiKey?: unknown; forgeBaseUrl?: unknown };
  try {
    body = (await request.json()) as {
      apiKey?: unknown;
      forgeBaseUrl?: unknown;
    };
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const hasApiKey = Object.prototype.hasOwnProperty.call(body, "apiKey");
  const hasForge = Object.prototype.hasOwnProperty.call(body, "forgeBaseUrl");

  if (!hasApiKey && !hasForge) {
    return NextResponse.json(
      { error: "Provide an OpenRouter API key and/or a Forge base URL." },
      { status: 400 },
    );
  }

  if (hasForge) {
    const normalized = normalizeForgeBaseUrl(body.forgeBaseUrl);
    if (normalized === null) {
      return NextResponse.json(
        {
          error:
            "Forge base URL must be a valid http(s) URL (e.g. http://127.0.0.1:7860).",
        },
        { status: 400 },
      );
    }
    if (normalized === DEFAULT_FORGE_BASE_URL) {
      clearSetting(getDatabase(), FORGE_BASE_URL_KEY);
    } else {
      setSetting(getDatabase(), FORGE_BASE_URL_KEY, normalized);
    }
  }

  if (hasApiKey) {
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
  }

  return NextResponse.json(settingsPayload());
}

export async function DELETE() {
  clearSetting(getDatabase(), OPENROUTER_API_KEY);
  return NextResponse.json(settingsPayload());
}
