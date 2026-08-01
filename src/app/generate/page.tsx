"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  DEFAULT_IMAGE_PARAMS,
  clampCfgScale,
  clampImageSize,
  clampSeed,
  clampSteps,
  type ImageParamValues,
} from "@/lib/image-params";
import {
  FORGE_PROVIDER_ID,
  FORGE_PROVIDER_NAME,
} from "@/lib/providers/forge";

import styles from "./page.module.css";

interface ImageModel {
  id: string;
  title: string;
}

interface ImageProviderPayload {
  providerId: string;
  providerName: string;
  reachable: boolean;
  baseUrl: string;
  error?: string;
  models: ImageModel[];
}

interface GenerationSummary {
  id: string;
  providerId: string;
  modelId: string;
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  seed: number | null;
  cfgScale: number;
  sampler: string;
  createdAt: string;
}

const PROVIDERS = [
  { id: FORGE_PROVIDER_ID, name: FORGE_PROVIDER_NAME },
] as const;

function snippet(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (cleaned === "") return "(empty prompt)";
  return cleaned.length > 64 ? `${cleaned.slice(0, 63).trimEnd()}…` : cleaned;
}

export default function GeneratePage() {
  const [providerId, setProviderId] = useState<string>(FORGE_PROVIDER_ID);
  const [models, setModels] = useState<ImageModel[]>([]);
  const [samplers, setSamplers] = useState<string[]>([]);
  const [modelId, setModelId] = useState("");
  const [sampler, setSampler] = useState("");
  const [reachable, setReachable] = useState(true);
  const [reachError, setReachError] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:7860");

  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [params, setParams] = useState<ImageParamValues>({
    ...DEFAULT_IMAGE_PARAMS,
  });
  const [seedInput, setSeedInput] = useState("");

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [history, setHistory] = useState<GenerationSummary[]>([]);

  const abortRef = useRef<AbortController | null>(null);

  const refreshHistory = useCallback(async () => {
    const response = await fetch("/api/images/generations");
    if (!response.ok) return;
    const payload = (await response.json()) as {
      generations: GenerationSummary[];
    };
    setHistory(payload.generations);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setError(null);
      const [modelsRes, samplersRes] = await Promise.all([
        fetch("/api/images/models"),
        fetch(
          `/api/images/samplers?providerId=${encodeURIComponent(providerId)}`,
        ),
      ]);
      if (cancelled) return;

      const modelsPayload = (await modelsRes.json()) as {
        providers: ImageProviderPayload[];
      };
      const provider =
        modelsPayload.providers.find(
          (entry) => entry.providerId === providerId,
        ) ?? modelsPayload.providers[0];

      if (cancelled) return;

      if (provider) {
        setReachable(provider.reachable);
        setReachError(
          provider.reachable ? null : (provider.error ?? "Unreachable"),
        );
        setBaseUrl(provider.baseUrl);
        setModels(provider.models);
        setModelId((current) => {
          if (
            current &&
            provider.models.some((model) => model.id === current)
          ) {
            return current;
          }
          return provider.models[0]?.id ?? "";
        });
      } else {
        setReachable(false);
        setReachError("No image providers available.");
        setModels([]);
        setModelId("");
      }

      const samplersPayload = (await samplersRes.json()) as {
        reachable: boolean;
        samplers: string[];
        error?: string;
      };
      if (cancelled) return;

      setSamplers(samplersPayload.samplers);
      setSampler((current) => {
        if (current && samplersPayload.samplers.includes(current)) {
          return current;
        }
        return samplersPayload.samplers[0] ?? "";
      });
      if (!samplersPayload.reachable && provider?.reachable) {
        setReachable(false);
        setReachError(samplersPayload.error ?? "Could not load samplers.");
      }

      const historyRes = await fetch("/api/images/generations");
      if (!historyRes.ok || cancelled) return;
      const historyPayload = (await historyRes.json()) as {
        generations: GenerationSummary[];
      };
      if (!cancelled) setHistory(historyPayload.generations);
    })();

    return () => {
      cancelled = true;
    };
  }, [providerId]);

  const loadProvider = useCallback(async () => {
    setError(null);
    const [modelsRes, samplersRes] = await Promise.all([
      fetch("/api/images/models"),
      fetch(`/api/images/samplers?providerId=${encodeURIComponent(providerId)}`),
    ]);

    const modelsPayload = (await modelsRes.json()) as {
      providers: ImageProviderPayload[];
    };
    const provider =
      modelsPayload.providers.find((entry) => entry.providerId === providerId) ??
      modelsPayload.providers[0];

    if (provider) {
      setReachable(provider.reachable);
      setReachError(provider.reachable ? null : (provider.error ?? "Unreachable"));
      setBaseUrl(provider.baseUrl);
      setModels(provider.models);
      setModelId((current) => {
        if (current && provider.models.some((model) => model.id === current)) {
          return current;
        }
        return provider.models[0]?.id ?? "";
      });
    } else {
      setReachable(false);
      setReachError("No image providers available.");
      setModels([]);
      setModelId("");
    }

    const samplersPayload = (await samplersRes.json()) as {
      reachable: boolean;
      samplers: string[];
      error?: string;
    };
    setSamplers(samplersPayload.samplers);
    setSampler((current) => {
      if (current && samplersPayload.samplers.includes(current)) return current;
      return samplersPayload.samplers[0] ?? "";
    });
    if (!samplersPayload.reachable && provider?.reachable) {
      setReachable(false);
      setReachError(samplersPayload.error ?? "Could not load samplers.");
    }
  }, [providerId]);

  function applyGeneration(generation: GenerationSummary) {
    setActiveId(generation.id);
    setProviderId(generation.providerId);
    setModelId(generation.modelId);
    setPrompt(generation.prompt);
    setNegativePrompt(generation.negativePrompt);
    setParams({
      width: generation.width,
      height: generation.height,
      steps: generation.steps,
      cfgScale: generation.cfgScale,
      seed: generation.seed,
    });
    setSeedInput(generation.seed === null ? "" : String(generation.seed));
    setSampler(generation.sampler);
    setError(null);
    setStatus(null);
  }

  async function generate() {
    if (busy || prompt.trim() === "" || modelId === "" || sampler === "") return;

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    setStatus("Generating…");

    try {
      const response = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          providerId,
          model: modelId,
          prompt,
          negativePrompt,
          width: params.width,
          height: params.height,
          steps: params.steps,
          cfgScale: params.cfgScale,
          seed: seedInput.trim() === "" ? null : Number(seedInput),
          sampler,
        }),
      });

      const payload = (await response.json()) as {
        generation?: GenerationSummary;
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? `Generate failed (${response.status}).`);
        setStatus(null);
        return;
      }

      if (payload.generation) {
        applyGeneration(payload.generation);
        await refreshHistory();
        setStatus("Done.");
      }
    } catch (caught: unknown) {
      if (controller.signal.aborted) {
        setStatus(null);
        setError(null);
        return;
      }
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus(null);
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
    setStatus("Cancelling…");
  }

  async function remove(id: string) {
    await fetch(`/api/images/generations/${id}`, { method: "DELETE" });
    if (activeId === id) setActiveId(null);
    await refreshHistory();
  }

  function download(id: string) {
    const anchor = document.createElement("a");
    anchor.href = `/api/images/generations/${id}/file`;
    anchor.download = `${id}.png`;
    anchor.click();
  }

  const canGenerate =
    !busy &&
    reachable &&
    prompt.trim() !== "" &&
    modelId !== "" &&
    sampler !== "";

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.title}>Images</h1>
        <nav className={styles.nav}>
          <Link className={styles.navLink} href="/">
            Chat
          </Link>
          <Link className={styles.navLink} href="/settings">
            Settings
          </Link>
        </nav>
      </div>
      <p className={styles.subtitle}>
        Text-to-image playground for a local Forge / A1111-compatible server.
      </p>

      <div className={styles.layout}>
        <div className={styles.column}>
          {!reachable && (
            <p className={styles.banner} role="status">
              Forge isn’t reachable at <code>{baseUrl}</code>
              {reachError ? ` (${reachError})` : ""}. Check{" "}
              <Link href="/settings">Settings</Link> and see the{" "}
              <Link href="/docs/images">setup docs</Link> for Forge and usage.
            </p>
          )}

          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.label}>Provider</span>
              <select
                className={styles.select}
                value={providerId}
                onChange={(event) => setProviderId(event.target.value)}
                disabled={busy}
              >
                {PROVIDERS.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Model</span>
              <select
                className={styles.select}
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
                disabled={busy || models.length === 0}
              >
                {models.length === 0 ? (
                  <option value="">No models</option>
                ) : (
                  models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.title}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>Prompt</span>
            <textarea
              className={styles.textarea}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              disabled={busy}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Negative prompt</span>
            <textarea
              className={styles.textarea}
              value={negativePrompt}
              onChange={(event) => setNegativePrompt(event.target.value)}
              rows={2}
              disabled={busy}
            />
          </label>

          <div className={styles.grid}>
            <label className={styles.field}>
              <span className={styles.label}>Width</span>
              <input
                className={styles.input}
                type="number"
                min={256}
                max={2048}
                step={64}
                value={params.width}
                disabled={busy}
                onChange={(event) =>
                  setParams((current) => ({
                    ...current,
                    width: clampImageSize(event.target.value, current.width),
                  }))
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Height</span>
              <input
                className={styles.input}
                type="number"
                min={256}
                max={2048}
                step={64}
                value={params.height}
                disabled={busy}
                onChange={(event) =>
                  setParams((current) => ({
                    ...current,
                    height: clampImageSize(event.target.value, current.height),
                  }))
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Steps</span>
              <input
                className={styles.input}
                type="number"
                min={1}
                max={150}
                value={params.steps}
                disabled={busy}
                onChange={(event) =>
                  setParams((current) => ({
                    ...current,
                    steps: clampSteps(event.target.value, current.steps),
                  }))
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>CFG scale</span>
              <input
                className={styles.input}
                type="number"
                min={1}
                max={30}
                step={0.5}
                value={params.cfgScale}
                disabled={busy}
                onChange={(event) =>
                  setParams((current) => ({
                    ...current,
                    cfgScale: clampCfgScale(
                      event.target.value,
                      current.cfgScale,
                    ),
                  }))
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Seed (empty = random)</span>
              <input
                className={styles.input}
                type="number"
                value={seedInput}
                disabled={busy}
                placeholder="random"
                onChange={(event) => {
                  setSeedInput(event.target.value);
                  setParams((current) => ({
                    ...current,
                    seed: clampSeed(event.target.value),
                  }));
                }}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Sampler</span>
              <select
                className={styles.select}
                value={sampler}
                onChange={(event) => setSampler(event.target.value)}
                disabled={busy || samplers.length === 0}
              >
                {samplers.length === 0 ? (
                  <option value="">No samplers</option>
                ) : (
                  samplers.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.button}
              disabled={!canGenerate}
              onClick={() => void generate()}
            >
              Generate
            </button>
            <button
              type="button"
              className={styles.button}
              disabled={!busy}
              onClick={stop}
            >
              Stop
            </button>
            <button
              type="button"
              className={styles.button}
              disabled={busy}
              onClick={() => void loadProvider()}
            >
              Refresh models
            </button>
          </div>

          {status && <p className={styles.status}>{status}</p>}
          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.preview}>
            {activeId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={styles.image}
                src={`/api/images/generations/${activeId}/file`}
                alt={prompt || "Generated image"}
              />
            ) : (
              <p className={styles.placeholder}>
                Generated images appear here.
              </p>
            )}
          </div>
        </div>

        <aside className={styles.rail}>
          <h2 className={styles.railTitle}>History</h2>
          {history.length === 0 ? (
            <p className={styles.placeholder}>No generations yet.</p>
          ) : (
            <ul className={styles.history}>
              {history.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={
                      item.id === activeId
                        ? styles.historyItemActive
                        : styles.historyItem
                    }
                    onClick={() => applyGeneration(item)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className={styles.thumb}
                      src={`/api/images/generations/${item.id}/file`}
                      alt=""
                    />
                    <span className={styles.historyText}>
                      {snippet(item.prompt)}
                    </span>
                  </button>
                  <div className={styles.historyActions}>
                    <button
                      type="button"
                      className={styles.smallButton}
                      onClick={() => download(item.id)}
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      className={styles.danger}
                      onClick={() => void remove(item.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </main>
  );
}
