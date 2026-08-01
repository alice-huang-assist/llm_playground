import { readFileSync } from "node:fs";

import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/db/client";
import {
  absoluteGenerationPath,
  getGeneration,
} from "@/lib/db/generations";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

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
    const bytes = readFileSync(absoluteGenerationPath(generation));
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
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
