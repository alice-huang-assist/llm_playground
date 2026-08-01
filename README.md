# LLM Playground

A local-first, OpenAI-playground-style web app for testing open-weight LLMs and
local image models with full parameter control.

The app is specified as a chain of Linear issues in the
[LLM Playground](https://linear.app/aliceassist/project/llm-playground-d0b0acff5b9a)
project on team `ALI`.

## Getting started

```bash
npm install
npm run dev     # http://localhost:3000
```

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

### Setup (Forge)

1. Install and run [Stable Diffusion WebUI Forge](https://github.com/lllyasviel/stable-diffusion-webui-forge)
   (or another A1111-compatible server that exposes `/sdapi/v1`).
2. Start it with the API enabled (default `http://127.0.0.1:7860`). Confirm
   `/sdapi/v1/sd-models` responds.
3. Put at least one open-weight checkpoint in Forge’s models folder so it shows
   up in the picker.
4. In the app, open **Settings** and set the Forge base URL if needed (default
   `http://127.0.0.1:7860`).

### Setup (ComfyUI)

1. Install and run [ComfyUI](https://github.com/comfyanonymous/ComfyUI) with the
   HTTP API (default `http://127.0.0.1:8188`).
2. Put at least one open-weight checkpoint in ComfyUI’s models folder.
3. In **Settings**, set the ComfyUI base URL if needed.

Img2img (reference upload) is a follow-up — not in this release.

### How to use

1. Open **Images** from the chat header (or go to `/generate`).
2. Choose provider **Forge** or **ComfyUI** and a checkpoint.
3. Enter a prompt (optional negative prompt). Adjust width, height, steps, CFG,
   sampler, and seed (empty seed = random). ComfyUI uses a fixed txt2img
   workflow (scheduler fixed to `normal`).
4. Click **Generate**. **Stop** cancels the run; cancelled runs are not saved.
5. History (right rail) stores successful generations on disk under
   `data/generations/` plus SQLite metadata (shared across providers). Click an
   item to restore the form; **Download** / **Delete** act on that entry.
6. If the selected backend is unreachable, the page still loads with empty
   models and a message linking to Settings and these docs; chat keeps working.

## Explicitly out of scope

- Subscription billing, payment tiers, user accounts
- Paid/proprietary models (GPT, Claude, Gemini) — open-weight only
- Scored eval runs, LLM-as-judge, any eval harness
- Side-by-side model comparison (deferred)

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

## Workflow

This repo uses [Finn-loop](https://github.com/finna/Finn-loop): `/finn-spec` interviews
and files issues, you apply `agent-ready` in Linear, `/finn-build` claims and opens PRs,
`/finn-review` posts a verdict. When a PR is `loop-approved` with required CI green and
no `needs-human-review`, the reviewer enables **squash auto-merge** (`gh pr merge --auto
--squash`). Build never merges. Ensure branch protection allows auto-merge and that
required checks are configured — Finn-loop will not approve without them.
