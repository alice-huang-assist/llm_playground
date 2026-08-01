"use client";

import { useRef, useState } from "react";

import type { SessionMessage } from "@/lib/db/sessions";
import type { Model } from "@/lib/providers/types";

import SystemPrompt from "./SystemPrompt";
import styles from "./Chat.module.css";

const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";

interface Turn {
  id: number;
  role: "user" | "assistant" | "error";
  content: string;
}

export default function Chat({
  model,
  initialSystemPrompt = DEFAULT_SYSTEM_PROMPT,
  initialMessages = [],
  onPersist,
}: {
  model: Model | null;
  /** Restored from a saved session; only read when the component mounts. */
  initialSystemPrompt?: string;
  initialMessages?: SessionMessage[];
  /** Called once a turn settles, so the session can be written to disk. */
  onPersist?: (state: {
    systemPrompt: string;
    messages: SessionMessage[];
  }) => void;
}) {
  const [systemPrompt, setSystemPrompt] = useState(initialSystemPrompt);
  const [turns, setTurns] = useState<Turn[]>(() =>
    initialMessages.map((message, index) => ({
      id: index + 1,
      role: message.role,
      content: message.content,
    })),
  );
  const [input, setInput] = useState("");
  const [streamingId, setStreamingId] = useState<number | null>(null);

  const streaming = streamingId !== null;
  const nextId = useRef(initialMessages.length);
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

  const persist = (messages: SessionMessage[], prompt: string) => {
    onPersist?.({ systemPrompt: prompt, messages });
  };

  const conversation = (): SessionMessage[] =>
    turns
      .filter((turn) => turn.role !== "error")
      .map((turn) => ({
        role: turn.role as SessionMessage["role"],
        content: turn.content,
      }));

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
    const history: SessionMessage[] = conversation();

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
    let reply = "";

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
        const chunk = decoder.decode(value, { stream: true });
        reply += chunk;
        appendTo(replyId, chunk);
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

      // The turn has settled — including a stop, which keeps its partial text.
      // Saving here is why a reload can only lose a reply still streaming.
      const settled: SessionMessage[] = [
        ...history,
        { role: "user", content: prompt },
      ];
      if (reply !== "") settled.push({ role: "assistant", content: reply });
      persist(settled, systemPrompt);
    }
  }

  return (
    <section className={styles.chat}>
      <SystemPrompt
        value={systemPrompt}
        onChange={setSystemPrompt}
        onCommit={() => persist(conversation(), systemPrompt)}
      />

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
            onClick={() => {
              setTurns([]);
              persist([], systemPrompt);
            }}
            disabled={streaming || turns.length === 0}
          >
            Clear
          </button>
        </div>
      </form>
    </section>
  );
}
