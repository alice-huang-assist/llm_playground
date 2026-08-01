"use client";

import { useRef, useState } from "react";

import type { Model } from "@/lib/providers/types";

import SystemPrompt from "./SystemPrompt";
import styles from "./Chat.module.css";

const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";

interface Turn {
  id: number;
  role: "user" | "assistant" | "error";
  content: string;
}

export default function Chat({ model }: { model: Model | null }) {
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [streamingId, setStreamingId] = useState<number | null>(null);

  const streaming = streamingId !== null;
  const nextId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const takeId = () => {
    nextId.current += 1;
    return nextId.current;
  };

  const appendTo = (id: number, chunk: string) => {
    setTurns((current) =>
      current.map((turn) =>
        turn.id === id ? { ...turn, content: turn.content + chunk } : turn,
      ),
    );
  };

  const replaceWithError = (id: number, message: string) => {
    setTurns((current) =>
      current.map((turn) =>
        turn.id === id ? { ...turn, role: "error", content: message } : turn,
      ),
    );
  };

  async function send() {
    const prompt = input.trim();
    if (!model || !prompt || streaming) return;

    // Every request carries the full prior conversation; error notices are not
    // part of what the model saw.
    const history = turns
      .filter((turn) => turn.role !== "error")
      .map((turn) => ({ role: turn.role, content: turn.content }));

    const userTurn: Turn = { id: takeId(), role: "user", content: prompt };
    const replyId = takeId();

    setTurns((current) => [
      ...current,
      userTurn,
      { id: replyId, role: "assistant", content: "" },
    ]);
    setInput("");
    setStreamingId(replyId);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: model.providerId,
          model: model.id,
          systemPrompt,
          messages: [...history, { role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        replaceWithError(
          replyId,
          payload?.error ?? `Request failed (${response.status}).`,
        );
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        appendTo(replyId, decoder.decode(value, { stream: true }));
      }
    } catch (error) {
      // Stopping is a deliberate act, not a failure: the partial reply stays.
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        replaceWithError(
          replyId,
          error instanceof Error ? error.message : String(error),
        );
      }
    } finally {
      abortRef.current = null;
      setStreamingId(null);
      setTurns((current) =>
        current.filter(
          (turn) =>
            turn.id !== replyId ||
            turn.role !== "assistant" ||
            turn.content !== "",
        ),
      );
    }
  }

  return (
    <section className={styles.chat}>
      <SystemPrompt value={systemPrompt} onChange={setSystemPrompt} />

      <ol className={styles.conversation}>
        {turns.length === 0 && (
          <li className={styles.empty}>No messages yet.</li>
        )}
        {turns.map((turn) => (
          <li key={turn.id} className={styles[turn.role]}>
            <span className={styles.role}>
              {turn.role === "error" ? "Error" : turn.role}
            </span>
            <p className={styles.content}>
              {turn.content}
              {turn.role === "assistant" && turn.id === streamingId && (
                <span className={styles.cursor}>▋</span>
              )}
            </p>
          </li>
        ))}
      </ol>

      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          className={styles.input}
          rows={3}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            model ? `Message ${model.id}` : "Select a model to start chatting"
          }
          disabled={!model}
        />
        <div className={styles.controls}>
          <button
            type="submit"
            className={styles.button}
            disabled={!model || streaming || input.trim() === ""}
          >
            Send
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={() => abortRef.current?.abort()}
            disabled={!streaming}
          >
            Stop
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={() => setTurns([])}
            disabled={streaming || turns.length === 0}
          >
            Clear
          </button>
        </div>
      </form>
    </section>
  );
}
