# LLM Playground

A local-first, OpenAI-playground-style web app for testing open-weight LLMs with full
parameter control.

Nothing is built yet — this repo currently holds only the Finn-loop skills and project
scaffolding. The application is specified as a chain of Linear issues in the
[LLM Playground](https://linear.app/aliceassist/project/llm-playground-d0b0acff5b9a)
project on team `ALI`.

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
`/finn-review` posts a verdict. **Humans merge** — no agent merges or enables auto-merge.
