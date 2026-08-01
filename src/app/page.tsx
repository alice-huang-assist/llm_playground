"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import Chat from "@/components/Chat";
import ModelInstaller from "@/components/ModelInstaller";
import ModelPicker from "@/components/ModelPicker";
import ParameterSidebar from "@/components/ParameterSidebar";
import SessionSidebar from "@/components/SessionSidebar";
import ThemeToggle from "@/components/ThemeToggle";
import type { Session, SessionMessage, SessionSummary } from "@/lib/db/sessions";
import { DEFAULT_PARAMETERS, type ParameterValues } from "@/lib/params";
import { DEFAULT_COMFYUI_BASE_URL } from "@/lib/providers/comfyui-shared";
import { DEFAULT_FORGE_BASE_URL } from "@/lib/providers/forge-shared";
import { OLLAMA_PROVIDER_ID } from "@/lib/providers/ollama";
import type { Model, ProviderModels } from "@/lib/providers/types";

import styles from "./page.module.css";

export default function Home() {
  const [model, setModel] = useState<Model | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [ollamaReachable, setOllamaReachable] = useState(false);

  // Parameters stay session-independent on purpose (ALI-9 NG-1).
  const [parameters, setParameters] = useState<ParameterValues>({
    ...DEFAULT_PARAMETERS,
  });

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [active, setActive] = useState<Session | null>(null);

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

  const handleLoad = useCallback((providers: ProviderModels[]) => {
    setOllamaReachable(
      providers.some(
        (provider) =>
          provider.providerId === OLLAMA_PROVIDER_ID && provider.reachable,
      ),
    );
  }, []);

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
    <main className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.title}>LLM Playground</h1>
        <nav className={styles.nav}>
          <Link className={styles.navLink} href="/generate">
            Images
          </Link>
          <Link className={styles.navLink} href="/settings">
            Settings
          </Link>
          <a
            className={styles.navLink}
            href={DEFAULT_FORGE_BASE_URL}
            target="_blank"
            rel="noreferrer"
          >
            Forge
          </a>
          <a
            className={styles.navLink}
            href={DEFAULT_COMFYUI_BASE_URL}
            target="_blank"
            rel="noreferrer"
          >
            ComfyUI
          </a>
          <ThemeToggle />
        </nav>
      </div>
      <p className={styles.subtitle}>
        Models discovered across your local runtimes.
      </p>

      <div className={styles.layout}>
        <div className={styles.column}>
          <ModelPicker
            reloadToken={reloadToken}
            value={modelKey}
            onChange={handleModelChange}
            onLoad={handleLoad}
          />
          <ModelInstaller
            available={ollamaReachable}
            onInstalled={() => setReloadToken((token) => token + 1)}
          />
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
        </div>

        <div className={styles.rail}>
          <SessionSidebar
            sessions={sessions}
            activeId={active?.id ?? null}
            onSelect={(id) => void openSession(id)}
            onNew={() => void startSession()}
            onRename={(id, name) => void patchSession(id, { name })}
            onDelete={(id) => void handleDelete(id)}
          />
          <ParameterSidebar values={parameters} onChange={setParameters} />
        </div>
      </div>
    </main>
  );
}
