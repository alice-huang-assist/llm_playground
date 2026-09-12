import Link from "next/link";
import type { ReactNode } from "react";

import { DEFAULT_COMFYUI_BASE_URL } from "@/lib/providers/comfyui-shared";
import { DEFAULT_FORGE_BASE_URL } from "@/lib/providers/forge-shared";

/** Inline command, path, or identifier — tinted so it reads as machine text. */
function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-sm bg-surface-sunken px-1.5 py-0.5 font-mono text-[0.9em] text-ink">
      {children}
    </code>
  );
}

const LINK_CLASS =
  "text-accent-text underline underline-offset-2 transition-opacity hover:opacity-80";

/** Leaves the app, so it is marked visually and for assistive tech. */
function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={LINK_CLASS}>
      {children}
      <span aria-hidden="true"> ↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function Callout({
  tone,
  children,
}: {
  tone: "note" | "warning";
  children: ReactNode;
}) {
  const toneClass =
    tone === "warning"
      ? "border-danger/40 bg-danger/8"
      : "border-border bg-surface-sunken";
  return (
    <div className={`rounded-md border px-4 py-3 ${toneClass}`}>
      <p className="text-meta tracking-wide text-ink-subtle uppercase">
        {tone === "warning" ? "Warning" : "Note"}
      </p>
      <div className="mt-1 text-body text-ink">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-h2 text-ink">{title}</h2>
      {children}
    </section>
  );
}

const LIST_CLASS =
  "flex list-outside flex-col gap-3 pl-5 text-body leading-relaxed text-ink marker:text-ink-subtle";

