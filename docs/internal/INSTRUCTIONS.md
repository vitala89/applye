# Applye - Project Instructions (Working Agreement & Build Guide)

This file is the working agreement for building Applye. It tells any developer or AI agent
**how** to build, in what order, and what rules never to break. Pair it with `ROADMAP.md`
(the _what_) - this file is the _how_.

---

## 0. Non-negotiable principles (never violate)

1. **Augmentation, not automation.** AI advises; the human decides. Never auto-submit, never
   decide for the user. If a feature makes the user more dependent rather than more capable, reject it.
2. **Local-first.** All user data lives in local SQLite on the user's machine. No cloud, no telemetry,
   no account, ever.
3. **Privacy by design.** Collect nothing. No analytics, no usage history, no documents leave the device.
4. **Bring your own AI.** Two modes only: Direct API (user's key) and CLI-bridge (user's local CLI).
   Applye never sells or bundles AI.
5. **Token economy.** Never call AI where plain code suffices. Cache by hash. Regenerate only when
   inputs change.
6. **Legal-first.** No scraping of closed boards. Manual paste + legal sources (RSS / official APIs /
   public ATS / user sources) only.
7. **Open-source first.** MIT. Code readable, forkable, extendable via Skills / Plugins / MCP.
8. **Ship the core, then build by need.** No vision-horizon subsystem (RAG, memory, marketplace)
   before the core loop ships and is dogfooded.

---

## 1. Tech stack (fixed for v1)

