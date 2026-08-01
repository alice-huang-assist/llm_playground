import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/db/client";
import { createSession, listSessions } from "@/lib/db/sessions";

import { parseSessionInput } from "./input";

// Sessions change as the user talks; never cache this.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ sessions: listSessions(getDatabase()) });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const input = parseSessionInput(body);
  if ("error" in input) {
    return NextResponse.json({ error: input.error }, { status: 400 });
  }

  return NextResponse.json(
    { session: createSession(getDatabase(), input.value) },
    { status: 201 },
  );
}
