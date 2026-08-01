import type { SessionInput, SessionMessage } from "@/lib/db/sessions";

type Parsed =
  | { value: SessionInput }
  | { error: string };

function isMessage(value: unknown): value is SessionMessage {
  if (typeof value !== "object" || value === null) return false;
  const { role, content } = value as { role?: unknown; content?: unknown };
  return (role === "user" || role === "assistant") && typeof content === "string";
}

/**
 * Validate a session create/update body. Absent fields stay absent so a caller
 * saving messages does not silently blank the name or model.
 */
export function parseSessionInput(body: unknown): Parsed {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object." };
  }

  const raw = body as Record<string, unknown>;
  const value: SessionInput = {};

  if (raw.name !== undefined) {
    if (typeof raw.name !== "string") return { error: "name must be a string." };
    value.name = raw.name.trim();
  }

  if (raw.providerId !== undefined) {
    if (raw.providerId !== null && typeof raw.providerId !== "string") {
      return { error: "providerId must be a string or null." };
    }
    value.providerId = raw.providerId;
  }

  if (raw.modelId !== undefined) {
    if (raw.modelId !== null && typeof raw.modelId !== "string") {
      return { error: "modelId must be a string or null." };
    }
    value.modelId = raw.modelId;
  }

  if (raw.systemPrompt !== undefined) {
    if (typeof raw.systemPrompt !== "string") {
      return { error: "systemPrompt must be a string." };
    }
    value.systemPrompt = raw.systemPrompt;
  }

  if (raw.messages !== undefined) {
    if (!Array.isArray(raw.messages) || !raw.messages.every(isMessage)) {
      return {
        error:
          "messages must be an array of { role: 'user' | 'assistant', content: string }.",
      };
    }
    value.messages = raw.messages;
  }

  return { value };
}
