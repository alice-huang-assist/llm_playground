/**
 * Ollama-specific calls that fall outside the OpenAI-compatible surface.
 * Pulling a model has no equivalent in the OpenAI API, so it does not belong
 * on the shared `Provider` adapter.
 */

/** Root of Ollama's own HTTP API; its OpenAI-compatible surface hangs off `/v1`. */
export const OLLAMA_HOST = "http://localhost:11434";

/** Id of the Ollama entry in the provider registry. */
export const OLLAMA_PROVIDER_ID = "ollama";

export interface PullProgress {
  /** Ollama's own wording, e.g. `pulling manifest`, `verifying sha256 digest`. */
  status: string;
  /** The layer being fetched, when the line describes one. */
  digest: string | null;
  completed: number | null;
  total: number | null;
  /** 0–100, or null for lines that carry no byte counts. */
  percent: number | null;
}

interface PullPayload {
  status?: unknown;
  digest?: unknown;
  completed?: unknown;
  total?: unknown;
  error?: unknown;
}

type PullLine =
  | { type: "progress"; progress: PullProgress }
  | { type: "error"; message: string }
  | { type: "ignore" };

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Classify one NDJSON line of Ollama's `/api/pull` response. */
export function parsePullLine(line: string): PullLine {
  const trimmed = line.trim();
  if (trimmed === "") return { type: "ignore" };

  let payload: PullPayload;
  try {
    payload = JSON.parse(trimmed) as PullPayload;
  } catch {
    return { type: "ignore" };
  }

  if (typeof payload.error === "string" && payload.error !== "") {
    return { type: "error", message: payload.error };
  }

  if (typeof payload.status !== "string") return { type: "ignore" };

  const completed = asNumber(payload.completed);
  const total = asNumber(payload.total);

  return {
    type: "progress",
    progress: {
      status: payload.status,
      digest: typeof payload.digest === "string" ? payload.digest : null,
      completed,
      total,
      percent:
        completed !== null && total !== null && total > 0
          ? Math.min(100, Math.round((completed / total) * 100))
          : null,
    },
  };
}

/**
 * Turn Ollama's NDJSON pull response into progress updates. An error payload
 * can arrive mid-stream after a perfectly healthy start — a bad model name is
 * reported that way — so it is thrown rather than skipped.
 */
export async function* parsePullStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<PullProgress> {
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
        const parsed = parsePullLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);

        if (parsed.type === "error") throw new Error(parsed.message);
        if (parsed.type === "progress") yield parsed.progress;

        newline = buffer.indexOf("\n");
      }
    }

    // A final line the server never terminated with a newline.
    const parsed = parsePullLine(buffer);
    if (parsed.type === "error") throw new Error(parsed.message);
    if (parsed.type === "progress") yield parsed.progress;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Ask Ollama to download a model, streaming its progress. Aborting the signal
 * closes the request; Ollama keeps whatever layers it already wrote and the
 * next pull resumes from there.
 */
export async function* pullModel({
  name,
  signal,
}: {
  name: string;
  signal?: AbortSignal;
}): AsyncGenerator<PullProgress> {
  const response = await fetch(`${OLLAMA_HOST}/api/pull`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify({ model: name, stream: true }),
    signal,
    cache: "no-store",
  });

  if (!response.ok) {
    // Ollama reports a bad request as JSON with an `error` field.
    const text = await response.text().catch(() => "");
    let message = `Ollama returned ${response.status} ${response.statusText}`;
    try {
      const payload = JSON.parse(text) as PullPayload;
      if (typeof payload.error === "string" && payload.error !== "") {
        message = payload.error;
      }
    } catch {
      if (text.trim() !== "") message = text.trim();
    }
    throw new Error(message);
  }

  if (!response.body) {
    throw new Error("Ollama returned an empty response body");
  }

  yield* parsePullStream(response.body);
}
