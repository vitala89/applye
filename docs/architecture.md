# Architecture overview

A short map of how Applye is put together. For the _why_ behind any given choice, see the
[decision filter](decision-filter.md).

## Shape

Applye has a local-first desktop surface and an evolving web surface. The desktop app is
[Tauri 2](https://v2.tauri.app/): an **Angular** frontend talking to a **Rust** backend over Tauri's
IPC. Desktop state and documents live in a local **SQLite** database; the desktop workflow has no
server or cloud dependency.

It's an [Nx](https://nx.dev) monorepo so the desktop app, the web surface, and shared libraries can
live together without duplicating domain contracts. The web surface is currently deployed as static
Angular assets; its planned account-backed backend is defined in
[ADR-0007](product/decisions/ADR-0007-web-backend-platform.md).

```
applye/
├── apps/
│   ├── desktop/          Tauri 2 + Angular — the primary app
│   │   ├── src/          Angular frontend (UI, routes, components)
│   │   └── src-tauri/    Rust backend (commands, SQLite, AI bridge, file I/O)
│   └── web/              static Angular web surface (applye.dev); no account runtime yet
└── libs/
    ├── core/             domain model, contracts, pure rules
    ├── data/             stateless desktop/Tauri gateways
    ├── application/      desktop application state and use-case orchestration
    ├── ui/               shared presentational Angular UI and tokens
    ├── i18n/             shared translations (en/de/ru/es/fr/uk)
    └── skills/           Rust-embedded AI prompt files; intentionally not an Nx project
```

There is no `apps/mobile`. The plan for a mobile target, and the conditions
under which it starts, are in [mobile-target.md](mobile-target.md); an `apps/`
entry that builds nothing reads as a target that exists.

## Layers and the dependency rule

Two constraints apply together. A dependency is legal only when **both** the `type:` rule and the
`scope:` rule in `eslint.config.mjs` allow it. Tags today:

| Project       | `type:`            | `scope:`        |
| ------------- | ------------------ | --------------- |
| `desktop`     | `type:app`         | `scope:desktop` |
| `web`         | `type:app`         | `scope:web`     |
| `application` | `type:application` | `scope:desktop` |
| `data`        | `type:data`        | `scope:desktop` |
| `core`        | `type:domain`      | `scope:shared`  |
| `ui`          | `type:ui`          | `scope:shared`  |
| `i18n`        | `type:util`        | `scope:shared`  |

Production `type:` directions:

```text
type:app          -> application, ui, util, domain
type:application  -> data, domain, util
type:data         -> domain, util
type:ui           -> domain, util
type:util         -> domain, util
type:domain       -> domain
```

Production app code cannot depend on `type:data`. A `*.spec.ts` or `*.harness.ts` may, because a
spec fakes the gateway its store calls. That exception is the second `depConstraints` block in
`eslint.config.mjs`, and it is not a production dependency.

Scope directions:

```text
scope:desktop -> desktop, shared
scope:web     -> web, shared
scope:shared  -> shared
```

`libs/application` and `libs/data` are `scope:desktop`. `apps/web` therefore cannot import them,
even though `type:app` is allowed to depend on `type:application`. The current web surface uses
`libs/ui` styles and tokens. The tags also allow it to import shared `ui`, `i18n`, and `core` from
TypeScript. They do not allow the desktop application or data layers.

### Current physical architecture

```text
apps/desktop
     |
     +------> libs/application ------> libs/data ------> libs/core
     |              |                      |
     |              +--------------------->|  (data may also use i18n)
     |              +------> libs/i18n
     |              +------> libs/core
     |
     +------> libs/ui -------> libs/core, libs/i18n   (permitted; ui must not import data)
     +------> libs/i18n -----> libs/core
     +------> libs/core

apps/web
     |
     +------> libs/ui, libs/i18n, libs/core     (shared scope; styles are what web uses today)
     X libs/application                         (scope:desktop)
     X libs/data                                (scope:desktop)
```

Libraries never depend upward on apps or on a higher layer. Library-to-library dependencies are
permitted only in the downward directions above. `ui` must not import `data`, so a shared component
cannot trigger IPC. `application` must not import `ui`, so a store cannot reach for a component.

This is enforced, not merely documented: `@nx/enforce-module-boundaries` fails the lint run on an
edge that points the wrong way.

Imports go through the published entry point (`@applye/core`, never
`@applye/core/lib/models/job.model`). Deep imports bypass the public API and are treated as a defect.

### Accepted future direction, not the current graph

[ADR-0006](product/decisions/ADR-0006-career-company-network-interview-intelligence.md) draws a
future logical picture in which desktop and web share application use cases and domain rules, with
separate local and web adapters. That decision stands. It does not mean today's `apps/web` may
import today's `libs/application`. That library is desktop-scoped until a later slice creates a
shared application boundary on purpose. [ADR-0007](product/decisions/ADR-0007-web-backend-platform.md)
names the future web runtime (Cloudflare Workers, TypeScript, Hono, D1, R2). No `apps/api` exists,
and this document does not create one.

## What `libs/application` owns

`libs/application` owns screen and application state, page stores, and use-case orchestration. A
store coordinates domain rules from `libs/core` with stateless gateways from `libs/data`. The
precedent is `libs/application/src/lib/jobs/jobs.store.ts`: plain `signal()` and `computed()`, no
NgRx. [ADR-0005](product/decisions/ADR-0005-application-layer-owns-page-state.md) is the decision.

It does not own Tauri IPC, SQLite, navigation, toasts, clipboard, native dialogs, or browser
storage. Those effects stay in `apps/desktop`. A store returns an outcome or a destination; the page
navigates, notifies, copies, or opens a dialog. Business and data commands go through `libs/data`.
Presentation-only shell effects, opening or revealing a file this app just wrote, go through
`apps/desktop/src/app/core/native-shell`. Production app code does not skip the application layer
to call `libs/data`.

ESLint rejects, in production files under `libs/application/src`:

- `@tauri-apps/*` and a dynamic import of `@tauri-apps/api/core`;
- `@angular/router`;
- `navigator`, `localStorage`, and `sessionStorage`, including member access;
- `ToastService`.

Specs are exempt so they can fake an effect. The same file also stops a component (`*.component.ts`
or `app.ts`) from injecting `AiService`, `JobSourceService`, or any `*Gateway`.

The file-size contract for this layer, and for every other category, is the table in
[CODE_QUALITY.md](governance/CODE_QUALITY.md). The checker enforces 225 lines on every production
TypeScript file under `libs/application` and on any `*.store.ts` in source scope. ADR-0005 originally
chose 250 for stores; that history stays in the ADR. The executable number is 225.

## Application feature direction

Nx sees `libs/application` as one project, so it cannot reject a cycle between the feature folders
inside it. Production TypeScript under `libs/application/src/lib` is a directed graph of those
top-level folders, and that graph stays acyclic. A workflow may orchestrate another capability in
one direction. It does not import that feature merely to borrow a type, enum, or pure rule that
belongs to the domain. Type-only imports still count. Specs do not. Production code inside the
library does not import `@applye/application` or the library barrel; that hides the feature edge.

The allowed edges, each with a reason, live in `tools/lib/application-feature-policy.mjs`.
The only approved production edge is `jobs -> documents`: the job application workflow orchestrates
document generation, review, export, linking, and gap-fill. Documents do not orchestrate jobs.
`npm run quality:application-boundaries` runs
`tools/check-application-feature-boundaries.mjs`. It fails when:

- the feature graph contains a cycle, even if both directions were listed;
- a production cross-feature edge is not in the policy;
- an approved edge has no production import left;
- production code imports `@applye/application` or the library barrel by a relative path;
- a relative import cannot be resolved, because the graph would miss that edge;
- a relative import leaves `libs/application/src/lib`.

Type-only imports count. Specs do not. A non-relative import other than the application barrel is
not a feature edge in this checker; Nx still owns library tags. Shared document vocabulary,
including `DocumentRegionTag` and `inferDocumentRegion`, lives in `libs/core` under `documents/`.
Job-workflow rules, such as which language a review step opens in, stay in the jobs feature.

### Legacy `core/models` ratchet

`libs/core/src/lib/models` is a legacy bucket. New bounded-context concepts do not go there. They
use a domain-owned folder such as `documents/`, `career/`, `company/`, `network/`, or `interview/`.
`legacyCoreModelFiles` in the same policy module is a shrinking allowlist. A file on disk that is
not listed fails. A listed name that is no longer on disk fails. Moving or deleting a legacy model
removes its allowlist entry in the same change, and that filename may not come back into the bucket.

## Frontend (Angular)

- **Angular 21**, standalone components, **zoneless** change detection (no `zone.js` polyfill is
  loaded in either app).
- **Signals for state, and nothing else.** Component state is `signal()` and `computed()`. State
  that outlives a component lives in an `@Injectable({providedIn:'root'})` service built from the
  same primitives - `libs/application/src/lib/jobs/jobs.store.ts` is the pattern. There is no state-management
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

## Desktop backend (Rust / Tauri)

- Commands are exposed via Tauri IPC. Business and data commands are consumed through
  typed wrappers in `libs/data`. Presentation-only shell effects, opening or revealing a
  file this app just wrote, go through `apps/desktop/src/app/core/native-shell`. That
  adapter calls the existing guarded Rust commands. `libs/application` calls neither.
  A page calls the adapter and does not name a Tauri command. ADR-0005, amendment
  sixty-eight.
- Architecture Stabilization made the **targeted** command modules thin adapters:
  Applications, Documents, Interview, Tracklist Import, Jobs, Discover, and Tailoring.
  Their workflow, pure rules, parsers, renderers, and SQL live outside `commands/`.
  Other active modules still hold more of their implementation beside the IPC entrypoint,
  including ATS, analytics, health, tracker, settings, follow-up drafts, portal answers,
  and the WYSIWYG print path. That is the current tree, not a leftover task to rewrite
  every command.
- The untrusted-parser guard lives in `untrusted`. Shared URL and HTML helpers live in
  `url_parts` and `web_text`. Exported-file provenance lives in `exported_paths`. Open and
  Reveal stay native shell commands. Documents export calls the Tailoring feature directly.
  The CV style contract lives in `tailoring`, so Tailoring does not depend on Documents.
- **SQLite** (via `sqlx`) is the desktop source of truth for profile, jobs, applications,
  pipeline history, the document library, and the AI result cache.
- **Document Library export is live for DOCX and structured PDF.** `cv_document_export` and
  `cover_letter_document_export` take `format: 'docx' | 'pdf'`. Separate WYSIWYG PDF commands
  render the on-screen document: `cv_document_export_pdf_wysiwyg` and
  `cover_letter_document_export_pdf_wysiwyg`. Tracker report export is its own WYSIWYG command.
- The old Tailoring journal commands `generated_doc_get`, `export_docx`, and `export_pdf` are
  not registered. Those names are not the Document Library export above. `validate_theme` is a
  pure Tailoring rule and is not an IPC command. The `generated_docs` table remains only so
  older databases still open; job hard-delete still removes those historical rows. There is
  no live `generated_doc_get` endpoint. Editable documents are `document_library` records.
- Tauri v2 conventions: runtime check via `window.__TAURI_INTERNALS__`; events via `emit` + the
  `Emitter` trait; window actions need a capability entry under `src-tauri/capabilities/`.

## Planned web backend

The web backend is a **separate infrastructure adapter**, not a hosted copy of the Tauri/Rust
backend. Per [ADR-0007](product/decisions/ADR-0007-web-backend-platform.md), the planned runtime is
Cloudflare Workers with **TypeScript + Hono**.

The intended direction is:

```text
apps/web (Angular)
        |
      /api/*
        |
Cloudflare Worker (TypeScript + Hono)
        |
application/domain contracts
        |
   +----+---------+----------------+
   |              |                |
  D1             R2          Queues/Workflows
structured     objects        when justified
  data
```

The desktop keeps Rust/Tauri/SQLite. Web and desktop may share framework-agnostic domain language,
pure rules, and selected use cases, but they do not share persistence or runtime assumptions.

The current static Cloudflare Pages deployment remains valid until the first account-backed backend
milestone. At that point the preferred migration is to Cloudflare Workers with Static Assets, rather
than adding an unrelated long-running server solely to host the API.

Do not create an empty `apps/api` shell before implementation work begins. ADR-0007 records the
decision now; the physical project is created with the first backend slice.

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

### The initial-bundle budget, and why it moves

`apps/desktop/project.json` sets an `initial` budget on the production build. It
is a real constraint that has decided a design twice, so the numbers are worth
reading rather than raising on reflex.

Eighteen routes are `loadComponent`, so a screen's own code is in its own lazy
chunk. **`libs/application` is not**: the shell imports it eagerly, so anything
exported from its barrel loads on launch. That puts `ADR-0005` and lazy routing
in tension by construction - migrating a lazily-routed page's state into
`libs/application` moves that code from a chunk most sessions never fetch into
the one every launch does.

The tension is accepted, not resolved. What the budget buys is that the cost is
**measured** rather than discovered later:

- Moving Discover's location vocabulary down - an 811-line table read by
  `classifyLoc` - would have cost **12.87 kB** and failed the build. That is why
  `discover-location.ts` and `discover-region-groups.ts` stay in the page while
  the tri-state rules that need no table moved. Type-check, lint and the whole
  suite passed on the version that failed here.
- Discover's four-PR migration cost about **7 kB** in total and consumed the
  remaining headroom, which is why the ceiling moved to `1600kb`.

`maximumWarning` is set close to the current size on purpose. It sat at `1300kb`
while the app was ~200 kB past it, so it fired on every build and told nobody
anything - and the 12.87 kB regression above had to be caught by the error
instead. A warning is only useful while it is quiet.

### `libs/skills` is not an Nx project, on purpose

The 19 AI prompts under `libs/skills/src/<name>/<name>.md` are the one thing in
`libs/` with no `project.json`, and it is deliberate. They are **markdown read by
Rust**, not TypeScript imported by anything: `src-tauri/src/ai/skills.rs` pulls
each one in with `include_str!` so the prompts are compiled into the binary and
the app works offline.

The consequences are smaller than they look, and were measured rather than
assumed:

- **Caching is correct already.** `rustc` records `include_str!` files in its
  dep-info, so `cargo` rebuilds when a prompt changes - verified by touching one.
  Nx never had a claim here: `nx build desktop` is Angular-only, and `cargo` runs
  from `npx tauri build`, outside the Nx graph entirely.
- **`@nx/enforce-module-boundaries` has nothing to enforce.** It governs
  TypeScript imports, and no TypeScript imports these files.
- **A `project.json` would make things worse, not better.** Nx cannot infer a
  dependency that lives inside a Rust macro, so the node would sit unconnected;
  wiring it with `implicitDependencies` would then rebuild and retest the whole
  Angular app on every prompt edit, for nothing.

What the arrangement really costs is that the coupling is invisible until it
breaks. Both directions are covered:

- **Renaming or deleting a prompt is loud** - `include_str!` stops resolving and
  the build fails with the path.
- **Adding one is silent**, so a test catches it. `every_bundled_prompt_has_a_match_arm`
  reads the directory at run time and fails if a prompt has no arm in
  `skill_source`, unless it is listed in `UNWIRED_PROMPTS` with its reason.
  **That list is empty**, so the 19 prompts and the 19 arms are the same number
  and either side drifting is a failing test. Four names sat in it from
  2026-07-26 until 2026-08-17, when they were deleted along with their prompts:
  `ats-check`, `employment-report` and `cover-letter` had each been superseded by
  an implementation that spends no tokens, and `company-research` was never
  built. None of the four had an arm, so none was ever reached by `include_str!`
  and none was ever in the binary - they were content of the repository rather
  than of the product, which is what made deleting them a smaller decision than
  the comment recording them had assumed.

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
