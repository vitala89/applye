# Feature Brief: Documents — CV & Cover Letter Library (Step 1)

- **Status**: `shipped` (1a v0.20.0 PR #51; 1b + 1d v0.21.0 PR #52 — 1d folded into 1b's branch at the user's request, out of sequential order; 1c v0.22.0 PR #53. All four sub-phases complete). Extended beyond the original brief by two follow-on efforts on `feat/cv-default-template`: **Phase 1 + Wave A** (default-template ATS layout fix + blocker fixes: guaranteed `personal_details`, add/remove entries, import token-cap fix, profile↔CV field propagation — PR #59) and **Wave B** (per-section style constructor: font/size/colour/weight per section with inheritance + reset-to-common, new weight control, editor shell reconciled to design mock — PR #60). Specs/plans for both in `docs/superpowers/specs/` and `docs/superpowers/plans/`.
- **Source**: Real-world dogfooding gap (German Agentur für Arbeit requires a local-market
  Lebenslauf/Anschreiben). `FEATURE_INDEX.md` top Planned item.
- **Roadmap**: §16 (full spec), §12 (DDL), §13 v2 build order #13.

> **This is an XL feature. It is split into four sequential sub-briefs (1a → 1d). The FIRST agent
> task is 1a (data layer) only. Do not start 1b–1d until 1a is merged.** Each sub-phase is its own
> branch and PR.

---

## Overview

### Problem

The user needs reusable, market-tuned CVs and cover letters (Germany first, then US/UK/generic),
built once and reused across applications. The `Documents` sidebar item currently renders as a stub.
The tailoring wizard always starts from raw `profile.md` instead of a market baseline document.

### User Value

A dedicated **Documents** library: import an existing CV, generate a market baseline from the profile,
construct/reorder sections, block-model cover letters with live preview, deterministic ATS/readability
safety notes, and `.tex` source export. The human arranges, edits, chooses, exports; AI only drafts
section/paragraph content on demand (cached). Nothing auto-submitted — passes the 8-point filter.

---

## Scope

### In Scope (whole feature, delivered across 1a–1d)

- **1a — Data layer.** Migration `0011_documents_library.sql`: `document_library` + `cv_templates`
  tables per §12 DDL, plus `applications.cv_document_id` / `cover_letter_document_id` (nullable FKs).
  Built-in `cv_templates` seed rows (DE-traditional, DE-ATS-modern, US, UK, generic). Rust + `libs/core`
  - `libs/data` types. No UI yet.
- **1b — CV module.** Documents sidebar (real, not stub) with `CV | Cover Letter` tabs; CV list + detail.
  Import own CV (DOCX/PDF → `cv-import.md`, cached by file hash) → preview/fix → save editable doc.
  Generate baseline from profile + `scoring_json` + template → `cv-generate-baseline.md`. Constructor:
  CDK drag-and-drop section reorder + field toggles with non-blocking ATS-risk note. Per-section
  regenerate (cache by section hash).
- **1c — Cover Letter module.** Block model (fixed order): address, date, subject/Betreff, greeting,
  body paragraphs (array), closing, signature. Split editor: left block editor with per-block
  "Regenerate with AI", right live preview in real export layout. `cover-letter-generate.md` fills
  blocks; `cover-letter-tailor.md` (light single-pass) rewrites only body paragraphs from Job Detail.
  New visual pattern → build via Claude Design.
- **1d — Style/ATS safety + export.** `document_library.style_json` (font/size/accent). Rust
  `check_style_safety(style_json) -> Vec<StyleNote>` — curated ATS-safe font list, size range, colour
  contrast/print-safety. Two honest note types: ATS-parsing risk (font) vs readability/print risk
  (colour). Safe default on new docs. `.tex` export (generate clean `.tex` from `content_json`, never
  compile — no TeX toolchain bundled). Filename convention from market conventions.

### Out of Scope

- User-authored templates marketplace, RAG, plugins (vision-horizon §13).
- Compiling LaTeX (source export only).
- Auto-submitting or emailing any document.
- Mutating `applications.cv_path` / `cover_letter_path` — those stay the **frozen apply-time snapshot**
  (critical for Agentur report accuracy); the new `*_document_id` FKs only record which library doc was
  used.

---

## Execution Plan

### Acceptance Criteria

**1a (first agent task):**

- [ ] `0011_documents_library.sql` creates `document_library` + `cv_templates` exactly per §12 DDL.
- [ ] `applications.cv_document_id` + `cover_letter_document_id` added as nullable FKs (additive).
- [ ] Built-in `cv_templates` rows seeded (DE-traditional/photo, DE-ATS-modern/no-photo, US, UK, generic).
- [ ] `libs/core` + `libs/data` types mirror the new tables; Rust structs + basic CRUD commands compile.
- [ ] `nx build desktop` passes. Existing dogfooding data preserved (additive-only, no applied migration edited).
- [ ] No UI change in 1a.

**1b–1d:** acceptance defined in follow-on sub-briefs once 1a lands (kept out of the first handoff to
avoid scope bleed).

### AIF Routing

- **1a:** `aif-architecture-planner` (schema fit vs §12), `aif-feature-builder` (migration + types),
  `aif-privacy-review` (snapshot vs library-doc separation), `aif-testing-strategy` (migration/round-trip),
  `aif-branch-finisher`.
- **1b–1c:** `aif-feature-builder` + Claude Design (cover-letter split editor is a new visual pattern).
- **1d:** `aif-feature-builder` + `aif-security-review` (font/style list is deterministic Rust, no AI).

### Expected Files (1a only)

- `apps/desktop/src-tauri/migrations/0011_documents_library.sql` (new).
- Rust models + commands for `document_library` / `cv_templates` (mirror existing table modules).
- `libs/core/src/...` domain types (`DocumentLibraryItem`, `CvTemplate`).
- `libs/data/src/...` data-layer types/queries.
- **No i18n, no components in 1a.**

New skill files (1b–1c, NOT 1a): `libs/skills/src/cv-import/cv-import.md`,
`cv-generate-baseline/cv-generate-baseline.md`, and cover-letter generate/tailor skills. NOTE: a
`cover-letter/` skill already exists (v-earlier) and `resume-tailoring/` stays untouched — the new
skills are distinct (baseline/market vs job-specific).

---

## Architectural & Integration Impact

### Data / Migration Impact

Migration `0011_documents_library.sql` — Follow-up Drafting shipped first and claimed `0010`
(`0010_followup_drafts.sql`), so this is the next-free number as of v0.19.0. Two new tables + two
additive columns on `applications`. Purely additive. `document_library` is the live editable library;
`generated_docs` stays the export journal — do not merge them.

### Privacy / Security Impact

All local. Import parses an uploaded file via one cached AI call (same `ai_run` path). No off-device
storage. The frozen-snapshot vs library-doc separation must be preserved so a later library edit never
rewrites what was actually submitted (Agentur accuracy). Nothing auto-submitted.

### i18n Impact

Large in 1b–1d (Documents nav, tabs, list/detail, constructor, block editor, style notes, export).
EN + DE in `translations.ts` (the JSON files are dead — deleted in v0.12.2). **1a introduces no strings.**

### Token / AI Impact

- Import: 1 call, cached by file hash. Baseline generate: 1 call. Per-section / per-block regenerate:
  cache by section/block hash (cheap, targeted). Cover-letter tailor: light single-pass, body only —
  cheaper than the full CV XYZ→critique→build wizard.
- Style/ATS safety and layout/order are deterministic Rust — **0 tokens**.

---

## Verification & Documentation

### Testing Plan (1a)

- Migration applies cleanly on a copy of the dev DB; existing rows intact.
- Round-trip test: insert/read a `document_library` row and a `cv_template` row via the new commands.
- `nx build desktop` + `nx lint` pass.

### Live Verification Plan (1a)

Minimal — migration runs on app launch, health check still green, no UI regression. Full live
verification begins in 1b when the Documents screen becomes real.

### Docs to Update

CHANGELOG `[Unreleased]` (per sub-phase), FEATURE_INDEX (Documents → In-Progress at 1a start),
CURRENT_STATE, and ROADMAP §12 migration-order note (confirm 0011 landed).

### Changelog Draft (1a)

> **Documents library — data layer.** Additive migration `0011_documents_library.sql` adds
> `document_library` and `cv_templates` (per ROADMAP §12) plus nullable
> `applications.cv_document_id` / `cover_letter_document_id`, with built-in CV templates seeded
> (DE-traditional, DE-ATS-modern, US, UK, generic). Rust and `libs/core`/`libs/data` types synced.
> No feature UI yet — schema foundation for the CV & Cover Letter library.

---

## Release Planning

### Commit / PR Plan

One branch + PR per sub-phase: `feat/documents-data-layer` (1a), then `feat/documents-cv` (1b),
`feat/documents-cover-letter` (1c), `feat/documents-style-export` (1d). Each with CHANGELOG + version
bump. 1a is a minor bump (new schema capability, no user-visible behavior).

### Open Questions

- Exact `content_json` shape for CV sections vs cover-letter blocks — lock in 1a as typed structs so
  1b/1c build against a stable contract.
- Which built-in templates ship first vs. later.
- ~~0010 migration number coordination with Follow-up Drafting~~ — resolved: Follow-up Drafting
  shipped first and claimed `0010`; this feature uses `0011`.

### Decision

Ship after Step 0 and Follow-up Drafting. Start with **1a data layer only**; hand 1b–1d as separate
briefs once 1a is merged. Never hand the whole XL feature to one agent in one branch.
