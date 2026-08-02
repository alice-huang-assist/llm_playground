"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import ModelInstaller from "@/components/ModelInstaller";
import {
  COMFYUI_PROVIDER_ID,
  DEFAULT_COMFYUI_BASE_URL,
  normalizeComfyBaseUrl,
} from "@/lib/providers/comfyui-shared";
import {
  DEFAULT_FORGE_BASE_URL,
  FORGE_PROVIDER_ID,
  normalizeForgeBaseUrl,
} from "@/lib/providers/forge-shared";
import { OLLAMA_PROVIDER_ID } from "@/lib/providers/ollama";
import type { ProviderModels } from "@/lib/providers/types";

interface SettingsPayload {
  openrouter: { configured: boolean; hint: string | null };
  forge: { baseUrl: string; isDefault: boolean };
  comfyui: { baseUrl: string; isDefault: boolean };
}

/** `/api/images/models` reports reachability per image backend. */
interface ImageProvider {
  providerId: string;
  providerName: string;
  reachable: boolean;
  baseUrl: string;
}

type Reach = "checking" | "reachable" | "unreachable";

/** Colour never carries the meaning on its own — the label always says it. */
function Status({ state, isDefault }: { state: Reach; isDefault?: boolean }) {
  const tone =
    state === "reachable"
      ? "bg-success"
      : state === "unreachable"
        ? "bg-danger"
        : "bg-ink-subtle";
  const label =
    state === "reachable"
      ? "Reachable"
      : state === "unreachable"
        ? "Unreachable"
        : "Checking…";

  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${tone}`} />
      <span className="text-meta text-ink-muted">{label}</span>
      {isDefault && (
        <span className="text-meta text-ink-subtle">· default URL</span>
      )}
    </span>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-md border border-border bg-surface p-6">
      <h2 className="font-display text-h2 leading-none">{title}</h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [forgeUrl, setForgeUrl] = useState(DEFAULT_FORGE_BASE_URL);
  const [comfyUrl, setComfyUrl] = useState(DEFAULT_COMFYUI_BASE_URL);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reachability is discovered here now that the chat route no longer supplies
  // it (ALI-22 moved the installer off `/`).
  const [ollama, setOllama] = useState<Reach>("checking");
  const [forgeReach, setForgeReach] = useState<Reach>("checking");
  const [comfyReach, setComfyReach] = useState<Reach>("checking");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    fetch("/api/settings")
      .then((response) => response.json() as Promise<SettingsPayload>)
      .then((payload) => {
        if (active) {
          setSettings(payload);
          setForgeUrl(payload.forge.baseUrl);
          setComfyUrl(payload.comfyui.baseUrl);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // A failed probe means "not reachable", never a thrown error the page has to
  // render — hence allSettled rather than all.
  useEffect(() => {
    let active = true;

    void (async () => {
      const [llm, images] = await Promise.allSettled([
        fetch("/api/models").then(
          (r) => r.json() as Promise<{ providers: ProviderModels[] }>,
        ),
        fetch("/api/images/models").then(
          (r) => r.json() as Promise<{ providers: ImageProvider[] }>,
        ),
      ]);

      if (!active) return;

      const ollamaEntry =
        llm.status === "fulfilled"
          ? llm.value.providers.find(
              (provider) => provider.providerId === OLLAMA_PROVIDER_ID,
            )
          : undefined;
      setOllama(ollamaEntry?.reachable ? "reachable" : "unreachable");

      const find = (id: string) =>
        images.status === "fulfilled"
          ? images.value.providers.find(
              (provider) => provider.providerId === id,
            )
          : undefined;
      setForgeReach(
        find(FORGE_PROVIDER_ID)?.reachable ? "reachable" : "unreachable",
      );
      setComfyReach(
        find(COMFYUI_PROVIDER_ID)?.reachable ? "reachable" : "unreachable",
      );
    })();

    return () => {
      active = false;
    };
  }, [reloadToken]);

  async function saveOpenRouter() {
    const value = apiKey.trim();
    if (value === "" || busy) return;

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: value }),
      });
      const payload = (await response.json()) as SettingsPayload & {
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? `Could not save (${response.status}).`);
        return;
      }

      setSettings(payload);
      setApiKey("");
      setNotice("Key saved. OpenRouter models are now in the picker.");
    } finally {
      setBusy(false);
    }
  }

  async function clearOpenRouter() {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/settings", { method: "DELETE" });
      const payload = (await response.json()) as SettingsPayload;
      setSettings(payload);
      setForgeUrl(payload.forge.baseUrl);
      setComfyUrl(payload.comfyui.baseUrl);
      setNotice("Key cleared. OpenRouter is no longer offered.");
    } finally {
      setBusy(false);
    }
  }

  async function saveForge() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forgeBaseUrl: forgeUrl }),
      });
      const payload = (await response.json()) as SettingsPayload & {
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? `Could not save (${response.status}).`);
        return;
      }

      setSettings(payload);
      setForgeUrl(payload.forge.baseUrl);
      setComfyUrl(payload.comfyui.baseUrl);
      setNotice("Forge URL saved.");
      setForgeReach("checking");
      setReloadToken((token) => token + 1);
    } finally {
      setBusy(false);
    }
  }

  async function saveComfy() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comfyBaseUrl: comfyUrl }),
      });
      const payload = (await response.json()) as SettingsPayload & {
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? `Could not save (${response.status}).`);
        return;
      }

      setSettings(payload);
      setForgeUrl(payload.forge.baseUrl);
      setComfyUrl(payload.comfyui.baseUrl);
      setNotice("ComfyUI URL saved.");
      setComfyReach("checking");
      setReloadToken((token) => token + 1);
    } finally {
      setBusy(false);
    }
  }

  const configured = settings?.openrouter.configured ?? false;
  const forgeOpenHref =
    normalizeForgeBaseUrl(forgeUrl) ?? DEFAULT_FORGE_BASE_URL;
  const comfyOpenHref =
    normalizeComfyBaseUrl(comfyUrl) ?? DEFAULT_COMFYUI_BASE_URL;

  const fieldClass =
    "min-w-0 flex-1 rounded-sm border border-border bg-canvas px-3 py-1.5 font-mono text-label text-ink transition-colors placeholder:text-ink-subtle focus:border-accent disabled:text-ink-subtle";
  const saveClass =
    "rounded-sm bg-accent px-3.5 py-1.5 text-label text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-border disabled:text-ink-subtle";
  const secondaryClass =
    "rounded-sm border border-border px-3 py-1.5 text-label text-ink-muted transition-colors hover:border-border-strong hover:text-ink disabled:cursor-not-allowed disabled:text-ink-subtle";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <Card title="Models">
        {ollama === "checking" ? (
          <p className="text-meta text-ink-subtle">Checking Ollama…</p>
        ) : (
          <ModelInstaller
            available={ollama === "reachable"}
            onInstalled={() => setReloadToken((token) => token + 1)}
          />
        )}
      </Card>

      <Card title="Image backends">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-label text-ink">Forge</h3>
            <Status state={forgeReach} isDefault={settings?.forge.isDefault} />
          </div>
          <p className="text-meta text-ink-subtle">
            Base URL of a local Forge or A1111-compatible server exposing{" "}
            <code className="font-mono">/sdapi/v1</code>. See{" "}
            <Link
              href="/docs/images"
              className="text-accent-text underline underline-offset-2"
            >
              Images setup docs
            </Link>
            .
          </p>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void saveForge();
            }}
          >
            <input
              className={fieldClass}
              type="url"
              value={forgeUrl}
              onChange={(event) => setForgeUrl(event.target.value)}
              placeholder={DEFAULT_FORGE_BASE_URL}
              autoComplete="off"
              aria-label="Forge base URL"
              disabled={busy}
            />
            <button type="submit" className={saveClass} disabled={busy}>
              Save
            </button>
            <a
              className={secondaryClass}
              href={forgeOpenHref}
              target="_blank"
              rel="noreferrer"
            >
              Open
            </a>
          </form>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-label text-ink">ComfyUI</h3>
            <Status state={comfyReach} isDefault={settings?.comfyui.isDefault} />
          </div>
          <p className="text-meta text-ink-subtle">
            Base URL of a local ComfyUI server with the HTTP API enabled.
          </p>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void saveComfy();
            }}
          >
            <input
              className={fieldClass}
              type="url"
              value={comfyUrl}
              onChange={(event) => setComfyUrl(event.target.value)}
              placeholder={DEFAULT_COMFYUI_BASE_URL}
              autoComplete="off"
              aria-label="ComfyUI base URL"
              disabled={busy}
            />
            <button type="submit" className={saveClass} disabled={busy}>
              Save
            </button>
            <a
              className={secondaryClass}
              href={comfyOpenHref}
              target="_blank"
              rel="noreferrer"
            >
              Open
            </a>
          </form>
        </div>
      </Card>

      <Card title="OpenRouter">
        <p className="text-meta text-ink-subtle">
          Reaches open-weight models too large to run locally. The key is stored
          on this machine and never sent to the browser.
        </p>

        {settings === null ? (
          <p className="text-label text-ink-subtle">Loading…</p>
        ) : (
          <p className="text-label text-ink-muted">
            {configured ? (
              <>
                Configured — key ending{" "}
                <code className="font-mono text-ink">
                  {settings.openrouter.hint}
                </code>
              </>
            ) : (
              "Not configured. OpenRouter is absent from the model picker."
            )}
          </p>
        )}

        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void saveOpenRouter();
          }}
        >
          <input
            className={fieldClass}
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={configured ? "Replace the stored key" : "sk-or-…"}
            autoComplete="off"
            aria-label="OpenRouter API key"
            disabled={busy}
          />
          <button
            type="submit"
            className={saveClass}
            disabled={busy || apiKey.trim() === ""}
          >
            Save
          </button>
          <button
            type="button"
            className={secondaryClass}
            onClick={() => void clearOpenRouter()}
            disabled={busy || !configured}
          >
            Clear
          </button>
        </form>
      </Card>

      {error && (
        <p className="text-label text-danger" role="status">
          {error}
        </p>
      )}
      {notice && (
        <p className="text-label text-success" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
