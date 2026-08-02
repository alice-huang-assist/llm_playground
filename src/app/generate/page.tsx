"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useShellSlots } from "@/components/AppShell";
import ImageLightbox from "@/components/ImageLightbox";
import {
  DEFAULT_DENOISING_STRENGTH,
  DEFAULT_IMAGE_COUNT,
  DEFAULT_IMAGE_PARAMS,
  MAX_IMAGE_COUNT,
  MAX_REFERENCE_BYTES,
  MIN_IMAGE_COUNT,
  clampCfgScale,
  clampDenoisingStrength,
  clampImageCount,
  clampImageSize,
  clampSeed,
  clampSteps,
  type ImageParamValues,
} from "@/lib/image-params";
import { groupGenerations } from "@/lib/generation-history";
import {
  COMFYUI_PROVIDER_ID,
  COMFYUI_PROVIDER_NAME,
  isZImageModel,
  Z_IMAGE_DEFAULT_CFG,
  Z_IMAGE_DEFAULT_SAMPLER,
  Z_IMAGE_DEFAULT_STEPS,
} from "@/lib/providers/comfyui-shared";
import {
  DEFAULT_FORGE_BASE_URL,
  FORGE_PROVIDER_ID,
  FORGE_PROVIDER_NAME,
} from "@/lib/providers/forge-shared";

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
  usedReference: boolean;
  denoisingStrength: number | null;
  batchId: string | null;
  createdAt: string;
}

const PROVIDERS = [
  { id: FORGE_PROVIDER_ID, name: FORGE_PROVIDER_NAME },
  { id: COMFYUI_PROVIDER_ID, name: COMFYUI_PROVIDER_NAME },
] as const;