export default function ImagesDocsPage() {
  return (
    // Measure capped near 68 characters so prose stays readable in a wide
    // canvas. Expressed in rem rather than `ch`: the `ch` unit is the width of
    // "0", which in IBM Plex Sans is wider than the average glyph — `68ch`
    // measured out past a comfortable character count per line.
    <div className="mx-auto flex w-full max-w-[34rem] flex-col gap-10 px-6 py-10">
      <h1 className="font-display text-h1 text-ink">Images playground</h1>
      <Section title="Setup (bundled — Apple Silicon)">
        <Callout tone="note">
          This path installs Forge and ComfyUI under <Code>vendors/</Code> on{" "}
          <strong>macOS arm64</strong> only (e.g. M4). It does not cover
          Windows, NVIDIA Linux, or Docker.
        </Callout>

        <ol className={`${LIST_CLASS} list-decimal`}>
          <li>
            From the repo root: <Code>npm run install:backends</Code> — clones{" "}
            <ExternalLink href="https://github.com/lllyasviel/stable-diffusion-webui-forge">
              Forge
            </ExternalLink>{" "}
            and{" "}
            <ExternalLink href="https://github.com/comfyanonymous/ComfyUI">
              ComfyUI
            </ExternalLink>
            , creates Python venvs, and shares checkpoints at{" "}
            <Code>vendors/models/checkpoints/</Code>.
          </li>
          <li>
            Drop at least one open-weight checkpoint (<Code>.safetensors</Code>)
            into that shared folder. Nothing is downloaded automatically.
          </li>
          <li>
            Start everything with <Code>npm run dev:all</Code> (or{" "}
            <Code>npm run backends:start</Code> then <Code>npm run dev</Code>).
            Defaults: Forge{" "}
            <ExternalLink href={DEFAULT_FORGE_BASE_URL}>
              <Code>{DEFAULT_FORGE_BASE_URL}</Code>
            </ExternalLink>
            , ComfyUI{" "}
            <ExternalLink href={DEFAULT_COMFYUI_BASE_URL}>
              <Code>{DEFAULT_COMFYUI_BASE_URL}</Code>
            </ExternalLink>
            .
          </li>
          <li>
            In{" "}
            <Link href="/settings" className={LINK_CLASS}>
              Settings
            </Link>
            , change base URLs only if you override ports.
          </li>
        </ol>
      </Section>

      <Section title="Setup (manual / external)">
        <ol className={`${LIST_CLASS} list-decimal`}>
          <li>
            Install and run Forge (API on{" "}
            <ExternalLink href={DEFAULT_FORGE_BASE_URL}>
              <Code>{DEFAULT_FORGE_BASE_URL}</Code>
            </ExternalLink>
            ) and/or ComfyUI (
            <ExternalLink href={DEFAULT_COMFYUI_BASE_URL}>
              <Code>{DEFAULT_COMFYUI_BASE_URL}</Code>
            </ExternalLink>
            ) yourself.
          </li>
          <li>Put checkpoints in each server’s models folder.</li>
          <li>
            Point{" "}
            <Link href="/settings" className={LINK_CLASS}>
              Settings
            </Link>{" "}
            at those URLs.
          </li>
        </ol>
      </Section>

      <Section title="How to use">
        <ol className={`${LIST_CLASS} list-decimal`}>
          <li>
            From chat, click <strong>Images</strong> (or open{" "}
            <Link href="/generate" className={LINK_CLASS}>
              /generate
            </Link>
            ).
          </li>
          <li>
            Choose provider <strong>Forge</strong> or <strong>ComfyUI</strong>{" "}
            and a model. ComfyUI uses fixed workflows shipped with the app (no
            node editor): checkpoints via <Code>CheckpointLoaderSimple</Code>,
            plus dedicated graphs for split UNETs under{" "}
            <Code>models/diffusion_models/</Code> —{" "}
            <strong>Z-Image-Turbo</strong> (needs{" "}
            <Code>text_encoders/qwen_3_4b.safetensors</Code> and{" "}
            <Code>vae/ae.safetensors</Code>), <strong>Flux / Fluxed Up</strong>{" "}
            (needs <Code>clip_l.safetensors</Code>,{" "}
            <Code>t5xxl_fp16.safetensors</Code>, and <Code>ae.safetensors</Code>;
            no CLIP/VAE baked into the UNET), and <strong>Wan2.2 T2V</strong>{" "}
            (high-noise + low-noise split UNETs from{" "}
            <ExternalLink href="https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged">
              Comfy-Org/Wan_2.2_ComfyUI_Repackaged
            </ExternalLink>
            ; prefer fp16 UNETs plus <Code>umt5_xxl_fp16.safetensors</Code> and{" "}
            <Code>wan_2.1_vae.safetensors</Code>; <Code>fp8_scaled</Code> also
            runs via CPU dequant. Outputs MP4, not PNG).
          </li>
          <li>
            Enter a prompt (optional negative prompt). Adjust width, height,
            steps, CFG, sampler, and seed. Empty seed means random. Selecting
            Z-Image applies steps 8 / CFG 1 / <Code>res_multistep</Code>; Flux /
            Fluxed Up applies steps 28 / guidance 3.5 / <Code>dpmpp_2m</Code>{" "}
            (CFG → FluxGuidance); Wan T2V applies 640×640 / steps 20 / CFG 3.5 /{" "}
            <Code>euler</Code>. Comfy scheduler is <Code>normal</Code> for
            checkpoints, <Code>simple</Code> for Z-Image and Wan, and{" "}
            <Code>beta</Code> for Flux.
          </li>
          <li>
            Optional: attach a <strong>reference image</strong> to run img2img.
            A denoising strength control appears; Clear reference returns to
            text-to-image. History remembers that a reference was used but does
            not re-attach the file — upload again to iterate.
          </li>
          <li>
            Click <strong>Generate</strong>. Use <strong>Stop</strong> to
            cancel; cancelled runs are not saved to history.
          </li>
          <li>
            Successful images appear in the preview and the History rail (shared
            across providers). Click a history item to restore prompt and
            parameters. Use Download or Delete on each entry.
          </li>
          <li>
            If the selected backend is down, the page still loads with an empty
            model list and a message pointing here and to Settings — chat is
            unaffected.
          </li>
        </ol>
      </Section>

      <Section title="Troubleshooting">
        <ul className={`${LIST_CLASS} list-disc`}>
          <li>
            <strong>Empty model list / backend unreachable</strong> — run{" "}
            <Code>npm run backends:start</Code>; check{" "}
            <Code>vendors/logs/forge.log</Code> and <Code>comfyui.log</Code>.
            First Forge boot can take several minutes.
          </li>
          <li>
            <strong>Still no models</strong> — add a <Code>.safetensors</Code>{" "}
            under <Code>vendors/models/checkpoints/</Code>, then restart
            backends.
          </li>
          <li>
            <strong>install:backends refuses</strong> — Apple Silicon only. Use
            the manual setup above on other platforms.
          </li>
          <li>
            <strong>
              ComfyUI <Code>Undefined type Float8_e4m3fn</Code>
            </strong>{" "}
            — restart ComfyUI after <Code>install:backends</Code> so the{" "}
            <Code>mps_fp8_compat</Code> node is linked. Then <Code>fp8_scaled</Code>{" "}
            UNETs dequantize on CPU. Prefer the matching fp16 file when RAM
            allows.
          </li>
        </ul>

        <Callout tone="warning">
          <strong>OOM on M4</strong> — running both backends with large
          checkpoints can exhaust unified memory. Use{" "}
          <Code>npm run backends:stop</Code> (or kill one PID under{" "}
          <Code>vendors/run/</Code>) and run a single provider.
        </Callout>
      </Section>
    </div>
  );
}
