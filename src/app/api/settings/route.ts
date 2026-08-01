import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/db/client";
import { clearSetting, getSetting, setSetting } from "@/lib/db/settings";
import {
  COMFYUI_BASE_URL_KEY,
  DEFAULT_COMFYUI_BASE_URL,
  normalizeComfyBaseUrl,
  resolveComfyBaseUrl,
} from "@/lib/providers/comfyui";
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

function settingsPayload() {
  const key = getSetting(getDatabase(), OPENROUTER_API_KEY);
  const forgeStored = getSetting(getDatabase(), FORGE_BASE_URL_KEY);
  const comfyStored = getSetting(getDatabase(), COMFYUI_BASE_URL_KEY);
  return {
    openrouter: {
      configured: key !== null,
      hint: key === null ? null : maskApiKey(key),
    },
    forge: {
      baseUrl: resolveForgeBaseUrl(forgeStored),
      isDefault: forgeStored === null || forgeStored.trim() === "",
    },
    comfyui: {
      baseUrl: resolveComfyBaseUrl(comfyStored),
      isDefault: comfyStored === null || comfyStored.trim() === "",
    },
  };
}

export async function GET() {
  return NextResponse.json(settingsPayload());
}

export async function PUT(request: Request) {
  let body: {
    apiKey?: unknown;
    forgeBaseUrl?: unknown;
    comfyBaseUrl?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const hasApiKey = Object.prototype.hasOwnProperty.call(body, "apiKey");
  const hasForge = Object.prototype.hasOwnProperty.call(body, "forgeBaseUrl");
  const hasComfy = Object.prototype.hasOwnProperty.call(body, "comfyBaseUrl");

  if (!hasApiKey && !hasForge && !hasComfy) {
    return NextResponse.json(
      {
        error:
          "Provide an OpenRouter API key, Forge base URL, and/or ComfyUI base URL.",
      },
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

  if (hasComfy) {
    const normalized = normalizeComfyBaseUrl(body.comfyBaseUrl);
    if (normalized === null) {
      return NextResponse.json(
        {
          error:
            "ComfyUI base URL must be a valid http(s) URL (e.g. http://127.0.0.1:8188).",
        },
        { status: 400 },
      );
    }
    if (normalized === DEFAULT_COMFYUI_BASE_URL) {
      clearSetting(getDatabase(), COMFYUI_BASE_URL_KEY);
    } else {
      setSetting(getDatabase(), COMFYUI_BASE_URL_KEY, normalized);
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
