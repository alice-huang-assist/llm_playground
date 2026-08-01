"use client";

import { useRef, useState } from "react";

import styles from "./ModelInstaller.module.css";

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
      <p className={styles.unavailable}>
        Model install needs Ollama — start its server to install models. LM
        Studio has no pull API.
      </p>
    );
  }

  const percent = progress?.percent;
  const digest = shortDigest(progress?.digest);

  return (
    <div className={styles.installer}>
      <label className={styles.label} htmlFor="install-model">
        Install an Ollama model
      </label>

      <form
        className={styles.row}
        onSubmit={(event) => {
          event.preventDefault();
          void install();
        }}
      >
        <input
          id="install-model"
          className={styles.input}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="llama3.3:70b"
          disabled={pulling}
        />
        <button
          type="submit"
          className={styles.button}
          disabled={pulling || name.trim() === ""}
        >
          Install
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => abortRef.current?.abort()}
          disabled={!pulling}
        >
          Cancel
        </button>
      </form>

      <p className={styles.note}>
        Ollama only — LM Studio exposes no pull API. Type an exact model name.
      </p>

      {pulling && (
        <div className={styles.progress}>
          <span className={styles.status}>
            {progress?.status ?? "starting…"}
            {digest ? ` · ${digest}` : ""}
          </span>
          <span className={styles.percent}>
            {typeof percent === "number" ? `${percent}%` : "—"}
          </span>
          <progress
            className={styles.bar}
            max={100}
            value={typeof percent === "number" ? percent : undefined}
          />
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
