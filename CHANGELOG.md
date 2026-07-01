# Changelog

All notable changes to Applye are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Applye is pre-1.0, so it follows `0.x` versioning: while on `0.x`, the minor
number covers new capability and the patch number covers fixes and release
plumbing. The version in `package.json`, `Cargo.toml`, and `tauri.conf.json`
is the single source of truth; this file tracks what changed at each tag.

## [Unreleased]

## [0.12.4] - 2026-07-02

### Fixed

- Topbar title showed static "Applye" on every page. `ShellLayoutComponent`
  now maps the active route's top-level segment to its `nav.*` i18n key
  (Dashboard / Discover / My Jobs / Pipeline / Interview Prep / Job Tracker /
  Analytics / Settings / Documents / Profile) via router `NavigationEnd`.
- Native window title bar duplicated the app name above the sidebar's own
  "Applye" wordmark. Cleared the Tauri window title.
- Native title bar was a fixed OS color that didn't follow the app's
  dark/light theme, breaking the sidebar's background at the top edge of
  the window. macOS now runs with `titleBarStyle: "Overlay"` +
  `hiddenTitle` (no-op on Windows/Linux, which keep the native frame), so
  the sidebar background shows through behind the traffic lights. Added
  `data-tauri-drag-region` to the sidebar header and topbar so the window
  stays draggable, and reserved left padding for the traffic-light cluster
  on macOS only.

## [0.12.3] - 2026-07-02

### Fixed

- Sidebar header and main topbar had mismatched height/padding, so their bottom
  border lines didn't align at the seam. Introduced a shared `--app-header-h`
  token in `libs/ui/tokens.css` and applied identical height + zero vertical
  padding to both `.sidebar__logo` and `.topbar` in `shell-layout.component.scss`
  — the two divider lines now meet exactly.

### Changed

- Replaced the plain-text "Applye" sidebar wordmark with the same SVG mark used
  on the applye.dev site (indigo accent, `currentColor` + token-driven fill).
  Canonical SVG now lives in `libs/ui/assets/applye-mark.svg`, wired into the
  desktop build via a new `assets` glob in `apps/desktop/project.json`.

## [0.12.2] - 2026-07-02

### Fixed

- **PR #22 (v0.12.1) fixed the wrong file.** `TranslateService` reads from
  `libs/i18n/src/lib/translations/translations.ts` (a hand-maintained
  nested TS object) — the `en.json`/`de.json`/etc. files in that same
  folder are dead, unimported by anything at runtime. All i18n work across
  Phases 6.5–6.7 and the previous "fix" edited only the dead JSON files,
  so none of it ever reached the running app. This release makes the same
  50 additions (portal answers, follow-up cadence, health check, archetype
  hints, import-tracklist strings, nav labels, etc.) directly in
  `translations.ts` for both `en` and `de` (`ru`/`es`/`fr`/`uk` inherit
  automatically via the existing `stub(en, …)` pattern), and **deletes the
  6 dead JSON files** so this mistake can't recur.
- `apps/desktop/src/i18n-keys.spec.ts` now imports `TRANSLATIONS` from
  `@applye/i18n` (newly exported from the package barrel) instead of
  reading `en.json`, so it actually gates the real runtime source. Added a
  second guard asserting `TRANSLATIONS.de` has the same key set as `en` —
  no silent drift between the two fully-maintained locales.

## [0.12.1] - 2026-07-01

### Fixed

- **21 missing i18n keys** (EN + DE) that rendered as raw dotted strings
  (e.g. `jobs.mark_applied`) instead of real text: 18 pre-existing gaps in
  Job Detail (Mark as Applied, Add to Pipeline, Export DOCX/PDF, Score/
  Re-score, Start over, etc.) and My Jobs (table columns, search/filter
  labels, paste-job modal), plus 3 nav sidebar labels (Discover, Tracker,
  Analytics). None of these were introduced by Phases 6.5–6.7 — a full
  scan turned up debt going back further.
- Fixed `apps/desktop/src/app/app.spec.ts`, which imported a nonexistent
  `./nx-welcome` module and could never run — this silently meant `nx test
desktop` (the CI test target for this project) always failed regardless
  of what else was true, so no test suite in this project could ever gate
  a merge. Replaced with a minimal smoke test.

### Added

- `apps/desktop/src/i18n-keys.spec.ts` — a fast, deterministic guard test
  that scans every `.ts`/`.html` file under `apps/desktop/src/app` for
  `t()('namespace.key')`-shaped references (including the dynamic/ternary
  call sites) and fails if any resolved namespace key is absent from
  `en.json`. Runs as part of `nx test desktop`, so a missing key now fails
  the build instead of silently rendering as a raw string.

## [0.12.0] - 2026-07-01

### Added

