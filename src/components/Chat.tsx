"use client";

import { useRef, useState } from "react";

import type { SessionMessage } from "@/lib/db/sessions";
import type { ParameterValues } from "@/lib/params";
import type { Model } from "@/lib/providers/types";

import SystemPrompt from "./SystemPrompt";

const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";

interface Turn {
  id: number;
  role: "user" | "assistant" | "error";
  content: string;
}

export default function Chat({
  model,
  parameters,
  initialSystemPrompt,
  initialMessages = [],
  onPersist,
}: {
  model: Model | null;
  parameters: ParameterValues;
  /** Restored from a saved session; only read when the component mounts.
   *  `undefined` means the session stored none, which folds the section shut. */
  initialSystemPrompt?: string;
  initialMessages?: SessionMessage[];
  /** Called once a turn settles, so the session can be written to disk. */
  onPersist?: (state: {
    systemPrompt: string;
    messages: SessionMessage[];
  }) => void;
}) {
  const storedPrompt = initialSystemPrompt !== undefined;
  const [systemPrompt, setSystemPrompt] = useState(
    initialSystemPrompt ?? DEFAULT_SYSTEM_PROMPT,
  );
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
          parameters,
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-6">
          <SystemPrompt
            value={systemPrompt}
            onChange={setSystemPrompt}
            onCommit={() => persist(conversation(), systemPrompt)}
            defaultOpen={storedPrompt}
          />

          {turns.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-display text-h2 text-ink">
                Nothing here yet.
              </p>
              <p className="mt-2 text-body text-ink-muted">
                {model
                  ? "Send a message to start the conversation."
                  : "Pick a model above, then send your first message."}
              </p>
            </div>
          ) : (
            <ol className="flex flex-col gap-4">
              {turns.map((turn) => {
                if (turn.role === "user") {
                  return (
                    <li key={turn.id} className="flex flex-col items-end gap-1">
                      <span className="text-meta text-ink-subtle">You</span>
                      <p className="max-w-[85%] rounded-md bg-accent-subtle px-4 py-2.5 text-body break-words whitespace-pre-wrap text-ink">
                        {turn.content}
                      </p>
                    </li>
                  );
                }

                if (turn.role === "error") {
                  return (
                    <li
                      key={turn.id}
                      className="flex flex-col items-start gap-1"
                    >
                      <span className="text-meta text-danger">Error</span>
                      <p className="max-w-[85%] rounded-md border border-danger bg-surface px-4 py-2.5 text-body break-words whitespace-pre-wrap text-danger">
                        {turn.content}
                      </p>
                    </li>
                  );
                }

                return (
                  <li key={turn.id} className="flex flex-col items-start gap-1">
                    <span className="text-meta text-ink-subtle">Assistant</span>
                    <p className="max-w-[85%] rounded-md border border-border bg-surface px-4 py-2.5 text-body break-words whitespace-pre-wrap text-ink">
                      {turn.content}
                      {turn.id === streamingId && (
                        // Reduced motion is handled globally in globals.css.
                        <span className="ml-0.5 animate-pulse text-accent-text">
                          ▋
                        </span>
                      )}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>

      <form
        className="shrink-0 border-t border-border bg-surface"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-4">
          <textarea
            className="w-full resize-y rounded-md border border-border bg-canvas px-3.5 py-2.5 text-body text-ink transition-colors placeholder:text-ink-subtle focus:border-accent disabled:cursor-not-allowed disabled:text-ink-subtle"
            rows={3}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              model ? `Message ${model.id}` : "Select a model to start chatting"
            }
            disabled={!model}
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-sm bg-accent px-4 py-1.5 text-label text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-border disabled:text-ink-subtle"
              disabled={!model || streaming || input.trim() === ""}
            >
              Send
            </button>
            <button
              type="button"
              className="rounded-sm border border-border px-3 py-1.5 text-label text-ink-muted transition-colors hover:border-border-strong hover:text-ink disabled:cursor-not-allowed disabled:text-ink-subtle"
              onClick={() => abortRef.current?.abort()}
              disabled={!streaming}
            >
              Stop
            </button>
            <button
              type="button"
              className="ml-auto rounded-sm px-3 py-1.5 text-label text-ink-subtle transition-colors hover:text-ink disabled:cursor-not-allowed disabled:text-ink-subtle disabled:hover:text-ink-subtle"
              onClick={() => {
                setTurns([]);
                persist([], systemPrompt);
              }}
              disabled={streaming || turns.length === 0}
            >
              Clear
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
