"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useShellSlots } from "@/components/AppShell";
import Chat from "@/components/Chat";
import ModelPicker from "@/components/ModelPicker";
import ParameterSidebar from "@/components/ParameterSidebar";
import SessionSidebar from "@/components/SessionSidebar";
import type { Session, SessionMessage, SessionSummary } from "@/lib/db/sessions";
import { DEFAULT_PARAMETERS, type ParameterValues } from "@/lib/params";
import type { Model } from "@/lib/providers/types";

export default function Home() {
  const [model, setModel] = useState<Model | null>(null);

  // Parameters stay session-independent on purpose (ALI-9 NG-1).
  const [parameters, setParameters] = useState<ParameterValues>({
    ...DEFAULT_PARAMETERS,
  });

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [active, setActive] = useState<Session | null>(null);

  const { contextualEl, inspectorEl } = useShellSlots();

  const refreshSessions = useCallback(async () => {
    const response = await fetch("/api/sessions");
    if (!response.ok) return;
    const payload = (await response.json()) as { sessions: SessionSummary[] };
    setSessions(payload.sessions);
  }, []);

  const openSession = useCallback(async (id: string) => {
    const response = await fetch(`/api/sessions/${id}`);
    if (!response.ok) return;
    const payload = (await response.json()) as { session: Session };
    setActive(payload.session);
    setModel(
      payload.session.providerId && payload.session.modelId
        ? {
            id: payload.session.modelId,
            providerId: payload.session.providerId,
            providerName: payload.session.providerId,
          }
        : null,
    );
  }, []);

  const startSession = useCallback(async () => {
    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!response.ok) return;
    const payload = (await response.json()) as { session: Session };
    setActive(payload.session);
    await refreshSessions();
  }, [refreshSessions]);

  // Resume where the user left off: newest session, or a fresh one.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const response = await fetch("/api/sessions");
      if (!response.ok || cancelled) return;
      const payload = (await response.json()) as { sessions: SessionSummary[] };
      if (cancelled) return;

      setSessions(payload.sessions);
      if (payload.sessions[0]) await openSession(payload.sessions[0].id);
      else await startSession();
    })();

    return () => {
      cancelled = true;
    };
  }, [openSession, startSession]);

  const patchSession = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      const response = await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { session: Session };
      setActive((current) =>
        current?.id === payload.session.id ? payload.session : current,
      );
      await refreshSessions();
    },
    [refreshSessions],
  );

  const handleModelChange = (next: Model | null) => {
    setModel(next);
    if (active) {
      void patchSession(active.id, {
        providerId: next?.providerId ?? null,
        modelId: next?.id ?? null,
      });
    }
  };

  const handlePersist = (state: {
    systemPrompt: string;
    messages: SessionMessage[];
  }) => {
    if (active) void patchSession(active.id, state);
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    if (active?.id === id) {
      setActive(null);
      setModel(null);
    }
    await refreshSessions();
    if (active?.id === id) await startSession();
  };

  const modelKey = model ? `${model.providerId}:${model.id}` : "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border bg-surface px-6 py-3">
        <div className="mx-auto w-full max-w-3xl">
          <ModelPicker value={modelKey} onChange={handleModelChange} />
        </div>
      </header>

      {active && (
        <Chat
          key={active.id}
          model={model}
          parameters={parameters}
          initialSystemPrompt={
            active.systemPrompt === "" ? undefined : active.systemPrompt
          }
          initialMessages={active.messages}
          onPersist={handlePersist}
        />
      )}

      {contextualEl &&
        createPortal(
          <SessionSidebar
            sessions={sessions}
            activeId={active?.id ?? null}
            onSelect={(id) => void openSession(id)}
            onNew={() => void startSession()}
            onRename={(id, name) => void patchSession(id, { name })}
            onDelete={(id) => void handleDelete(id)}
          />,
          contextualEl,
        )}

      {inspectorEl &&
        createPortal(
          <ParameterSidebar values={parameters} onChange={setParameters} />,
          inspectorEl,
        )}
    </div>
  );
}
