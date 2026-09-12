import { readFileSync } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/db/client";
import {
  absoluteGenerationPath,
  getGeneration,
} from "@/lib/db/generations";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

function contentTypeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  return "image/png";
}

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const generation = getGeneration(getDatabase(), id);
  if (!generation) {
    return NextResponse.json(
      { error: "Generation not found." },
      { status: 404 },
    );
  }

  try {
    const absolute = absoluteGenerationPath(generation);
    const bytes = readFileSync(absolute);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentTypeForPath(absolute),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Image file missing." },
      { status: 404 },
    );
  }
}
