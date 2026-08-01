import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/db/client";
import { deleteGenerationsByBatchId } from "@/lib/db/generations";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ batchId: string }> };

export async function DELETE(_request: Request, context: Context) {
  const { batchId } = await context.params;
  if (!batchId || batchId.trim() === "") {
    return NextResponse.json({ error: "Batch id is required." }, { status: 400 });
  }

  const deleted = deleteGenerationsByBatchId(getDatabase(), batchId);
  if (deleted === 0) {
    return NextResponse.json({ error: "Batch not found." }, { status: 404 });
  }
  return NextResponse.json({ deleted: true, count: deleted });
}
