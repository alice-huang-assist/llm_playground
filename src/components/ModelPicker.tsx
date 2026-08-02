"use client";

import { useEffect, useState } from "react";

import type { Model, ProviderModels } from "@/lib/providers/types";

function modelKey(model: Model) {
  return `${model.providerId}:${model.id}`;
}

export default function ModelPicker({
  reloadToken = 0,
  value,
  onChange,
  onLoad,
}: {
  /** Changing this re-runs discovery, so a fresh install shows up in place. */
  reloadToken?: number;
  /** `providerId:modelId` of the selection, when a parent owns it. */
  value?: string;
  /** Notified whenever the selection changes, so a parent can chat with it. */
  onChange?: (model: Model | null) => void;
  /** Reports each listing, so a parent can react to provider reachability. */
  onLoad?: (providers: ProviderModels[]) => void;
} = {}) {
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
        if (!active) return;
        setProviders(payload.providers);
        setLoadError(null);
        onLoad?.(payload.providers);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      active = false;
    };
  }, [reloadToken, onLoad]);

  if (loadError) {
    return (
      <p className="text-label text-danger">Could not load models: {loadError}</p>
    );
  }

  if (!providers) {
    return <p className="text-label text-ink-subtle">Loading models…</p>;
  }

  const models = providers.flatMap((provider) =>
    provider.reachable ? provider.models : [],
  );
  const unreachable = providers.filter((provider) => !provider.reachable);
  // A parent restoring a saved session owns the selection; otherwise it is ours.
  const currentKey = value ?? selectedKey;
  const selected = models.find((model) => modelKey(model) === currentKey);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <label className="sr-only" htmlFor="model">
        Model
      </label>
      <select
        id="model"
        className="min-w-0 max-w-full rounded-sm border border-border bg-surface px-2.5 py-1.5 font-mono text-label text-ink transition-colors hover:border-border-strong disabled:cursor-not-allowed disabled:text-ink-subtle"
        value={currentKey}
        onChange={(event) => {
          const key = event.target.value;
          setSelectedKey(key);
          onChange?.(models.find((model) => modelKey(model) === key) ?? null);
        }}
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

      {selected ? (
        <span className="text-meta text-ink-subtle">
          {selected.providerName}
        </span>
      ) : null}

      {unreachable.length > 0 && (
        <span className="text-meta text-ink-subtle">
          {unreachable.map((provider) => provider.providerName).join(", ")}{" "}
          unreachable
        </span>
      )}
    </div>
  );
}
