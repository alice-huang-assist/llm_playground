import { NextResponse } from "next/server";

import { buildParameterPayload } from "@/lib/params";
import type { ParameterKey } from "@/lib/params";
import { providers } from "@/lib/providers/registry";
import type { ChatMessage } from "@/lib/providers/types";

// The reply is generated on demand and streamed; nothing here is cacheable.
export const dynamic = "force-dynamic";

interface ChatRequestBody {
  providerId?: unknown;
  model?: unknown;
  systemPrompt?: unknown;
  messages?: unknown;
  parameters?: unknown;
}

function isHistoryMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const { role, content } = value as { role?: unknown; content?: unknown };
  return (role === "user" || role === "assistant") && typeof content === "string";
}

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export async function POST(request: Request) {
  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return badRequest("Request body must be JSON.");
  }

  const provider = providers.find((entry) => entry.id === body.providerId);
  if (!provider) {
    return badRequest(`Unknown provider "${String(body.providerId)}".`);
  }

  if (typeof body.model !== "string" || body.model === "") {
    return badRequest("A model must be selected.");
  }

  if (!Array.isArray(body.messages) || !body.messages.every(isHistoryMessage)) {
    return badRequest(
      "messages must be an array of { role: 'user' | 'assistant', content: string }.",
    );
  }

  const systemPrompt =
    typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : "";

  // The system prompt always leads the conversation the provider sees.
  const messages: ChatMessage[] = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...body.messages]
    : [...body.messages];

  // Clamped again here: the browser is not the authority on what is in range.
  const parameters = buildParameterPayload(
    typeof body.parameters === "object" && body.parameters !== null
      ? (body.parameters as Partial<Record<ParameterKey, unknown>>)
      : null,
  );

  const deltas = provider
    .chat({ model: body.model, messages, parameters, signal: request.signal })
    [Symbol.asyncIterator]();

  // Pull the first delta before answering so a provider that is down becomes a
  // readable error response rather than an empty stream.
  let first: IteratorResult<string>;
  try {
    first = await deltas.next();
  } catch (error) {
    return NextResponse.json(
      {
        error: `${provider.name} could not complete the request: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      { status: 502 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done) controller.enqueue(encoder.encode(first.value));

        while (true) {
          const next = await deltas.next();
          if (next.done) break;
          controller.enqueue(encoder.encode(next.value));
        }
      } catch {
        // The client keeps whatever already streamed; ending the body here
        // stops the turn without discarding it.
      }
      controller.close();
    },
    async cancel() {
      await deltas.return?.(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
