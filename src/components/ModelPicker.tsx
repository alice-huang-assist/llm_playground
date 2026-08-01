"use client";

import { useEffect, useState } from "react";

import type { Model, ProviderModels } from "@/lib/providers/types";

import styles from "./ModelPicker.module.css";

function modelKey(model: Model) {
  return `${model.providerId}:${model.id}`;
}

export default function ModelPicker() {
  const [providers, setProviders] = useState<ProviderModels[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState("");

  // Discovery runs on the server: the browser only ever talks to this app.
  useEffect(() => {
    let active = true;

    fetch("/api/models")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Model list request failed (${response.status})`);
        }
        return response.json() as Promise<{ providers: ProviderModels[] }>;
      })
      .then((payload) => {
        if (active) setProviders(payload.providers);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (loadError) {
    return <p className={styles.error}>Could not load models: {loadError}</p>;
  }

  if (!providers) {
    return <p className={styles.selection}>Loading models…</p>;
  }

  const models = providers.flatMap((provider) =>
    provider.reachable ? provider.models : [],
  );
  const unreachable = providers.filter((provider) => !provider.reachable);
  const selected = models.find((model) => modelKey(model) === selectedKey);

  return (
    <div className={styles.picker}>
      <label className={styles.label} htmlFor="model">
        Model
      </label>
      <select
        id="model"
        className={styles.select}
        value={selectedKey}
        onChange={(event) => setSelectedKey(event.target.value)}
        disabled={models.length === 0}
      >
        <option value="">
          {models.length === 0
            ? "No models available"
            : `Select a model (${models.length})`}
        </option>
        {models.map((model) => (
          <option key={modelKey(model)} value={modelKey(model)}>
            {model.id} — {model.providerName}
          </option>
        ))}
      </select>

      <p className={styles.selection}>
        {selected ? (
          <>
            Selected: <strong>{selected.id}</strong> ({selected.providerName})
          </>
        ) : (
          "No model selected"
        )}
      </p>

      {unreachable.length > 0 && (
        <ul className={styles.unreachable}>
          {unreachable.map((provider) => (
            <li key={provider.providerId}>
              {provider.providerName} is unreachable — its server does not
              appear to be running.
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
