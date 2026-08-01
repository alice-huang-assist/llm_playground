"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import styles from "./page.module.css";

interface SettingsPayload {
  openrouter: { configured: boolean; hint: string | null };
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    fetch("/api/settings")
      .then((response) => response.json() as Promise<SettingsPayload>)
      .then((payload) => {
        if (active) setSettings(payload);
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

  async function save() {
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

  async function clear() {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/settings", { method: "DELETE" });
      setSettings((await response.json()) as SettingsPayload);
      setNotice("Key cleared. OpenRouter is no longer offered.");
    } finally {
      setBusy(false);
    }
  }

  const configured = settings?.openrouter.configured ?? false;

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
        <Link className={styles.back} href="/">
          Back to playground
        </Link>
      </div>

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
            void save();
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
            onClick={() => void clear()}
            disabled={busy || !configured}
          >
            Clear
          </button>
        </form>

        {error && <p className={styles.error}>{error}</p>}
        {notice && <p className={styles.notice}>{notice}</p>}
      </section>
    </main>
  );
}
