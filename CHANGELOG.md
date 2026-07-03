# Changelog

All notable changes to Applye are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Applye is pre-1.0, so it follows `0.x` versioning: while on `0.x`, the minor
number covers new capability and the patch number covers fixes and release
plumbing. The version in `package.json`, `Cargo.toml`, and `tauri.conf.json`
is the single source of truth; this file tracks what changed at each tag.

## [Unreleased]

## [0.16.1] - 2026-07-03

### Changed

- **Settings polish** — buttons now use the shared design-system variants
  (`btn--primary`/`secondary`/`ghost`/`danger`) instead of page-local CSS:
  Save settings and Send a test prompt are primary, Replace/Save key is
  secondary, Remove is a new `btn--danger` variant, and the health panel's
  Re-run check moved off a stray `btn-ghost` class onto the shared one.
  Added the `danger` variant to `ButtonDirective` and `.btn--danger` to
  `libs/ui/src/styles/global.scss`, token-driven via `--danger`/`--danger-tint`.
- Replaced remaining hardcoded Settings copy with i18n keys (EN+DE): model
  labels, API key actions, the Test connection section/button, and the
  "Test tier" toggle, renamed to "Test connection uses" with a one-line
  helper explaining what it controls.
- Restyled `<select>`/`<input>` controls in Settings with hover/focus states
  and a token-only CSS chevron (no image asset) for visual consistency with
  the rest of the app.

## [0.16.0] - 2026-07-03

### Added

- **Interview Prep is real** — fills the sidebar stub. `interview_stages`
  already existed in the schema (migration `0001`) with no `CHECK`
  constraint on `status`, so the full lifecycle (`scheduled` /
  `awaiting_scheduling` / `awaiting_response` / `passed` / `rejected` /
  `cancelled`) needed no new migration, just an app-level enum. `stage_type`
  gains an explicit `other` fallback.
  - List (`/interview-prep`): every application with ≥1 stage, current
    stage + status badge + next date, soonest-upcoming first — reads the
    same `db_pipeline_cards` join the Pipeline board uses, no new command.
  - Detail (`/interview-prep/:applicationId`): full CRUD — add (type +
    required free-text label + date/language/interviewer/notes), inline
    status change, edit, delete, move up/down via adjacent `stage_order`
    swaps. Not a fixed template: any number of stages, any order, any
    wording.
  - New commands: `create_interview_stage`, `update_interview_stage`
    (partial patch), `delete_interview_stage`, `list_interview_stages`.
  - **Rejection sync, not a new status path**: `update_interview_stage`
    reuses the same `db_set_application_status_core` drag-and-drop and the
    quick-view modal already call — whenever a stage's status becomes
    `rejected` (at ANY stage position, not just the last one), the parent
    application moves to `rejected` and `status_history` gets a new row.
    `cancelled` never triggers this.
  - Pipeline card footer on INTERVIEW-column cards now shows "Stage N ·
    &lt;label&gt;" with a small subordinate status dot — deliberately not a
    third color badge next to the legitimacy tier and priority flag.
  - Quick-view modal: read-only "Interview stage" row + "View all stages"
    link, **except** right after a transition into `interview` with 0
    existing stages, when a skippable quick-add mini form appears instead
    (fires at most once per application). The same modal is reused for the
    drag-and-drop trigger — dragging a card into INTERVIEW opens it
    pre-focused on the mini form instead of building a second popover.

## [0.15.0] - 2026-07-02

### Added

