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

## Layers and the dependency rule

The libraries are a stack, and dependencies only ever point downward:

```
        apps/desktop            apps/web
        (type:app)              (type:app)
        scope:desktop           scope:web
             │                       │
    ┌────────┼────────┬──────────┐   │ (styles only - no TypeScript
    ▼        ▼        ▼          ▼   ▼  dependency on any library)
  data      i18n     ui        core
 type:data type:util type:ui  type:domain
 scope:desktop  ────── scope:shared ──────
```

- **`core` (type:domain)** depends on nothing. Framework-agnostic models, types and pure functions.
  It is the only layer both other libraries and the apps may reach into freely, and the only place a
  contract shared with Rust is allowed to live.
- **`ui` (type:ui)** depends on nothing either: presentational Angular components and the design
  tokens. It never imports `data`, so a shared component can never trigger IPC.
- **`i18n` (type:util)** and **`data` (type:data)** depend on `core` only.
- **`data` is `scope:desktop` on purpose.** It wraps Tauri IPC, and the web app has no Tauri
  runtime; the tag is what stops someone importing it into `apps/web` and shipping a broken page.
- **Apps depend on libraries. Libraries never depend on apps, and never on each other sideways.**

This is enforced, not merely documented: every project carries `type:` and `scope:` tags in its
`project.json`, and `@nx/enforce-module-boundaries` in `eslint.config.mjs` fails the lint run on any
edge that points the wrong way. Adding a new library means giving it tags; `npm run lint` will tell
you immediately if its dependencies contradict them.

Imports go through the published entry point (`@applye/core`, never
`@applye/core/lib/models/job.model`). Deep imports bypass the public API and are treated as a defect.

## Frontend (Angular)

- **Angular 21**, standalone components, **zoneless** change detection (no `zone.js` polyfill is
  loaded in either app).
- **Signals for state, and nothing else.** Component state is `signal()` and `computed()`. State
  that outlives a component lives in an `@Injectable({providedIn:'root'})` service built from the
  same primitives - `libs/data/.../jobs.store.ts` is the pattern. There is no state-management
  library: NgRx was removed once it amounted to one store of seventy-six lines whose peer range
  would have gated every future Angular major.
- **`ChangeDetectionStrategy.OnPush` on every component.** It is not Angular's default in 21.2, but
  the framework is moving there - `ChangeDetectionStrategy.Default` is already deprecated in favour
  of `Eager` - so new components declare `OnPush` explicitly. A handful of large legacy screens are
  still on the default strategy and are being migrated as each one is refactored.
- **Templates and styles live in their own files** (`templateUrl` / `styleUrl`) for anything beyond
  a trivial component. A component whose `.ts` has to be scrolled past its own template is a
  component that has stopped being reviewable.
- **Angular CDK** for primitives (the pipeline Kanban board uses CDK drag-drop).
- All user-facing text flows through `libs/i18n` - no hardcoded strings.
- Design is driven by CSS custom-property **tokens** in `libs/ui`, not ad-hoc styles. Both apps
  `@use` the same `libs/ui/src/styles/global`, so there is one token source, not one per app.

## Backend (Rust / Tauri)

- Commands are exposed via Tauri IPC and consumed through typed wrappers in `libs/data`.
- **SQLite** (via `sqlx`) is the single source of truth: profile, jobs, pipeline status history,
  generated documents, and the AI result cache.
- Document export **ships as PDF**, rendered from the same HTML the preview shows. A DOCX renderer
  (`docx-rs`) exists in the backend but is not surfaced in the UI; treat it as dormant rather than
  as a second supported format.
- Tauri v2 conventions: runtime check via `window.__TAURI_INTERNALS__`; events via `emit` + the
  `Emitter` trait; window actions need a capability entry under `src-tauri/capabilities/`.

### The window's content-security policy

`tauri.conf.json` takes no comments, so the reasoning for `app.security.csp` lives here. The policy
is strict by default - `default-src 'self'`, `object-src 'none'`, `form-action 'none'` - and every
relaxation below is a specific requirement rather than a convenience.

| directive     | value                                               | why it is not tighter                                                                                                                                                                                                                                                                                                     |
| ------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `script-src`  | `'self'`                                            | No inline script, no CDN, no `eval`. This is also the directive that **rules out Module Federation**: a remote entry cannot load, which is one of the reasons microfrontends were rejected for an app holding API keys in the OS keychain.                                                                                |
| `style-src`   | `'self' 'unsafe-inline'`                            | **The one real weakening.** Angular emits component styles as inline `<style>` elements at runtime, and its critical-CSS inlining does the same at build time. There is no nonce or hash the CSP can name for styles the framework generates after the policy is written. It permits CSS injection, not script execution. |
| `img-src`     | `'self' data: blob: asset: https://asset.localhost` | `data:` carries the profile photo and generated previews; `asset:`/`asset.localhost` is how Tauri's asset protocol serves local files to the webview.                                                                                                                                                                     |
| `connect-src` | `'self' ipc: https://ipc.localhost`                 | The IPC channel, and nothing else. **AI provider calls do not appear here** because they are made from Rust, not from the webview - which is what keeps the API key out of the renderer.                                                                                                                                  |
| `font-src`    | `'self'`                                            | Fonts ship with the bundle; the app is local-first and must work offline.                                                                                                                                                                                                                                                 |

`style-src 'unsafe-inline'` is the one line to revisit if Angular ever offers a nonce-based style
pipeline. Nothing else here has slack in it.

**File drag-and-drop into the window is disabled** (`app.windows[].dragDropEnabled: false`). Nothing
in the app consumes a file drop - there is no `onDragDropEvent` listener in the frontend or the Rust
side - and left at its default the webview intercepts drag events at the OS level. The two drag
features that do exist are unaffected: the pipeline kanban and the CV section reorder use Angular
CDK, which is pointer-event based, and `data-tauri-drag-region` moves the window, which is a
different mechanism entirely. Turn it back on if a drop target is ever added.

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
- Components import libraries through their entry point only; the boundary lint enforces it.
- A feature's screen, its child components and its services live together under that feature's
  folder. Cross-feature reuse is a signal to move the thing down into `libs/ui` or `libs/core`.
- Every change is checked against the [decision filter](decision-filter.md).

Working conventions for each stack - naming, state, testing, error handling, lint and formatting -
are written up as skills rather than prose here, so an agent and a human read the same rules:
[`.claude/skills/applye-angular/SKILL.md`](../.claude/skills/applye-angular/SKILL.md) and
[`.claude/skills/applye-rust/SKILL.md`](../.claude/skills/applye-rust/SKILL.md).

> A documentation site (Cloudflare Pages) is a later step. For now these docs are plain markdown in
> the repo.
