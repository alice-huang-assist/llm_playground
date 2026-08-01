import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/db/client";
import { listGenerations } from "@/lib/db/generations";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    generations: listGenerations(getDatabase()),
  });
}