- **Pipeline quick-view modal.** Clicking a Pipeline card (drag still works
  unchanged — CDK's own drag-threshold keeps the two separate) opens a fast
  triage modal: status dropdown, priority flag (none/low/medium/high), an
  oldest→newest comment thread, and an "Open full details" link to
  `/jobs/:id`. The modal is deliberately shallow — no score, JD, tailoring,
  or portal-answers content, that stays on the full Job Detail screen.
  - Status changes go through the _same_ `db_set_application_status`
    command the kanban drag-and-drop already used — no second status-update
    path, so `status_history` is written identically either way.
  - New additive migration `0009_pipeline_priority_comments.sql` adds
    `applications.priority` and a new `application_comments` table. Any
    existing non-empty `applications.notes` is copied in as that
    application's first comment during migration; the `notes` column is
    left in place as legacy, never dropped.
  - New commands `set_application_priority`, `add_application_comment`,
    `list_application_comments`.
  - The priority flag renders as an outlined flag icon (blue/amber/red for
    low/medium/high) — deliberately distinct from the existing green/
    yellow/red legitimacy-tier badge so the two are never confused on the
    same card. It also shows in the card's top-right corner on the board
    itself, not just inside the modal.

## [0.14.0] - 2026-07-02

### Added

- **Job Tracker now matches the user's real xlsx tracker 1:1 (19 fields).**
  New additive migration `0008_tracker_fields.sql` adds `jobs.tech_stack` and
  `applications.source_url` / `contact_name` / `contact_role` /
  `contact_channel` / `next_action` / `next_action_at` / `salary_range` —
  purely `ALTER TABLE ADD COLUMN`, dogfooding data preserved.
  - Tracker screen shows all 19 fields (company, role, tech stack,
    location, source link, contact name/role/email-or-LinkedIn, outreach
    type, sent-on, interview #1, follow-up #2, status, next action + date,
    salary range, contract type, Blue Card threshold, EOR provider, notes)
    with per-column show/hide and horizontal scroll.
  - Inline-edit for contact, next action, salary range, and notes — a
    dedicated `db_update_application_tracker_fields` patch command touches
    only those 7 columns so it never clobbers `cv_path` /
    `cover_letter_path` / `application_method` on save.
  - The Agentur für Arbeit PDF/Excel export now states the applicant name
    and generated date and adds a contact column to the official layout
    (period, applicant, date, table of date/company/position/method/
    status/contact) — 0 tokens, unchanged.
  - The `import-tracklist` skill and Rust import pipeline now detect and
    round-trip all 8 new columns from an imported xlsx/csv into the right
    place.

## [0.13.1] - 2026-07-02

### Changed

- **My Jobs controls now use the shared design system.** Added a token-driven
  `[libButton]` directive in `libs/ui` (`primary`/`secondary`/`ghost`
  variants, `sm`/`md` sizes). The top-bar "+ Paste Job" button is now
  primary and "Import file" is secondary, both with matched icon size and
  spacing. The status/legitimacy/score filter controls were normalized to
  share height, border, radius, focus ring, and placeholder color with the
  search input — verified in both light and dark themes.

## [0.13.0] - 2026-07-02

### Added

- **"+ Paste Job" is now functional**, wired to both the topbar and My Jobs
  buttons via a single shared modal with two tabs:
  - **Paste text** — pastes straight into the existing pipeline (Rust parse
    - hard filter + legitimacy check + cache check; AI recruiter score/ATS
      run from the job detail page as before). No duplicated logic.
  - **From link** — a URL is classified server-side by `classify_job_url`
    against a legal-first allowlist (open/ATS/RSS sources only:
    `boards-api.greenhouse.io`, `api.lever.co`, `api.ashbyhq.com`,
    `*.jobs.personio.de`, `remotive.com`, `weworkremotely.com`). Allowed
    URLs are fetched via `fetch_job_from_url` (public JSON/RSS APIs only)
    and flow into the same pipeline. Closed boards (LinkedIn, Indeed,
    StepStone, Glassdoor) and any unrecognized domain are never fetched —
    the app only ever opens them in the browser via `tauri-plugin-opener`,
    shows a warning naming the board, and switches to the Paste text tab.
  - A clipboard helper (`tauri-plugin-clipboard-manager`, read-only) offers
    to fill the textarea when the clipboard holds a long, job-shaped text
    block after the user copies it themselves — 0 tokens, never reads a
    browser tab, never auto-submits.
  - All new copy ships in English and German.

## [0.12.5] - 2026-07-02

### Fixed

- Removed the per-page title heading duplicating the topbar's active-route
  title on all 9 remaining pages (Dashboard, Discover, Interview Prep, Job
  Tracker, Documents, Analytics, Settings, Profile, My Jobs) — kept each
  page's description/actions, cleaned up the CSS that only styled the
  removed headings.
- Sidebar logo on macOS previously sat beside the traffic lights on the
  same row, misaligned with the nav icons below. Now sits on its own row
  below the traffic-light cluster, left-aligned flush with the nav.
- `data-tauri-drag-region` wasn't set on the sidebar logo-mark SVG (the
  attribute isn't inherited by children), leaving a small non-draggable
  gap in the header. Added it so the full header row is draggable.

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

[Unreleased]: https://github.com/vitala89/applye/compare/v0.16.1...HEAD
[0.16.1]: https://github.com/vitala89/applye/compare/v0.16.0...v0.16.1
[0.16.0]: https://github.com/vitala89/applye/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/vitala89/applye/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/vitala89/applye/compare/v0.13.1...v0.14.0
[0.13.1]: https://github.com/vitala89/applye/compare/v0.13.0...v0.13.1
[0.13.0]: https://github.com/vitala89/applye/compare/v0.12.5...v0.13.0
[0.12.5]: https://github.com/vitala89/applye/compare/v0.12.4...v0.12.5
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