- **First-launch health check (Phase 6.7).** A deterministic, 0-token
  diagnostics report — OS keychain key presence (never a network call),
  SQLite read/write, the sqlx migration ledger, bundled Tauri capabilities,
  and export-folder writability — shown once on first launch and re-runnable
  any time from Settings. Gated by `settings.health_check_seen`, persisted in
  SQLite (not localStorage), so it survives across windows/profiles.
- A failing or warning check never blocks the user — "Continue" is always
  available, in line with the augmentation principle. Whether a stored API
  key actually _works_ stays a separate, explicitly user-triggered action
  (Settings' existing "Test connection") — the health report only ever says
  "stored" or "not stored yet", never "valid".

## [0.11.0] - 2026-07-01

### Added

- **Follow-up dates + overdue badges (Phase 6.6).** Moving an application
  into `applied` or `interview` (via kanban drag or "Mark as Applied") now
  (re)computes `follow_up_at` deterministically in SQL from the settings
  cadence (`followup_days_after_apply` / `followup_days_after_interview`,
  default 7/5 days) — 0 AI tokens, computed in the same transaction as the
  `status_history` write. Terminal statuses (`offer`/`rejected`) leave
  `follow_up_at` untouched. A manually-edited follow-up date is never
  silently recomputed — only a fresh status transition touches it.
- Pipeline kanban cards show an amber "Overdue" badge once `follow_up_at`
  has passed, computed in the same SQL query as the rest of the card (no
  extra round trip).
- Settings now exposes both cadence values ("Days after applying" / "Days
  after interview") under a new "Follow-up reminders" section.

## [0.10.0] - 2026-07-01

### Added

- **Portal answer drafting (Phase 6.5).** A collapsible "Draft portal
  answers" section in Job Detail drafts answers to a job portal's
  open-ended questions ("Why this role?", "Why this company?", ...) from
  the user's compact scoring profile and the job description. One AI call
  (`portal-answers.md`, quality model) per question set; result is cached
  in `portal_answers` by `(job_id, profile_hash, input_hash)` where
  `input_hash` covers the question set + language + model, so re-opening
  the job with the same questions is a 0-token read.
- Editable question templates (add/remove), an answer-language selector
  defaulting to the application's `doc_language`, and per-answer editable
  boxes with a copy-to-clipboard button. "Another version" re-drafts a
  single answer with a fresh AI call, cached under its own key.
- Augmentation guarantee: Applye only ever drafts and caches text here —
  there is no code path that transmits or submits an answer anywhere. The
  user copies it and pastes it into the portal themselves.

## [0.9.0] - 2026-07-01

### Added

- **Import tracklist (Phase 6.4).** "Import file" in My Jobs picks a CSV,
  XLSX, JSON, or plain-text export from another job tracker via the native
  file dialog. One AI call (`import-tracklist.md`, economy model) detects
  the column structure and extracts rows — status normalization, dedupe,
  and the insert are all deterministic Rust + SQL, 0 tokens. XLSX is read
  with `calamine` (converted to CSV-like text for the AI call); CSV/JSON/
  text are forwarded as raw text.
- Preview shows a per-row checkbox table before anything is written:
  status strings ("Submitted", "Screening", "Declined", ...) normalized to
  saved/applied/interview/offer/rejected; rows matching an existing job by
  lower(company)+lower(role) are flagged as already-existing; rows the
  skill couldn't use (e.g. missing company) are listed with a reason.
  Nothing is inserted until the user confirms.
- Confirm inserts a `jobs` row (plus an `applications` row carrying the
  normalized status) per selected row, tagging `imported_from` as
  `import_csv` / `import_xlsx` / `import_json` / `import_text`. Duplicates
  are re-checked at insert time — re-importing the same file adds nothing
  twice.

## [0.8.0] - 2026-07-01

### Added

- **Before-you-submit notes (Phase 6.3).** The `job-scoring.md` skill now
  also returns `before_you_submit`: 2-4 short, concrete reminders grounded in
  the job's JD and Phase 6.2 legitimacy notes (e.g. "Salary not listed —
  research market rate before applying"). Produced in the same `ai_run` call
  as the score — no second request, 0 extra tokens. Stored in
  `scoring_cache.before_you_submit_json`, part of the existing cache key
  (job, profile, JD hash, language, model), so reopening a scored job shows
  the notes at 0 tokens. Job Detail renders them as a collapsible checklist
  directly under the score section; hidden when empty.

## [0.7.0] - 2026-07-01

### Added

- **Legitimacy check (Phase 6.2).** Deterministic, 0-token Rust pattern
  matching runs in the paste pipeline after the hard filter, before any AI
  scoring: green/yellow/red tier plus human-readable notes, stored on the
  job row. Yellow triggers: no salary mentioned, "wear many hats" with no
  team size, posting over 90 days old, vague "other duties as
  assigned/required" scope. Red triggers: no company name (or conflicting
  company mentions), application directed to a personal email domain
  (gmail/hotmail/yahoo/outlook.com), an implausibly wide salary range, or
  the same JD template already saved under a different company.
  Augmentation, not a gate — a red job can still be scored and tailored if
  the user chooses; My Jobs shows a badge (none/amber/red) and Job Detail
  shows the triggered notes plus a non-blocking warning banner for red.

## [0.6.0] - 2026-06-30

### Added

- **Navigation restructure (Phase 5).** The sidebar is reorganised into
  Dashboard, Discover (stub), My Jobs, Pipeline, Interview Prep (stub),
  Job Tracker, Analytics (stub), and Settings.
- **My Jobs** (`/jobs`): the full job database as a sortable, filterable,
  searchable table (Company, Role, Score, Status, Legitimacy, Date Added,
  Source) over a new read-only query, with a paste-job modal.
- **Job Detail** (`/jobs/:id`): the existing scoring and 3-pass tailoring
  wizard, now opened per job (cached score shown, 0 tokens on open), with
  Add to Pipeline and Mark as Applied actions.
- **Job Tracker** (`/tracker`): the Agentur fuer Arbeit "Eigenbemuehungen"
  report. A table over applications + jobs + status history with date-range
  and status filters, a summary footer (total, response rate, avg days to
  response), and PDF / Excel(CSV) export.

### Changed

- **Pipeline** now shows only active applications (applied, interview, offer,
  rejected); saved jobs live in My Jobs. A job enters the board via Add to
  Pipeline / Mark Applied.

## [0.5.0] - 2026-06-30

### Added

- **DeepSeek provider** (API mode). A new OpenAI-compatible request path in
  `ai/api.rs` routes the `deepseek` provider to `api.deepseek.com`, with the
  Anthropic path untouched. Models `deepseek-v4-pro` (quality) and
  `deepseek-v4-flash` (economy), selectable in Settings; the API key is stored
  per provider in the OS keychain, never in the database or logs.

### Security

- **Privacy disclosure for DeepSeek.** Settings shows a clear note that DeepSeek
  is a China-based cloud provider and that, in API mode, the job description and
  profile text are sent to its servers. AI remains opt-in; on-device users can
  pick another provider.

## [0.4.0] - 2026-06-30

### Added

- **applye.dev website** (`apps/web`): static landing page, three-zone
  documentation, a methodology page explaining the recruiter check, a blog
  placeholder, and this changelog, all on the shared design tokens.
- Lucide icon set across the desktop shell navigation and page components.
- **Schema sync (Phase 4.5):** additive migration
  `0006_career_ops_features.sql` reconciling the live SQLite schema with
  ROADMAP §12. New columns on `profile`, `jobs`, `scoring_cache`,
  `settings`, `sources`, and `company_research`, plus two new cache tables
  (`portal_answers`, `pattern_analysis`). Purely additive: existing
  dogfooding data is preserved. Rust, `libs/core`, and `libs/data` types
  synced; no feature logic yet.

### Changed

- Disabled GitHub Actions workflows while the repository is private.

## [0.3.1] - 2026-06-29

### Added

- Multi-OS release pipeline (tauri-action) with Tauri auto-updater wiring.
- Internationalization: English and German translations, plus empty, loading,
  and error states across the UI.
- Public README and an architecture overview in `docs/`.

### Changed

- Locked the DOCX and PDF export dependencies.

### Security

- Configured the updater signing public key in `tauri.conf.json`.

## [0.3.0] - 2026-06-28

The version moved from `0.1.0` straight to `0.3.0`; `0.2.0` was never tagged.

### Added

- AI spine: `ai_run` abstraction, skill-file loader, OS keyring for secrets,
  and the Settings screen.
- Rich profile editor with a compressed scoring profile and a default pitch.
- Paste-a-job scoring with a deterministic hard filter and a hash cache.
- Three-pass CV tailoring wizard with DOCX and PDF export.
- Pipeline kanban (Angular CDK) with automatic status history.
- Design tokens and the application shell.
- Quality gates: git hooks and CI.

### Fixed

- Pipeline loading and error state converted to signals for zoneless change
  detection.

## [0.1.0] - 2026-06-27

### Added

- Phase 1 data spine: SQLite schema, Tauri commands, and the profile vertical
  slice.

[Unreleased]: https://github.com/vitala89/applye/compare/v0.12.4...HEAD
[0.12.4]: https://github.com/vitala89/applye/compare/v0.12.3...v0.12.4
[0.12.3]: https://github.com/vitala89/applye/compare/v0.12.2...v0.12.3
[0.12.2]: https://github.com/vitala89/applye/compare/v0.12.1...v0.12.2
[0.12.1]: https://github.com/vitala89/applye/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/vitala89/applye/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/vitala89/applye/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/vitala89/applye/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/vitala89/applye/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/vitala89/applye/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/vitala89/applye/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/vitala89/applye/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/vitala89/applye/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/vitala89/applye/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/vitala89/applye/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/vitala89/applye/compare/v0.1.0...v0.3.0
[0.1.0]: https://github.com/vitala89/applye/releases/tag/v0.1.0
