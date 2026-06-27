# CLAUDE.md

Guidance for Claude Code in this repository.

## Project Overview

Applye is a desktop job-search management app built with Tauri 2 + Angular. It helps job seekers
track applications, paste job descriptions for AI-assisted HR checks and resume tailoring, and
prepare for interviews. Primary market: German/EU job seekers. The app runs fully offline for core
workflows; AI features are opt-in and token-frugal by design.

## Monorepo Structure (Nx workspace)

```
applye/
├── apps/
│   ├── desktop/          — Tauri 2 + Angular (primary app)
│   │   ├── src/          — Angular frontend
│   │   └── src-tauri/    — Rust backend (commands, SQLite, AI, files)
│   ├── web/              — Angular landing site (applye.dev)
│   └── mobile/           — placeholder, scaffold later
├── libs/
│   ├── core/             — domain models, types, interfaces (framework-agnostic)
│   ├── data/             — Tauri invoke wrappers, DB/AI service abstractions
│   ├── ui/               — shared Angular components + design tokens
│   ├── i18n/             — translations (en/de/ru/es/fr/uk)
│   └── skills/           — markdown skill files (prompts), versioned
└── tools/                — scripts, generators
```

## Common Commands

```bash
npm run desktop:dev       # Tauri dev mode
npm run desktop:build     # production build
npm run web:dev           # landing site
npm run mobile:dev        # tauri ios/android (when scaffolded)
npm test                  # run all tests
npm run lint
npm run type-check
npm run format
nx affected --target=test # run only affected tests (Nx)
```

## Tech Stack

Tauri v2 · Rust 2021 · Tokio · SQLite (sqlx) · Angular 19 · TypeScript · NgRx Signals · Angular CDK

## Key Conventions

- Tauri v2 runtime check: `window.__TAURI_INTERNALS__`
- Tauri v2 events: `emit` + `Emitter` trait (not `emit_all` — removed in v2)
- Window actions need a capability entry in `src-tauri/capabilities/`
- Shared types live in `libs/core` — never duplicate IPC contracts
- AI output is always cached (`jd_hash` → `scoring_json`, `input_hash` → output)
- All user-facing strings must go through `libs/i18n` — no hardcoded text
- Augmentation principle: AI assists, user decides. Never auto-apply AI output.

## Tooling

- codegraph daemon active — run `codegraph explore "<question>"` BEFORE grep/Read
- graphify-out/ for architecture questions (`graphify query "..."`)
- Run `graphify update .` after significant code changes
- context-mode MCP: use `ctx_batch_execute` for large file reads (raw bytes stay in sandbox)

## Decision Filter (from ROADMAP §1)

Before any architectural choice, ask:
1. Does it work offline?
2. Does it respect privacy?
3. Does it stay fast on low-end hardware?
4. Does it augment (not replace) the user?
5. Is it the simplest solution?
6. Does it fit the token budget?
7. Can it be maintained solo?

---

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
