"use client";

import { useRef, useState } from "react";

interface PullEvent {
  type: "progress" | "error" | "done";
  status?: string;
  percent?: number | null;
  digest?: string | null;
  message?: string;
}

function shortDigest(digest: string | null | undefined) {
  if (!digest) return null;
  const bare = digest.startsWith("sha256:") ? digest.slice(7) : digest;
  return bare.slice(0, 12);
}

export default function ModelInstaller({
  available,
  onInstalled,
}: {
  /** Ollama is the only runtime with a pull API, so this hides when it is down. */
  available: boolean;
  onInstalled: () => void;
}) {
  const [name, setName] = useState("");
  const [progress, setProgress] = useState<PullEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  async function install() {
    const model = name.trim();
    // One pull at a time: the button is disabled, this is the belt and braces.
    if (!available || model === "" || pulling) return;

    setError(null);
    setProgress(null);
    setPulling(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/models/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: model }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(payload?.error ?? `Install failed (${response.status}).`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      const handle = (line: string) => {
        if (line.trim() === "") return;
        const event = JSON.parse(line) as PullEvent;
        if (event.type === "error") setError(event.message ?? "Install failed.");
        else if (event.type === "done") finished = true;
        else setProgress(event);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf("\n");
        while (newline !== -1) {
          handle(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
        }
      }
      handle(buffer);

      if (finished) {
        setName("");
        setProgress(null);
        onInstalled();
      }
    } catch (caught) {
      // Cancelling is deliberate, not a failure.
      if (!(caught instanceof DOMException && caught.name === "AbortError")) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    } finally {
      abortRef.current = null;
      setPulling(false);
      setProgress(null);
    }
  }

  if (!available) {
    return (
      <div className="rounded-sm border border-border bg-surface-sunken px-4 py-3">
        <p className="text-label text-ink">Ollama is not reachable.</p>
        <p className="mt-1 text-meta text-ink-subtle">
          Start the Ollama server to install models. LM Studio exposes no pull
          API, so it cannot install models either way.
        </p>
      </div>
    );
  }

  const percent = progress?.percent;
  const digest = shortDigest(progress?.digest);

  return (
    <div className="flex flex-col gap-3">
      <label className="text-label text-ink-muted" htmlFor="install-model">
        Install an Ollama model
      </label>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void install();
        }}
      >
        <input
          id="install-model"
          className="min-w-0 flex-1 rounded-sm border border-border bg-canvas px-3 py-1.5 font-mono text-label text-ink transition-colors placeholder:text-ink-subtle focus:border-accent disabled:text-ink-subtle"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="llama3.3:70b"
          disabled={pulling}
        />
        <button
          type="submit"
          className="rounded-sm bg-accent px-3.5 py-1.5 text-label text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-border disabled:text-ink-subtle"
          disabled={pulling || name.trim() === ""}
        >
          Install
        </button>
        <button
          type="button"
          className="rounded-sm border border-border px-3 py-1.5 text-label text-ink-muted transition-colors hover:border-border-strong hover:text-ink disabled:cursor-not-allowed disabled:text-ink-subtle"
          onClick={() => abortRef.current?.abort()}
          disabled={!pulling}
        >
          Cancel
        </button>
      </form>

      <p className="text-meta text-ink-subtle">
        Ollama only — LM Studio exposes no pull API. Type an exact model name.
      </p>

      {pulling && (
        <div className="flex flex-col gap-1.5" role="status">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-meta text-ink-muted">
              {progress?.status ?? "starting…"}
              {digest ? ` · ${digest}` : ""}
            </span>
            <span className="shrink-0 font-mono text-meta text-accent-text">
              {typeof percent === "number" ? `${percent}%` : "—"}
            </span>
          </div>
          {/* `value` left undefined renders the indeterminate bar. */}
          <progress
            className="h-1.5 w-full accent-accent"
            max={100}
            value={typeof percent === "number" ? percent : undefined}
          />
        </div>
      )}

      {error && (
        <p className="text-meta text-danger" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
