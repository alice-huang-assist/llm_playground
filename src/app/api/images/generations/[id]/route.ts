import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/db/client";
import { deleteGeneration, getGeneration } from "@/lib/db/generations";

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
  return NextResponse.json({ generation });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const deleted = deleteGeneration(getDatabase(), id);
  if (!deleted) {
    return NextResponse.json(
      { error: "Generation not found." },
      { status: 404 },
    );
  }
  return NextResponse.json({ deleted: true });
}
