import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/db/client";
import { deleteSession, getSession, updateSession } from "@/lib/db/sessions";

import { parseSessionInput } from "../input";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const notFound = () =>
  NextResponse.json({ error: "Session not found." }, { status: 404 });

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const session = getSession(getDatabase(), id);
  return session ? NextResponse.json({ session }) : notFound();
}

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const input = parseSessionInput(body);
  if ("error" in input) {
    return NextResponse.json({ error: input.error }, { status: 400 });
  }

  const session = updateSession(getDatabase(), id, input.value);
  return session ? NextResponse.json({ session }) : notFound();
}

export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  return deleteSession(getDatabase(), id)
    ? NextResponse.json({ deleted: true })
    : notFound();
}
