"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  DEFAULT_COMFYUI_BASE_URL,
  normalizeComfyBaseUrl,
} from "@/lib/providers/comfyui-shared";
import {
  DEFAULT_FORGE_BASE_URL,
  normalizeForgeBaseUrl,
} from "@/lib/providers/forge-shared";

import styles from "./page.module.css";

interface SettingsPayload {
  openrouter: { configured: boolean; hint: string | null };
  forge: { baseUrl: string; isDefault: boolean };
  comfyui: { baseUrl: string; isDefault: boolean };
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [forgeUrl, setForgeUrl] = useState(DEFAULT_FORGE_BASE_URL);
  const [comfyUrl, setComfyUrl] = useState(DEFAULT_COMFYUI_BASE_URL);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    } finally {
      setBusy(false);
    }
  }

  const configured = settings?.openrouter.configured ?? false;
  const forgeOpenHref =
    normalizeForgeBaseUrl(forgeUrl) ?? DEFAULT_FORGE_BASE_URL;
  const comfyOpenHref =
    normalizeComfyBaseUrl(comfyUrl) ?? DEFAULT_COMFYUI_BASE_URL;

  return (
    <div className={styles.main}>
      <section className={styles.section}>
        <h2 className={styles.heading}>Forge (image generation)</h2>
        <p className={styles.note}>
          Base URL of a local Forge or A1111-compatible server exposing{" "}
          <code>/sdapi/v1</code>. Default is{" "}
          <code>{DEFAULT_FORGE_BASE_URL}</code>. See{" "}
          <Link href="/docs/images">Images setup docs</Link>.
        </p>

        <form
          className={styles.row}
          onSubmit={(event) => {
            event.preventDefault();
            void saveForge();
          }}
        >
          <input
            className={styles.input}
            type="url"
            value={forgeUrl}
            onChange={(event) => setForgeUrl(event.target.value)}
            placeholder={DEFAULT_FORGE_BASE_URL}
            autoComplete="off"
            aria-label="Forge base URL"
            disabled={busy}
          />
          <button type="submit" className={styles.button} disabled={busy}>
            Save
          </button>
          <a
            className={styles.button}
            href={forgeOpenHref}
            target="_blank"
            rel="noreferrer"
          >
            Open
          </a>
        </form>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>ComfyUI (image generation)</h2>
        <p className={styles.note}>
          Base URL of a local ComfyUI server with the HTTP API enabled. Default
          is <code>{DEFAULT_COMFYUI_BASE_URL}</code>.
        </p>

        <form
          className={styles.row}
          onSubmit={(event) => {
            event.preventDefault();
            void saveComfy();
          }}
        >
          <input
            className={styles.input}
            type="url"
            value={comfyUrl}
            onChange={(event) => setComfyUrl(event.target.value)}
            placeholder={DEFAULT_COMFYUI_BASE_URL}
            autoComplete="off"
            aria-label="ComfyUI base URL"
            disabled={busy}
          />
          <button type="submit" className={styles.button} disabled={busy}>
            Save
          </button>
          <a
            className={styles.button}
            href={comfyOpenHref}
            target="_blank"
            rel="noreferrer"
          >
            Open
          </a>
        </form>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>OpenRouter</h2>
        <p className={styles.note}>
          Reaches open-weight models too large to run locally. The key is stored
          on this machine and never sent to the browser.
        </p>

        {settings === null ? (
          <p className={styles.status}>Loading…</p>
        ) : (
          <p className={styles.status}>
            {configured ? (
              <>
                Configured — key ending{" "}
                <code className={styles.hint}>{settings.openrouter.hint}</code>
              </>
            ) : (
              "Not configured. OpenRouter is absent from the model picker."
            )}
          </p>
        )}

        <form
          className={styles.row}
          onSubmit={(event) => {
            event.preventDefault();
            void saveOpenRouter();
          }}
        >
          <input
            className={styles.input}
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
            className={styles.button}
            disabled={busy || apiKey.trim() === ""}
          >
            Save
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={() => void clearOpenRouter()}
            disabled={busy || !configured}
          >
            Clear
          </button>
        </form>
      </section>

      {error && <p className={styles.error}>{error}</p>}
      {notice && <p className={styles.notice}>{notice}</p>}
    </div>
  );
}
