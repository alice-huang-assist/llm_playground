/** A model offered by a provider, as surfaced to the rest of the app. */
export interface Model {
  /** Identifier the provider expects in a chat request, e.g. `qwen3:4b`. */
  id: string;
  /** Id of the provider this model came from. */
  providerId: string;
  /** Human-readable provider name, for labelling the model in the UI. */
  providerName: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
}

export interface ChatResponse {
  content: string;
}

/**
 * A source of models. Every provider is a local or remote server that can list
 * the models it holds and answer a chat request.
 */
export interface Provider {
  readonly id: string;
  readonly name: string;
  listModels(): Promise<Model[]>;
  chat(request: ChatRequest): Promise<ChatResponse>;
}

/** Per-provider outcome of a model listing, including the unreachable case. */
export type ProviderModels =
  | { providerId: string; providerName: string; reachable: true; models: Model[] }
  | { providerId: string; providerName: string; reachable: false; error: string };
