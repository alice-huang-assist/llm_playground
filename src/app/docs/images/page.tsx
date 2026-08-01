import Link from "next/link";

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
          <Link className={styles.link} href="/">
            Chat
          </Link>
        </nav>
      </div>

      <section className={styles.section}>
        <h2 className={styles.heading}>Setup (Forge)</h2>
        <ol className={styles.list}>
          <li>
            Install and run{" "}
            <a
              href="https://github.com/lllyasviel/stable-diffusion-webui-forge"
              target="_blank"
              rel="noreferrer"
            >
              Stable Diffusion WebUI Forge
            </a>{" "}
            (or another A1111-compatible server that exposes{" "}
            <code>/sdapi/v1</code>).
          </li>
          <li>
            Start it with the API enabled (Forge/A1111 typically listen on{" "}
            <code>http://127.0.0.1:7860</code>). Confirm{" "}
            <code>/sdapi/v1/sd-models</code> responds in a browser or with curl.
          </li>
          <li>
            Download at least one open-weight checkpoint into Forge’s models
            folder so it appears in the model list.
          </li>
          <li>
            In this app, open <Link href="/settings">Settings</Link> and set the
            Forge base URL if it isn’t already{" "}
            <code>http://127.0.0.1:7860</code>.
          </li>
        </ol>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Setup (ComfyUI)</h2>
        <ol className={styles.list}>
          <li>
            Install and run{" "}
            <a
              href="https://github.com/comfyanonymous/ComfyUI"
              target="_blank"
              rel="noreferrer"
            >
              ComfyUI
            </a>{" "}
            with the HTTP API (default <code>http://127.0.0.1:8188</code>).
          </li>
          <li>
            Put at least one open-weight checkpoint in ComfyUI’s models folder.
          </li>
          <li>
            In <Link href="/settings">Settings</Link>, set the ComfyUI base URL
            if it isn’t already <code>http://127.0.0.1:8188</code>.
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
    </main>
  );
}
