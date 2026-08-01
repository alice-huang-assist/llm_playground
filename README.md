# LLM Playground

A local-first, OpenAI-playground-style web app for testing open-weight LLMs with full
parameter control.

The app is specified as a chain of Linear issues in the
[LLM Playground](https://linear.app/aliceassist/project/llm-playground-d0b0acff5b9a)
project on team `ALI`. So far it discovers models across local runtimes and lets one be
selected — chat itself is not built yet.

## Getting started

```bash
npm install
npm run dev     # http://localhost:3000
```

`npm run lint`, `npm run typecheck`, and `npm test` are the checks CI runs on every pull
request.

## Planned scope

- **Providers:** Ollama (`:11434`), LM Studio (`:1234`), and OpenRouter — all
  OpenAI-compatible, behind a single adapter
- **Mode:** chat with an editable system prompt, multi-turn, streaming
- **Parameters:** `temperature`, `top_p`, `max_tokens`, `seed`, `top_k`, `min_p`,
  `repeat_penalty`
- **Persistence:** SQLite, named revisitable sessions
- **Model install:** type an Ollama model name, pull it with streaming progress
- **No auth** — single user, localhost

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

## Workflow

This repo uses [Finn-loop](https://github.com/finna/Finn-loop): `/finn-spec` interviews
and files issues, you apply `agent-ready` in Linear, `/finn-build` claims and opens PRs,
`/finn-review` posts a verdict. When a PR is `loop-approved` with required CI green and
no `needs-human-review`, the reviewer enables **squash auto-merge** (`gh pr merge --auto
--squash`). Build never merges. Ensure branch protection allows auto-merge and that
required checks are configured — Finn-loop will not approve without them.