type GenerateStreamEvent =
  | { type: "progress"; percent?: number; currentImage?: string }
  | { type: "done"; generations?: GenerationSummary[] }
  | { type: "error"; message?: string };

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
  const [baseUrl, setBaseUrl] = useState(DEFAULT_FORGE_BASE_URL);

  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [params, setParams] = useState<ImageParamValues>({
    ...DEFAULT_IMAGE_PARAMS,
  });
  const [seedInput, setSeedInput] = useState("");
  const [referenceDataUrl, setReferenceDataUrl] = useState<string | null>(null);
  const [denoisingStrength, setDenoisingStrength] = useState(
    DEFAULT_DENOISING_STRENGTH,
  );
  const [imageCount, setImageCount] = useState(DEFAULT_IMAGE_COUNT);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [previewIds, setPreviewIds] = useState<string[]>([]);
  const [history, setHistory] = useState<GenerationSummary[]>([]);
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(
    () => new Set(),
  );
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  function clearProgressUi() {
    setProgressPercent(null);
    setLivePreviewUrl(null);
  }

  /** User picked a model in the dropdown — apply Z-Image defaults when needed. */
  function onModelSelect(nextModelId: string) {
    setModelId(nextModelId);
    if (!isZImageModel(nextModelId)) return;
    setParams((current) => ({
      ...current,
      steps: Z_IMAGE_DEFAULT_STEPS,
      cfgScale: Z_IMAGE_DEFAULT_CFG,
    }));
    if (samplers.includes(Z_IMAGE_DEFAULT_SAMPLER)) {
      setSampler(Z_IMAGE_DEFAULT_SAMPLER);
    }
  }

  function showGenerations(items: GenerationSummary[]) {
    if (items.length === 0) return;
    setPreviewIds(items.map((item) => item.id));
    applyGeneration(items[0]!, items);
  }

  function applyGeneration(
    generation: GenerationSummary,
    batchItems?: GenerationSummary[],
  ) {
    setActiveId(generation.id);
    if (batchItems && batchItems.length > 0) {
      setPreviewIds(batchItems.map((item) => item.id));
    } else if (generation.batchId) {
      const siblings = history
        .filter((item) => item.batchId === generation.batchId)
        .slice()
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setPreviewIds(
        siblings.length > 0 ? siblings.map((item) => item.id) : [generation.id],
      );
    } else {
      setPreviewIds([generation.id]);
    }
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
    // Reference bytes are not re-hydrated from history (AC-6); restore strength flag only.
    setReferenceDataUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setDenoisingStrength(
      generation.denoisingStrength ?? DEFAULT_DENOISING_STRENGTH,
    );
    setError(null);
    setStatus(
      generation.usedReference
        ? "Restored params (re-attach a reference to run img2img again)."
        : null,
    );
  }

  const refreshHistory = useCallback(async () => {
    const response = await fetch("/api/images/generations");
    if (!response.ok) return [] as GenerationSummary[];
    const payload = (await response.json()) as {
      generations: GenerationSummary[];
    };
    setHistory(payload.generations);
    return payload.generations;
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
      fetch(
        `/api/images/samplers?providerId=${encodeURIComponent(providerId)}`,
      ),
    ]);

    const modelsPayload = (await modelsRes.json()) as {
      providers: ImageProviderPayload[];
    };
    const provider =
      modelsPayload.providers.find(
        (entry) => entry.providerId === providerId,
      ) ?? modelsPayload.providers[0];

    if (provider) {
      setReachable(provider.reachable);
      setReachError(
        provider.reachable ? null : (provider.error ?? "Unreachable"),
      );
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

  function clearReference() {
    setReferenceDataUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onReferenceFile(file: File | null) {
    if (!file) {
      clearReference();
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Reference must be an image file (PNG, JPEG, or WebP).");
      clearReference();
      return;
    }
    if (file.size > MAX_REFERENCE_BYTES) {
      setError(
        `Reference image must be at most ${MAX_REFERENCE_BYTES / (1024 * 1024)} MB.`,
      );
      clearReference();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setReferenceDataUrl(reader.result);
        setError(null);
      }
    };
    reader.onerror = () => {
      setError("Could not read the reference image.");
      clearReference();
    };
    reader.readAsDataURL(file);
  }

  async function generate() {
    if (busy || prompt.trim() === "" || modelId === "" || sampler === "")
      return;

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    setStatus("Generating…");
    clearProgressUi();

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
          count: imageCount,
          ...(referenceDataUrl
            ? {
                referenceImage: referenceDataUrl,
                denoisingStrength,
              }
            : {}),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(payload?.error ?? `Generate failed (${response.status}).`);
        setStatus(null);
        clearProgressUi();
        return;
      }

      if (!response.body) {
        setError("Generate failed (empty response).");
        setStatus(null);
        clearProgressUi();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished: GenerationSummary[] | null = null;

      const handle = (line: string) => {
        if (line.trim() === "") return;
        const event = JSON.parse(line) as GenerateStreamEvent;
        if (event.type === "progress") {
          if (
            typeof event.percent === "number" &&
            Number.isFinite(event.percent)
          ) {
            setProgressPercent(
              Math.max(0, Math.min(100, Math.round(event.percent))),
            );
          }
          if (
            typeof event.currentImage === "string" &&
            event.currentImage !== ""
          ) {
            setLivePreviewUrl(`data:image/png;base64,${event.currentImage}`);
          }
        } else if (event.type === "error") {
          setError(event.message ?? "Generate failed.");
          setStatus(null);
          clearProgressUi();
        } else if (
          event.type === "done" &&
          Array.isArray(event.generations) &&
          event.generations.length > 0
        ) {
          finished = event.generations;
          clearProgressUi();
          showGenerations(event.generations);
          setStatus("Done.");
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf("\n");
        while (newline !== -1) {
          handle(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
        }
      }
      handle(buffer);

      await refreshHistory();
      if (finished) {
        showGenerations(finished);
      }
    } catch (caught: unknown) {
      if (controller.signal.aborted) {
        setStatus(null);
        setError(null);
        clearProgressUi();
        const latest = await refreshHistory();
        const newest = latest[0];
        if (newest?.batchId) {
          const batch = latest
            .filter((item) => item.batchId === newest.batchId)
            .slice()
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          showGenerations(batch);
        } else if (newest) {
          showGenerations([newest]);
        }
        return;
      }
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus(null);
      clearProgressUi();
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  async function stop() {
    abortRef.current?.abort();
    setStatus("Cancelling…");
    clearProgressUi();
  }

  async function remove(id: string) {
    await fetch(`/api/images/generations/${id}`, { method: "DELETE" });
    setPreviewIds((current) => current.filter((entry) => entry !== id));
    if (activeId === id) {
      setActiveId(null);
    }
    await refreshHistory();
  }

  async function removeBatch(batchId: string) {
    await fetch(
      `/api/images/generations/batch/${encodeURIComponent(batchId)}`,
      {
        method: "DELETE",
      },
    );
    setExpandedBatches((current) => {
      const next = new Set(current);
      next.delete(batchId);
      return next;
    });
    const removed = history.filter((item) => item.batchId === batchId);
    const removedIds = new Set(removed.map((item) => item.id));
    setPreviewIds((current) => current.filter((id) => !removedIds.has(id)));
    if (activeId && removedIds.has(activeId)) {
      setActiveId(null);
    }
    await refreshHistory();
  }

  function toggleBatch(batchId: string) {
    setExpandedBatches((current) => {
      const next = new Set(current);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  }

  function download(id: string) {
    const anchor = document.createElement("a");
    anchor.href = `/api/images/generations/${id}/file`;
    anchor.download = `${id}.png`;
    anchor.click();
  }

  const historyGroups = groupGenerations(history);
  const gridIds =
    !busy && !livePreviewUrl && previewIds.length > 1 ? previewIds : null;
  const lightboxIds =
    previewIds.length > 0 ? previewIds : activeId ? [activeId] : [];
  const lightboxImages = lightboxIds.map((id) => ({
    id,
    src: `/api/images/generations/${id}/file`,
    alt: prompt || "Generated image",
  }));

  function openLightbox(id: string) {
    const index = lightboxIds.indexOf(id);
    setLightboxIndex(index >= 0 ? index : 0);
  }

  const { inspectorEl } = useShellSlots();
  const [dragging, setDragging] = useState(false);

  const canGenerate =
    !busy &&
    reachable &&
    prompt.trim() !== "" &&
    modelId !== "" &&
    sampler !== "";

  const selectClass =
    "min-w-0 max-w-56 truncate rounded-sm border border-border bg-surface px-2.5 py-1.5 font-mono text-label text-ink transition-colors hover:border-border-strong disabled:cursor-not-allowed disabled:text-ink-subtle";
  const numberClass =
    "w-full rounded-sm border border-border bg-canvas px-2.5 py-1.5 font-mono text-label text-ink transition-colors placeholder:text-ink-subtle focus:border-accent disabled:cursor-not-allowed disabled:text-ink-subtle";
  const secondaryClass =
    "rounded-sm border border-border px-3 py-1.5 text-label text-ink-muted transition-colors hover:border-border-strong hover:text-ink disabled:cursor-not-allowed disabled:text-ink-subtle";
  const groupClass = "flex flex-col gap-3";
  const groupHeadingClass = "font-display text-h2 text-ink";
  const fieldLabelClass = "text-label text-ink-muted";

  const inspector = (
    <div className="flex flex-col gap-6 px-5 py-6">
      <section className={groupClass}>
        <h2 className={groupHeadingClass}>Composition</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>Width</span>
            <input
              className={numberClass}
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
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>Height</span>
            <input
              className={numberClass}
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
        </div>
      </section>

      <section className={`${groupClass} border-t border-border pt-5`}>
        <h2 className={groupHeadingClass}>Sampling</h2>
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>Sampler</span>
          <select
            className={selectClass}
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
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>Steps</span>
            <input
              className={numberClass}
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
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>CFG scale</span>
            <input
              className={numberClass}
              type="number"
              min={1}
              max={30}
              step={0.5}
              value={params.cfgScale}
              disabled={busy}
              onChange={(event) =>
                setParams((current) => ({
                  ...current,
                  cfgScale: clampCfgScale(event.target.value, current.cfgScale),
                }))
              }
            />
          </label>
        </div>
      </section>

      <section className={`${groupClass} border-t border-border pt-5`}>
        <h2 className={groupHeadingClass}>Output</h2>
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>Images (1–8)</span>
          <input
            className={numberClass}
            type="number"
            min={MIN_IMAGE_COUNT}
            max={MAX_IMAGE_COUNT}
            value={imageCount}
            disabled={busy}
            onChange={(event) =>
              setImageCount(clampImageCount(event.target.value, imageCount))
            }
          />
        </label>
      </section>

      {/* Collapsed by default, never hidden: seed and denoising are the two
          controls a first run rarely touches (ALI-24 AC-2, NG-5). */}
      <details className="group border-t border-border pt-5">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-label text-ink-muted transition-colors hover:text-ink">
          <span
            aria-hidden="true"
            className="text-ink-subtle transition-transform group-open:rotate-90"
          >
            ›
          </span>
          Advanced
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>Seed (empty = random)</span>
            <input
              className={numberClass}
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
          {referenceDataUrl && (
            <label className="flex flex-col gap-1.5">
              <span className={fieldLabelClass}>Denoising strength</span>
              <input
                className={numberClass}
                type="number"
                min={0.01}
                max={1}
                step={0.01}
                value={denoisingStrength}
                disabled={busy}
                onChange={(event) =>
                  setDenoisingStrength(
                    clampDenoisingStrength(event.target.value),
                  )
                }
              />
            </label>
          )}
        </div>
      </details>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border bg-surface px-6 py-3">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3">
          <label className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-meta text-ink-subtle">Provider</span>
            <select
              className={selectClass}
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

          <label className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-meta text-ink-subtle">Model</span>
            <select
              className={selectClass}
              value={modelId}
              onChange={(event) => onModelSelect(event.target.value)}
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

          <button
            type="button"
            className={`${secondaryClass} ml-auto`}
            disabled={busy}
            onClick={() => void loadProvider()}
          >
            Refresh models
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={styles.main}>
          {!reachable && (
            <p
              className="rounded-md border border-danger bg-surface px-4 py-3 text-label text-danger"
              role="status"
            >
              {providerId === COMFYUI_PROVIDER_ID ? "ComfyUI" : "Forge"} isn’t
              reachable at{" "}
              <a
                href={baseUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                <code className="font-mono">{baseUrl}</code>
              </a>
              {reachError ? ` (${reachError})` : ""}. Check{" "}
              <Link href="/settings" className="underline underline-offset-2">
                Settings
              </Link>{" "}
              and see the{" "}
              <Link
                href="/docs/images"
                className="underline underline-offset-2"
              >
                setup docs
              </Link>
              .
            </p>
          )}

          {/* The prompt block spans the full canvas so it stays dominant over
              the inspector; results and history keep their existing grid
              below, untouched until ALI-25 moves history into the rail. */}
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-label text-ink-muted">Prompt</span>
              <textarea
                className="field-sizing-content min-h-24 w-full resize-y rounded-md border border-border bg-surface px-4 py-3 text-body text-ink transition-colors placeholder:text-ink-subtle focus:border-accent disabled:cursor-not-allowed disabled:text-ink-subtle"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={4}
                placeholder="Describe the image you want"
                disabled={busy}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-label text-ink-muted">Negative prompt</span>
              <textarea
                className="field-sizing-content min-h-14 w-full resize-y rounded-md border border-border bg-surface px-4 py-2.5 text-body text-ink transition-colors placeholder:text-ink-subtle focus:border-accent disabled:cursor-not-allowed disabled:text-ink-subtle"
                value={negativePrompt}
                onChange={(event) => setNegativePrompt(event.target.value)}
                rows={2}
                placeholder="What to avoid"
                disabled={busy}
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-label text-ink-muted">
                Reference image{" "}
                <span className="text-ink-subtle">
                  (optional — enables img2img)
                </span>
              </span>

              {referenceDataUrl ? (
                <div className="flex items-center gap-3 rounded-md border border-border bg-surface p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="size-16 shrink-0 rounded-sm object-cover"
                    src={referenceDataUrl}
                    alt="Reference preview"
                  />
                  <button
                    type="button"
                    className={secondaryClass}
                    disabled={busy}
                    onClick={clearReference}
                  >
                    Clear reference
                  </button>
                </div>
              ) : (
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (!busy) setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    if (!busy) {
                      onReferenceFile(event.dataTransfer.files?.[0] ?? null);
                    }
                  }}
                  className={`rounded-md border border-dashed px-4 py-6 text-center transition-colors ${
                    dragging
                      ? "border-accent bg-accent-subtle"
                      : "border-border bg-surface"
                  }`}
                >
                  <button
                    type="button"
                    className="text-label text-accent-text underline underline-offset-2 disabled:cursor-not-allowed disabled:text-ink-subtle disabled:no-underline"
                    disabled={busy}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose an image
                  </button>
                  <span className="text-label text-ink-subtle">
                    {" "}
                    or drop one here
                  </span>
                  <p className="mt-1 text-meta text-ink-subtle">
                    PNG, JPEG, or WebP
                  </p>
                  <input
                    ref={fileInputRef}
                    className="sr-only"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy}
                    onChange={(event) =>
                      onReferenceFile(event.target.files?.[0] ?? null)
                    }
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="w-full rounded-md bg-accent px-4 py-2.5 text-label text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-border disabled:text-ink-subtle"
                disabled={!canGenerate}
                onClick={() => void generate()}
              >
                Generate
              </button>
              <button
                type="button"
                className={secondaryClass}
                disabled={!busy}
                onClick={stop}
              >
                Stop
              </button>
            </div>

            {status && (
              <p className="text-label text-ink-muted" role="status">
                {status}
              </p>
            )}
            {error && (
              <p className="text-label text-danger" role="status">
                {error}
              </p>
            )}
          </div>

          <div className={styles.layout}>
            <div className={styles.column}>
              <div className={styles.preview}>
                {livePreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className={styles.image}
                    src={livePreviewUrl}
                    alt={prompt || "Generating preview"}
                  />
                ) : gridIds ? (
                  <div className={styles.previewGrid}>
                    {gridIds.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={
                          id === activeId
                            ? styles.previewGridItemActive
                            : styles.previewGridItem
                        }
                        onClick={() => {
                          const item = history.find((entry) => entry.id === id);
                          if (item) applyGeneration(item);
                          else setActiveId(id);
                          openLightbox(id);
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          className={styles.previewGridImage}
                          src={`/api/images/generations/${id}/file`}
                          alt=""
                        />
                      </button>
                    ))}
                  </div>
                ) : activeId ? (
                  <button
                    type="button"
                    className={styles.imageButton}
                    onClick={() => openLightbox(activeId)}
                    aria-label="Open full view"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className={styles.image}
                      src={`/api/images/generations/${activeId}/file`}
                      alt={prompt || "Generated image"}
                    />
                  </button>
                ) : (
                  <p className={styles.placeholder}>
                    Generated images appear here.
                  </p>
                )}
                {busy && (
                  <div className={styles.previewProgress} aria-live="polite">
                    <span className={styles.previewProgressLabel}>
                      {typeof progressPercent === "number"
                        ? `${progressPercent}%`
                        : "Generating…"}
                    </span>
                    <progress
                      className={styles.previewProgressBar}
                      max={100}
                      value={
                        typeof progressPercent === "number"
                          ? progressPercent
                          : undefined
                      }
                    />
                  </div>
                )}
              </div>
            </div>

            <aside className={styles.rail}>
              <h2 className={styles.railTitle}>History</h2>
              {history.length === 0 ? (
                <p className={styles.placeholder}>No generations yet.</p>
              ) : (
                <ul className={styles.history}>
                  {historyGroups.map((group) =>
                    group.kind === "single" ? (
                      <li key={group.item.id}>
                        <button
                          type="button"
                          className={
                            group.item.id === activeId
                              ? styles.historyItemActive
                              : styles.historyItem
                          }
                          onClick={() => applyGeneration(group.item)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            className={styles.thumb}
                            src={`/api/images/generations/${group.item.id}/file`}
                            alt=""
                          />
                          <span className={styles.historyText}>
                            {group.item.usedReference ? "img2img · " : ""}
                            {snippet(group.item.prompt)}
                          </span>
                        </button>
                        <div className={styles.historyActions}>
                          <button
                            type="button"
                            className={styles.smallButton}
                            onClick={() => download(group.item.id)}
                          >
                            Download
                          </button>
                          <button
                            type="button"
                            className={styles.danger}
                            onClick={() => void remove(group.item.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ) : (
                      <li key={group.batchId} className={styles.batchBlock}>
                        <button
                          type="button"
                          className={
                            group.items.some((item) => item.id === activeId)
                              ? styles.historyItemActive
                              : styles.historyItem
                          }
                          onClick={() => {
                            toggleBatch(group.batchId);
                            applyGeneration(group.items[0]!, group.items);
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            className={styles.thumb}
                            src={`/api/images/generations/${group.items[0]!.id}/file`}
                            alt=""
                          />
                          <span className={styles.historyText}>
                            {group.items[0]!.usedReference ? "img2img · " : ""}
                            {snippet(group.items[0]!.prompt)}
                            <span className={styles.batchCount}>
                              {" "}
                              · {group.items.length} images
                            </span>
                          </span>
                        </button>
                        <div className={styles.historyActions}>
                          <button
                            type="button"
                            className={styles.smallButton}
                            onClick={() => toggleBatch(group.batchId)}
                          >
                            {expandedBatches.has(group.batchId)
                              ? "Collapse"
                              : "Expand"}
                          </button>
                          <button
                            type="button"
                            className={styles.danger}
                            onClick={() => void removeBatch(group.batchId)}
                          >
                            Delete all
                          </button>
                        </div>
                        {expandedBatches.has(group.batchId) && (
                          <ul className={styles.batchChildren}>
                            {group.items.map((item) => (
                              <li key={item.id}>
                                <button
                                  type="button"
                                  className={
                                    item.id === activeId
                                      ? styles.historyItemActive
                                      : styles.historyItem
                                  }
                                  onClick={() =>
                                    applyGeneration(item, group.items)
                                  }
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    className={styles.thumb}
                                    src={`/api/images/generations/${item.id}/file`}
                                    alt=""
                                  />
                                  <span className={styles.historyText}>
                                    seed{" "}
                                    {item.seed === null
                                      ? "—"
                                      : String(item.seed)}
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
                      </li>
                    ),
                  )}
                </ul>
              )}
            </aside>
          </div>

          {lightboxIndex !== null && lightboxImages.length > 0 && (
            <ImageLightbox
              images={lightboxImages}
              index={lightboxIndex}
              onClose={() => setLightboxIndex(null)}
              onIndexChange={(nextIndex) => {
                setLightboxIndex(nextIndex);
                const nextId = lightboxIds[nextIndex];
                if (nextId) {
                  const item = history.find((entry) => entry.id === nextId);
                  if (item) applyGeneration(item);
                  else setActiveId(nextId);
                }
              }}
            />
          )}
        </div>
      </div>

      {inspectorEl && createPortal(inspector, inspectorEl)}
    </div>
  );
}
