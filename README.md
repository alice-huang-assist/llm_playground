# LLM Playground

A local-first, OpenAI-playground-style web app for testing open-weight LLMs and
local image models with full parameter control.

The app is specified as a chain of Linear issues in the
[LLM Playground](https://linear.app/aliceassist/project/llm-playground-d0b0acff5b9a)
project on team `ALI`.

## Getting started

```bash
npm install
npm run dev     # http://localhost:3000 — chat only; image backends optional
```

### Images (Apple Silicon)

Bundled local install for **Forge** + **ComfyUI** is supported on **macOS arm64**
(e.g. M4) only — not Windows, NVIDIA Linux, or Docker in this chain.

```bash
npm run install:backends   # once: clone under vendors/, create venvs
# Drop at least one open-weight checkpoint (.safetensors) into:
#   vendors/models/checkpoints/
npm run dev:all            # Forge :7860 + ComfyUI :8188 + Next :3000
# or, after npm run build:
npm run start:all
```

Separate backend control: `npm run backends:start` / `npm run backends:stop`.
Logs live under `vendors/logs/`. Running **both** backends with large checkpoints
can exhaust M4 unified memory — stop one if you hit OOM.

`npm run lint`, `npm run typecheck`, and `npm test` are the checks CI runs on every pull
request.

## Chat

- **Providers:** Ollama (`:11434`), LM Studio (`:1234`), and OpenRouter — all
  OpenAI-compatible, behind a single adapter
- **Mode:** chat with an editable system prompt, multi-turn, streaming
- **Parameters:** `temperature`, `top_p`, `max_tokens`, `seed`, `top_k`, `min_p`,
  `repeat_penalty`
- **Persistence:** SQLite, named revisitable sessions
- **Model install:** type an Ollama model name, pull it with streaming progress
- **No auth** — single user, localhost

## Images playground

Sibling feature at `/generate` (nav: **Images**). Talks to local **Forge**
(A1111 `/sdapi/v1`) and/or **ComfyUI** from the Next.js API only — the browser
never calls those servers directly.

In-app copy of this guide: [`/docs/images`](http://localhost:3000/docs/images).

### Setup (bundled — Apple Silicon)

1. `npm run install:backends` — clones Forge and ComfyUI into `vendors/`, creates
   Python venvs, and points both at the shared checkpoint dir
   `vendors/models/checkpoints/`.
2. Place at least one open-weight checkpoint in that shared folder (no auto-download).
3. `npm run dev:all` (or `backends:start` then `npm run dev`). Defaults:
   Forge `http://127.0.0.1:7860`, ComfyUI `http://127.0.0.1:8188`.
4. In **Settings**, change base URLs only if you override ports.

### Setup (manual / external)

If you already run Forge or ComfyUI elsewhere (or are not on Apple Silicon):

1. Run [Forge](https://github.com/lllyasviel/stable-diffusion-webui-forge) with
   the API enabled (default `:7860`) and/or
   [ComfyUI](https://github.com/comfyanonymous/ComfyUI) (default `:8188`).
2. Put checkpoints in each server’s models folder.
3. Point **Settings** at those URLs.

Img2img is supported via an optional reference upload on `/generate`.

### How to use

1. Open **Images** from the chat header (or go to `/generate`).
2. Choose provider **Forge** or **ComfyUI** and a checkpoint.
3. Enter a prompt (optional negative prompt). Adjust width, height, steps, CFG,
   sampler, and seed (empty seed = random). ComfyUI uses a fixed txt2img
   workflow (scheduler fixed to `normal`). Optionally attach a **reference
   image** for img2img (denoising strength appears); clear it to return to
   text-to-image. History records that a reference was used but does not
   re-hydrate the file.
4. Click **Generate**. **Stop** cancels the run; cancelled runs are not saved.
5. History (right rail) stores successful generations on disk under
   `data/generations/` plus SQLite metadata (shared across providers). Click an
   item to restore the form; **Download** / **Delete** act on that entry.
6. If the selected backend is unreachable, the page still loads with empty
   models and a message linking to Settings and these docs; chat keeps working.

### Troubleshooting

| Symptom | What to try |
|---|---|
| Empty model list / “backend unreachable” | Confirm backends with `npm run backends:start`; check `vendors/logs/forge.log` and `comfyui.log`. First Forge boot can take several minutes. |
| Models still empty after backends are up | Drop a `.safetensors` into `vendors/models/checkpoints/` (shared by both). Restart backends if they started before the file was added. |
| Out of memory / crash on M4 | Stop one backend (`npm run backends:stop`, or kill a single PID under `vendors/run/`) and use one provider at a time; prefer smaller checkpoints. |
| `install:backends` refuses to run | This path is **Apple Silicon only** (`darwin` + `arm64`). Use the manual setup above otherwise. |

## Explicitly out of scope

- Subscription billing, payment tiers, user accounts
- Paid/proprietary models (GPT, Claude, Gemini) — open-weight only
- Scored eval runs, LLM-as-judge, any eval harness
- Side-by-side model comparison (deferred)
- Docker packaging of Forge/ComfyUI; Windows/NVIDIA install scripts

## Stack

Next.js (App Router) + TypeScript + React, SQLite. Node 22.

## Build order

Issues are chained with Linear blocking relations, so they cannot be built out of order.

| Issue | Title | Blocked by |
|---|---|---|
| ALI-5 | Scaffold repo, provider abstraction, model listing | — |
| ALI-6 | Streaming chat with system prompt | ALI-5 |
| ALI-8 | Parameter sidebar | ALI-6 |
| ALI-9 | Persist named sessions in SQLite | ALI-6 |
| ALI-10 | OpenRouter provider + settings screen | ALI-5, ALI-9 |
| ALI-7 | Install Ollama models from the UI | ALI-5 |
| ALI-11 | Forge text-to-image on `/generate` with history | ALI-10 |
| ALI-12 | ComfyUI image provider alongside Forge | ALI-11 |
| ALI-13 | Optional reference upload for img2img | ALI-12 |
| ALI-14 | Apple Silicon install scripts for Forge + ComfyUI | ALI-13 |
| ALI-15 | start/stop backends + `npm run start:all` / `dev:all` | ALI-14 |
| ALI-16 | Docs for bundled Forge/ComfyUI on Apple Silicon | ALI-15 |

## Workflow

This repo uses [Finn-loop](https://github.com/finna/Finn-loop): `/finn-spec` interviews
and files issues, you apply `agent-ready` in Linear, `/finn-build` claims and opens PRs,
`/finn-review` posts a verdict. When a PR is `loop-approved` with required CI green and
no `needs-human-review`, the reviewer enables **squash auto-merge** (`gh pr merge --auto
--squash`). Build never merges. Ensure branch protection allows auto-merge and that
required checks are configured — Finn-loop will not approve without them.
