import Link from "next/link";

import ThemeToggle from "@/components/ThemeToggle";
import { DEFAULT_COMFYUI_BASE_URL } from "@/lib/providers/comfyui-shared";
import { DEFAULT_FORGE_BASE_URL } from "@/lib/providers/forge-shared";

import styles from "./page.module.css";

export default function ImagesDocsPage() {
  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.title}>Images playground</h1>
        <nav className={styles.nav}>
          <Link className={styles.link} href="/generate">
            Open Images
          </Link>
          <Link className={styles.link} href="/settings">
            Settings
          </Link>
          <a
            className={styles.link}
            href={DEFAULT_FORGE_BASE_URL}
            target="_blank"
            rel="noreferrer"
          >
            Forge
          </a>
          <a
            className={styles.link}
            href={DEFAULT_COMFYUI_BASE_URL}
            target="_blank"
            rel="noreferrer"
          >
            ComfyUI
          </a>
          <Link className={styles.link} href="/">
            Chat
          </Link>
          <ThemeToggle />
        </nav>
      </div>

      <section className={styles.section}>
        <h2 className={styles.heading}>Setup (bundled — Apple Silicon)</h2>
        <p className={styles.copy}>
          This path installs Forge and ComfyUI under <code>vendors/</code> on{" "}
          <strong>macOS arm64</strong> only (e.g. M4). It does not cover
          Windows, NVIDIA Linux, or Docker.
        </p>
        <ol className={styles.list}>
          <li>
            From the repo root: <code>npm run install:backends</code> — clones{" "}
            <a
              href="https://github.com/lllyasviel/stable-diffusion-webui-forge"
              target="_blank"
              rel="noreferrer"
            >
              Forge
            </a>{" "}
            and{" "}
            <a
              href="https://github.com/comfyanonymous/ComfyUI"
              target="_blank"
              rel="noreferrer"
            >
              ComfyUI
            </a>
            , creates Python venvs, and shares checkpoints at{" "}
            <code>vendors/models/checkpoints/</code>.
          </li>
          <li>
            Drop at least one open-weight checkpoint (
            <code>.safetensors</code>) into that shared folder. Nothing is
            downloaded automatically.
          </li>
          <li>
            Start everything with <code>npm run dev:all</code> (or{" "}
            <code>npm run backends:start</code> then <code>npm run dev</code>).
            Defaults: Forge{" "}
            <a href={DEFAULT_FORGE_BASE_URL} target="_blank" rel="noreferrer">
              <code>{DEFAULT_FORGE_BASE_URL}</code>
            </a>
            , ComfyUI{" "}
            <a href={DEFAULT_COMFYUI_BASE_URL} target="_blank" rel="noreferrer">
              <code>{DEFAULT_COMFYUI_BASE_URL}</code>
            </a>
            .
          </li>
          <li>
            In <Link href="/settings">Settings</Link>, change base URLs only if
            you override ports.
          </li>
        </ol>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Setup (manual / external)</h2>
        <ol className={styles.list}>
          <li>
            Install and run Forge (API on{" "}
            <a href={DEFAULT_FORGE_BASE_URL} target="_blank" rel="noreferrer">
              <code>{DEFAULT_FORGE_BASE_URL}</code>
            </a>
            ) and/or ComfyUI (
            <a href={DEFAULT_COMFYUI_BASE_URL} target="_blank" rel="noreferrer">
              <code>{DEFAULT_COMFYUI_BASE_URL}</code>
            </a>
            ) yourself.
          </li>
          <li>Put checkpoints in each server’s models folder.</li>
          <li>
            Point <Link href="/settings">Settings</Link> at those URLs.
          </li>
        </ol>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>How to use</h2>
        <ol className={styles.list}>
          <li>
            From chat, click <strong>Images</strong> (or open{" "}
            <Link href="/generate">/generate</Link>).
          </li>
          <li>
            Choose provider <strong>Forge</strong> or <strong>ComfyUI</strong>{" "}
            and a checkpoint model. ComfyUI uses a fixed txt2img workflow
            shipped with the app (no node editor).
          </li>
          <li>
            Enter a prompt (optional negative prompt). Adjust width, height,
            steps, CFG, sampler, and seed. Empty seed means random. Scheduler is
            fixed to <code>normal</code> for the ComfyUI workflow.
          </li>
          <li>
            Optional: attach a <strong>reference image</strong> to run img2img.
            A denoising strength control appears; Clear reference returns to
            text-to-image. History remembers that a reference was used but does
            not re-attach the file — upload again to iterate.
          </li>
          <li>
            Click <strong>Generate</strong>. Use <strong>Stop</strong> to cancel;
            cancelled runs are not saved to history.
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
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Troubleshooting</h2>
        <ul className={styles.list}>
          <li>
            <strong>Empty model list / backend unreachable</strong> — run{" "}
            <code>npm run backends:start</code>; check{" "}
            <code>vendors/logs/forge.log</code> and{" "}
            <code>comfyui.log</code>. First Forge boot can take several minutes.
          </li>
          <li>
            <strong>Still no models</strong> — add a{" "}
            <code>.safetensors</code> under{" "}
            <code>vendors/models/checkpoints/</code>, then restart backends.
          </li>
          <li>
            <strong>OOM on M4</strong> — running both backends with large
            checkpoints can exhaust unified memory. Use{" "}
            <code>npm run backends:stop</code> (or kill one PID under{" "}
            <code>vendors/run/</code>) and run a single provider.
          </li>
          <li>
            <strong>install:backends refuses</strong> — Apple Silicon only. Use
            the manual setup above on other platforms.
          </li>
        </ul>
      </section>
    </main>
  );
}