- **Monorepo:** Nx (matches Vitalii's senior daily stack; recruiter signal).
- **Desktop shell:** Tauri 2 (Rust backend, web frontend, tiny signed binary, built-in updater).
- **Frontend:** Angular + TypeScript, standalone components, Signals / SignalStore.
  - **Angular pinned to 21.x** until NgRx Signals 22 ships (NgRx Signals 21.x requires Angular ^21).
    Upgrade later via `nx migrate @angular/core@22` once NgRx 22 is released. Documented choice, not drift.
- **Mobile (later):** Tauri 2 mobile (iOS/Android) - same core, just don't close the door now.
- **Web landing:** Angular app for applye.dev (static, hosted on Cloudflare Pages).
- **Database:** SQLite, accessed from Rust (`rusqlite`/`sqlx`). Frontend never runs raw SQL.
- **Drag & drop:** Angular CDK.
- **Key storage:** OS keychain via `keyring` crate. Never plaintext, never logged.
- **Styling:** design tokens (CSS variables) from the Applye design system (monochrome + indigo).
- **Design source:** the design lives in **Claude Design** and is imported via the `claude_design`
  MCP (endpoint `https://api.anthropic.com/v1/design/mcp`, auth via `/design-login`).
  Project: `https://claude.ai/design/p/e4e99cf3-f8fd-4c5d-828b-3a1530fcf0f5`.
  Tokens are extracted once into `libs/ui/tokens.css`; screens are implemented one at a time, per phase.
  **Rule: all colors / fonts / spacing / radii come from `libs/ui` tokens - never hardcoded values.**
- **Fonts:** JetBrains Mono (signature) + Inter (body) - both OFL, bundled locally.
- **i18n real source is `libs/i18n/src/lib/translations/translations.ts`** (a hand-maintained nested
  TS object), **NOT** the `en.json`/`de.json` files (those were dead and removed in v0.12.2). Any new
  UI string is added there for `en` + `de` (other locales inherit via the `stub(en, …)` pattern). The
  `i18n-keys.spec.ts` guard test must stay green - a missing key fails the build.

> Versions of Tauri plugins, the updater API, and CLI headless flags change frequently.
> Always verify against current official docs at implementation time - never write them from memory.

---

## 2. Monorepo layout (target)

```
applye/                         # Nx workspace root
├── apps/
│   ├── desktop/                # Tauri 2 + Angular (primary app)
│   │   ├── src/                # Angular frontend
│   │   └── src-tauri/          # Rust backend (commands, db, ai, files)
│   ├── web/                    # Angular landing site for applye.dev
│   └── mobile/                 # (placeholder) Tauri 2 mobile - scaffold later
├── libs/
│   ├── core/                   # domain models, types, interfaces (framework-agnostic)
│   ├── data/                   # Tauri invoke wrappers, DB/AI service abstractions
│   ├── ui/                     # shared Angular components + design tokens
│   ├── i18n/                   # translations (en/de/ru/es/fr/uk)
│   └── skills/                 # markdown skill files (prompts), versioned
├── tools/                      # scripts, generators
├── ROADMAP.md
├── INSTRUCTIONS.md             # this file
└── nx.json / package.json / tsconfig.base.json
```

Shared libs are the point of the monorepo: `core`, `data`, `ui`, `i18n`, `skills` are imported by
desktop, web, and (later) mobile - write once, reuse everywhere.

---

## 3. Build order (strict - each step must run before the next)

**Phase 0 - Foundation**

1. Nx workspace + Angular desktop app shell.
2. Tauri 2 integrated (`src-tauri`), `tauri dev` runs the Angular app in a window.
3. Design tokens in `libs/ui` (colors, type scale, spacing). Dark + light themes.
4. App shell UI: sidebar nav + topbar (from ROADMAP §Shell).

**Phase 1 - Data spine** 5. `db.rs`: all tables from ROADMAP §12 + migrations. 6. Tauri commands: profile CRUD, jobs CRUD, applications CRUD, settings. 7. `libs/data`: typed `invoke()` wrappers so Angular never touches SQL. 8. Keyring command: store/retrieve provider key securely.

**Phase 2 - AI spine** 9. `ai_run` command (dispatch). Start with Direct API + one provider, end-to-end. 10. Skill-file loader (markdown → prompt with injected context + language). 11. Settings screen: provider/key/model + economy/quality toggle + languages.

**Phase 3 - Core loop (the MVP value)** 12. Profile editor + compressed `scoring_json`. 13. Paste job → hard filter (code, 0 tokens) → recruiter scoring + ATS check (AI). 14. Scoring screen with cache by hash. 15. Tailoring wizard (XYZ → dual critique → build) + DOCX/PDF export. 16. Pipeline kanban (CDK) + auto status dates + `status_history`.

**Phase 4 - Polish & ship** 17. i18n wired (en/de first), empty/loading/error states. 18. README (privacy, source legality, token economy, augmentation principle). 19. GitHub Actions (Tauri build, 3 OSes), signed Releases, Tauri updater. 20. Web landing on applye.dev.

> MVP = Phases 0-3 working + Phase 4 minimum (README + one build). Everything in ROADMAP §13 v2/later
> is chosen afterward by the §13b prioritization filter (dogfooding need first).
>
> Everything from Phase 5 onward (navigation restructure, MVP-completion features, Documents,
> onboarding, provider disclosures, and all "grow by need" work) is tracked in `STEP_BY_STEP_PLAN.md`,
> not here - this section only covers the original Phases 0-4 build order to MVP.

---

## 4. Coding rules

- **Separation:** Angular = presentation + state. Rust = data, AI dispatch, files, keys. No SQL in
  the frontend; no business rules duplicated across the boundary.
- **One AI entry point:** everything goes through `ai_run`. Adding a provider = one Rust branch.
- **Cache everything AI-produced** by `input_hash` (includes language). Re-open = 0 tokens.
- **Prompts live in `libs/skills` as markdown**, never hardcoded in TS/Rust.
- **Three language levels** stay independent: UI / document / interview-stage (ROADMAP §11b).
- **No `localStorage`/`sessionStorage`** for real data - SQLite is the store.
- **Additive migrations only:** never edit an already-applied migration. New columns/tables go in a
  new numbered migration (`ALTER TABLE ADD COLUMN` / `CREATE TABLE IF NOT EXISTS`) so live dogfooding
  data is never lost. Inspect the live schema before writing one. Live migrations currently go up to
  `0009_pipeline_priority_comments.sql` - new work continues from `0010`, but always confirm the next
  free number against the live `migrations/` folder rather than assuming.
- **Navigation = three mental models** (ROADMAP §7): My Jobs (full DB, all statuses), Pipeline
  (active applications only - kanban), Discover (curated feed). Plus Job Tracker (export/reporting)
  and Documents (CV/Cover Letter library, ROADMAP §16). Features live inside these sections; build
  the section before the feature that lives in it.
- **Documents section = one library, two editors.** The Documents area has one table
  (`document_library`, distinct from the `generated_docs` export journal) and one nav item, with
  CV | Cover Letter tabs. CV uses a drag-and-drop section constructor; cover letter uses a fixed
  block model with a left-editor / right-preview split. `doc_type` is free text, not an enum, so new
  document kinds need no enum migration. The file actually sent to an employer is a frozen snapshot
  (`applications.cv_path` / `cover_letter_path`) - never mutated by later edits to the library doc.
- **LaTeX export is source-only (`.tex`).** Applye generates `.tex` from a document's `content_json`
  via templating and NEVER compiles it. No TeX toolchain is bundled (keeps the binary tiny, stays
  local-first with no extra runtime deps). The user compiles externally (Overleaf / local
  `pdflatex`). A non-blocking note flags that LaTeX output targets visual/print quality for a human
  reader, not ATS parsing. Do not "improve" this by adding a compiler.
- **Style safety is deterministic (0 tokens).** `check_style_safety` uses a curated ATS-safe font
  list + size range + colour print/contrast rules. Keep the two note types distinct and honest: font
  choice = ATS-parsing risk; colour = readability/print risk (colour barely affects text parsing -
  do not claim otherwise). Notes are non-blocking and only appear when the user leaves the safe
  default.
- **Cloud AI is bring-your-own only (restates Principles 2 & 4).** Applye never proxies, resells, or
  bundles AI access, and never adds an account or backend for AI. A hosted/managed offering for
  non-technical users would be a SEPARATE product ("Applye Cloud") with its own principles - not a
  toggle inside this app. Baseline privacy disclosure is shown for ANY Direct-API cloud provider;
  DeepSeek keeps its extra China/adequacy line.
- **Privacy in git:** `profile.example.md` only; `.gitignore` personal data + the `.sqlite` file.
- **Verify-don't-assume:** Tauri/Nx/plugin APIs from current docs at build time.
- **Live-verify before advancing:** before moving to the next phase, run the key scenario live
  (e.g. `desktop:dev`), not just a successful build. "Compiles" ≠ "works at runtime".
- **Out-of-scope fixes** (pre-existing problems not part of the task) go in a separate `fix:` /
  `chore:` commit - never bundled into a `feat:` for the current task.

---

## 5. Definition of "done" for any feature

A feature is done when it: works locally offline (where applicable) · respects the augmentation
principle · caches AI output · has empty/loading/error states · is wired for i18n (`translations.ts`,
`i18n-keys.spec.ts` green) · leaks no personal data into git · and passes the 8-question decision
filter in ROADMAP §1.

---

## 6. Git workflow (when & how to commit)

Repo is **private** until the job change, then public. Use small, frequent, meaningful commits -
they read as engineering discipline in the public history later.

**Branching**

- `main` - always builds and runs. Never commit broken code here.
- One branch per phase/feature: `phase-1/data-spine`, `feat/scoring-screen`, `feat/kanban`, etc.
- Merge to `main` via PR (even solo - good habit + clean history for the portfolio).

**Commit rhythm - commit at each meaningful checkpoint, not once per phase:**

- After scaffolding compiles/runs.
- After each table+migration set works.
- After each Tauri command + its `DbService` wrapper round-trips.
- After each screen matches the design and is wired.
- After tokens are extracted into `libs/ui`.
- Before AND after any risky change (so you can revert cleanly).

**Conventional Commits** (matches your `commit-coach` habit):
`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `style:`, `test:`.
Example: `feat(db): add profile + settings tables with sqlx migrations`.

**Push cadence:** push the phase branch to GitHub at the end of every working session - your local-only
DB is git-ignored, so pushing is safe and gives you an off-machine backup of the code.

**Tag releases** when an installable build exists: `v0.1.0` (first internal build), `v0.x` through MVP.
Tags trigger the GitHub Actions build + signed Release (Phase 4).

**Never commit:** real `profile.md`, any `*.sqlite`/WAL/SHM file, API keys, `.env`, build outputs,
`target/`, `node_modules/`. Verify `.gitignore` covers these before the first push.

---

## 7. Quality gates (set up before Phase 2; tests grow over time)

Philosophy: **CI is always strict** (a lenient CI is decorative). **Local hooks are smart** - they
auto-fix what they can and only block on real errors, so committing stays low-friction.

**Local pre-commit (Husky + lint-staged, scoped to changed files):**

- **Format** (Prettier / `cargo fmt`) - auto-fixes on commit. No prompt, no block.
- **Lint** (ESLint / `cargo clippy`) - blocks on **errors** only; warnings pass. Run on `nx affected` / staged files for speed.
- **Commit message** (commitlint) - strict Conventional Commits; rewrite the message if it fails.
- **No tests in pre-commit** - too slow; they belong in CI. Keep the hook fast or it gets bypassed.
- **No full Tauri build in pre-commit** - `clippy`/`fmt` only; the heavy build runs in CI.

**CI (GitHub Actions, on every push + PR) - strict, blocks merge:**

- `nx affected` → lint → test → build for affected projects.
- A green check is required to merge the PR.
- Separate release workflow (Phase 4): Tauri build for 3 OSes on tag push.

**Tests:** infrastructure now, coverage grows by phase. Add unit tests alongside real logic as it
lands (hashing, cache hit/miss, hard-filter rules, parsing, status-history writes). They then run
automatically in CI.

---

## 8. Versioning & changelog (do this on every shippable change)

**Version scheme.** Applye is pre-1.0 during private development. Stay on the `0.x` line until the
first public release (after the job change), which becomes `1.0.0`. On `0.x`: a new feature bumps the
**minor** (`0.2.0` → `0.3.0`); a bug fix bumps the **patch** (`0.3.0` → `0.3.1`). The single source of
truth is the version in `package.json` - keep `tauri.conf.json` and `Cargo.toml` in sync with it.

**On every feature/fix that ships (merged to `main`), do all three - never skip:**

1. **Determine today's real date** (don't guess - check the system date) and update `CHANGELOG.md`:
   move the relevant `[Unreleased]` notes under a new `## [0.X.Y] - YYYY-MM-DD` heading, grouped
   Added / Changed / Fixed. Write human-facing one-liners, newest on top.
2. **Bump the version** in `package.json`, `tauri.conf.json`, `Cargo.toml` (all three in sync).
3. **The `/releases` page on the site reads from `CHANGELOG.md`** - so updating the changelog updates
   the public timeline automatically. Don't maintain release notes in two places.

This is part of "done" for any shippable change - a feature isn't finished until the changelog entry
and version bump exist. (Later this can be automated with release-please/standard-version reading the
Conventional Commits, but while solo and private, do it explicitly so it never drifts.)
