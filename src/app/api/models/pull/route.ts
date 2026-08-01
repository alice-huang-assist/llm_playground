import { NextResponse } from "next/server";

import { pullModel } from "@/lib/providers/ollama";

// A pull streams for as long as the download takes; nothing here is cacheable.
export const dynamic = "force-dynamic";

interface PullRequestBody {
  name?: unknown;
}

/**
 * Proxies Ollama's streaming pull endpoint, normalising it to one JSON event
 * per line so the browser never talks to Ollama directly:
 *
 *   {"type":"progress","status":"pulling 2af3b8...","percent":42,"digest":"sha256:…"}
 *   {"type":"error","message":"pull model manifest: file does not exist"}
 *   {"type":"done"}
 *
 * An error is delivered as an event rather than a status code because it
 * usually arrives long after the response headers have gone out.
 */
export async function POST(request: Request) {
  let body: PullRequestBody;
  try {
    body = (await request.json()) as PullRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name === "") {
    return NextResponse.json(
      { error: "A model name is required." },
      { status: 400 },
    );
  }

  const progress = pullModel({ name, signal: request.signal })[
    Symbol.asyncIterator
  ]();

  const encoder = new TextEncoder();
  const send = (event: unknown) => encoder.encode(`${JSON.stringify(event)}\n`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const next = await progress.next();
          if (next.done) break;
          controller.enqueue(
            send({
              type: "progress",
              status: next.value.status,
              percent: next.value.percent,
              digest: next.value.digest,
              completed: next.value.completed,
              total: next.value.total,
            }),
          );
        }
        controller.enqueue(send({ type: "done" }));
      } catch (error) {
        if (!request.signal.aborted) {
          controller.enqueue(
            send({
              type: "error",
              message: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      }
      controller.close();
    },
    async cancel() {
      await progress.return?.(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
