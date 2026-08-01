import type {
  ChatRequest,
  ChatResponse,
  Model,
  Provider,
} from "./types";

export interface OpenAICompatibleProviderOptions {
  id: string;
  name: string;
  /** Root of the OpenAI-compatible API, e.g. `http://localhost:11434/v1`. */
  baseUrl: string;
}

interface ModelsPayload {
  data?: { id?: unknown }[];
}

interface ChatCompletionPayload {
  choices?: { message?: { content?: unknown } }[];
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

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        stream: false,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `${this.name} returned ${response.status} ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as ChatCompletionPayload;
    const content = payload.choices?.[0]?.message?.content;

    return { content: typeof content === "string" ? content : "" };
  }
}
