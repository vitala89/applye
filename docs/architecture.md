# Architecture overview

A short map of how Applye is put together. For the _why_ behind any given choice, see the
[decision filter](decision-filter.md).

## Shape

Applye is a [Tauri 2](https://v2.tauri.app/) desktop app: an **Angular** frontend talking to a
**Rust** backend over Tauri's IPC. State and documents live in a local **SQLite** database - there
is no server and no cloud component.

It's an [Nx](https://nx.dev) monorepo so the desktop app, a landing site, and shared libraries can
live together without duplicating contracts.

```
applye/
├── apps/
│   ├── desktop/          Tauri 2 + Angular - the primary app
│   │   ├── src/          Angular frontend (UI, routes, components)
│   │   └── src-tauri/    Rust backend (commands, SQLite, AI bridge, file I/O)
│   ├── web/              Angular landing site (applye.dev)
│   └── mobile/           placeholder - scaffolded later
└── libs/
    ├── core/             domain models, types, IPC contracts (framework-agnostic)
    ├── data/             Tauri invoke wrappers, DB/AI service abstractions
    ├── ui/               shared Angular components + design tokens
    ├── i18n/             translations (en/de/ru/es/fr/uk)
    └── skills/           markdown skill files (AI prompts), versioned
```

## Frontend (Angular)

- **Angular 21**, standalone components, zoneless change detection.
- **NgRx Signals** for state - a `SignalStore` per feature area, no global Redux-style store.
- **Angular CDK** for primitives (the pipeline Kanban board uses CDK drag-drop).
- All user-facing text flows through `libs/i18n` - no hardcoded strings.
- Design is driven by CSS custom-property **tokens** in `libs/ui`, not ad-hoc styles.

## Backend (Rust / Tauri)

- Commands are exposed via Tauri IPC and consumed through typed wrappers in `libs/data`.
- **SQLite** (via `sqlx`) is the single source of truth: profile, jobs, pipeline status history,
  generated documents, and the AI result cache.
- Document export is **DOCX-first** (`docx-rs`) with a PDF path (`printpdf`).
- Tauri v2 conventions: runtime check via `window.__TAURI_INTERNALS__`; events via `emit` + the
  `Emitter` trait; window actions need a capability entry under `src-tauri/capabilities/`.

## AI integration

AI is an **opt-in, bring-your-own** capability, never a dependency of the core workflows.

- Two routes: a **provider API key** or a **CLI bridge** to a local AI CLI. Keys and billing are
  the user's.
- Prompts live as versioned markdown in `libs/skills` so they can be reviewed and improved like code.
- **Everything is cached.** Identical inputs reuse prior output (`jd_hash → scoring_json`,
  `input_hash → output`), so the same request never costs tokens twice.
- The **augmentation principle is structural**: AI produces proposals into the UI; the user reads,
  edits, and accepts them. Nothing is auto-applied, auto-sent, or acted on without an explicit step.

## Data flow - the core loop

```
paste JD ──▶ [Rust] hash + cache lookup ──▶ AI check (opt-in) ──▶ proposal shown in UI
                                                                        │
                                              user edits / accepts ◀────┘
                                                     │
                          tailor CV (3-pass) ──▶ DOCX/PDF export ──▶ SQLite (documents)
                                                     │
                          add to pipeline ──▶ status history recorded ──▶ SQLite (jobs)
```

Each arrow that touches a model is gated on an explicit user action, and each result is written to
the cache on the way back.

## Conventions

- Shared types and IPC contracts live in `libs/core` - never duplicated across the boundary.
- Translations live in `libs/i18n` - never inline.
- AI prompts live in `libs/skills` - versioned, not embedded in code.
- Every change is checked against the [decision filter](decision-filter.md).

> A documentation site (Cloudflare Pages) is a later step. For now these docs are plain markdown in
> the repo.
