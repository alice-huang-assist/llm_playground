import type { ChatRequest, Model, Provider } from "./types";

export interface OpenAICompatibleProviderOptions {
  id: string;
  name: string;
  /** Root of the OpenAI-compatible API, e.g. `http://localhost:11434/v1`. */
  baseUrl: string;
}

interface ModelsPayload {
  data?: { id?: unknown }[];
}

interface ChatCompletionChunk {
  choices?: { delta?: { content?: unknown } }[];
}

type StreamLine =
  | { type: "delta"; content: string }
  | { type: "done" }
  | { type: "ignore" };

/** Classify one line of an OpenAI-style `text/event-stream` body. */
function parseStreamLine(line: string): StreamLine {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return { type: "ignore" };

  const payload = trimmed.slice("data:".length).trim();
  if (payload === "") return { type: "ignore" };
  if (payload === "[DONE]") return { type: "done" };

  let chunk: ChatCompletionChunk;
  try {
    chunk = JSON.parse(payload) as ChatCompletionChunk;
  } catch {
    // A malformed chunk is not worth failing an otherwise good stream over.
    return { type: "ignore" };
  }

  const content = chunk.choices?.[0]?.delta?.content;
  return typeof content === "string" && content !== ""
    ? { type: "delta", content }
    : { type: "ignore" };
}

/**
 * Turn an OpenAI-style streaming chat body into its sequence of content
 * deltas. Chunk boundaries are arbitrary, so lines are reassembled from a
 * buffer; the `[DONE]` sentinel ends the stream.
 */
export async function* parseChatCompletionStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);

        const parsed = parseStreamLine(line);
        if (parsed.type === "done") return;
        if (parsed.type === "delta") yield parsed.content;

        newline = buffer.indexOf("\n");
      }
    }

    // A final line the server never terminated with a newline.
    const parsed = parseStreamLine(buffer);
    if (parsed.type === "delta") yield parsed.content;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Adapter for any server that speaks the OpenAI HTTP API — Ollama, LM Studio,
 * and anything else configured by base URL.
 */
export class OpenAICompatibleProvider implements Provider {
  readonly id: string;
  readonly name: string;
  private readonly baseUrl: string;

  constructor({ id, name, baseUrl }: OpenAICompatibleProviderOptions) {
    this.id = id;
    this.name = name;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async listModels(): Promise<Model[]> {
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `${this.name} returned ${response.status} ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as ModelsPayload;

    return (payload.data ?? [])
      .map((entry) => entry?.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .map((id) => ({
        id,
        providerId: this.id,
        providerName: this.name,
      }));
  }

  async *chat(request: ChatRequest): AsyncGenerator<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        stream: true,
        ...request.parameters,
      }),
      signal: request.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `${this.name} returned ${response.status} ${response.statusText}`,
      );
    }

    if (!response.body) {
      throw new Error(`${this.name} returned an empty response body`);
    }

    yield* parseChatCompletionStream(response.body);
  }
}
