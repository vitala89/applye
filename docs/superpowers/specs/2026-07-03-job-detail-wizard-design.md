# Job Detail Redesign — Card Scoring View + Apply/Tailor Wizard

Date: 2026-07-03
Branch: `feat/job-detail-wizard`
Status: Approved

## Problem

`jobs.component.ts` (apps/desktop/src/app/pages/jobs/jobs.component.ts, 1765 lines) renders the
whole paste → score → portal-answers → tailor → export → apply flow as one long vertical scroll
with ad-hoc CSS classes (`.wizard-step--active`, `.score`, `.minscore`). No reusable gauge, card,
or stepper primitives exist in `libs/ui`. This is a presentation refactor only — no backend, DB,
or AI-call changes.

## Goals

1. Replace the long scroll with a card-based scoring view once `scoring_cache` exists for the job.
2. Replace the linear tailor/apply flow with a 5-step wizard, one step visible at a time.
3. Reuse all existing Tauri commands / `DbService` methods unchanged. No new AI calls, no new
   migrations, no new Rust commands.
4. Preserve caching: scoring view must render entirely from the existing `scoreCacheGet` result
   ("cached · 0 tokens" chip stays).
5. All strings via `libs/i18n` (EN+DE). Light + dark theme support (existing tokens only).
6. Nothing auto-submits — augmentation principle holds; wizard step 5 is copy + open-browser +
   manual "Mark Applied", never an auto-apply action.

## Non-goals

- No new scoring dimensions, no rubric changes.
- No portal-answers or tailoring pipeline logic changes — UI wrapper only.
- No mobile layout work (desktop app only).
- No Rust/DB schema changes.

## Architecture

### New `libs/ui` primitives

**`score-gauge`** (`libs/ui/src/lib/score-gauge/`)

- Inputs: `score: number` (0-100), `verdict: string`, `cached: boolean`.
- Renders an arc gauge (SVG, token-driven colors: success/warn/danger bands by score range) +
  verdict text + a static "cached · 0 tokens" chip when `cached` is true.
- No internal state, no signals beyond inputs — pure presentation.

**`stepper`** (`libs/ui/src/lib/stepper/`)

- Inputs: `steps: {label: string}[]`, `activeIndex: number`.
- Outputs: `back`, `next` (emitted on button click; parent owns step index and validation).
- Renders progress dots/labels + Back/Next buttons (using existing `appButton` directive).
  Next is disabled via an `nextDisabled: boolean` input the parent controls (e.g. wizard step 2
  isn't blocking, so always enabled; no hidden validation logic inside the stepper itself).

Both are standalone Angular components, styled from `libs/ui` design tokens only (no hardcoded
colors/spacing), each get a `.spec.ts` smoke test (renders, emits).

### Scoring view (`apps/desktop/src/app/pages/jobs/scoring-view.component.ts`)

Pure presentational component. Input: `cache: ScoringCache`. Renders:

- Header card: `score-gauge` + verdict + cache chip.
- Dimension cards grid: one card per `cache.dimensions[]` entry — bar (width = dimension score%)
  - short rationale text.
- Missing-keyword chips: `cache.missingKeywords[]` rendered as chip row.
- Red-flags card: list from `cache.redFlags[]`.
- ATS card: pass/fail state from `cache.atsPass` + notes.
- Before-you-submit card: from `cache.beforeYouSubmit` (or equivalent existing field — confirmed
  against actual `ScoringCache` shape during planning/implementation, not guessed here).

No inputs trigger AI calls. This component only reads what's already in the `ScoringCache` signal
value passed down from the parent.

### Apply/Tailor wizard (`apps/desktop/src/app/pages/jobs/apply-wizard.component.ts`)

Owns `activeStep: signal<number>` (1-5) and wraps the existing sub-flows behind the new `stepper`:

1. **Review score** — embeds `scoring-view` (same component, reused).
2. **Portal answers** — existing question/answer editor UI, moved as-is; copy-only buttons
   (already the existing behavior — verified against current `portalAnswersGet`/`Save` flow).
3. **Tailor CV** — existing 3-pass (XYZ → dual critique → build) UI, moved as-is, replacing the
   old `.wizard-step--*` CSS-class approach with the new `stepper`'s step 3 slot.
4. **Export** — existing DOCX/PDF export buttons, moved as-is (`exportDocx`/`exportPdf`).
5. **Apply** — per-field copy-to-clipboard buttons, "Open in browser" button using
   `openUrl()` from `@tauri-apps/plugin-opener` (new dependency usage, package already installed),
   and "Mark Applied" button wired to existing `upsertApplication`/`setApplicationStatus`.

Wizard is only reachable once a `scoring_cache` row exists for the job (mirrors current gating).

### Parent `jobs.component.ts`

Shrinks to: paste/parse UI (unchanged) → once `cache()` is non-null, renders `scoring-view`
(condensed/summary mode) with a "Start apply" button → clicking opens `apply-wizard` (either as a
CDK overlay/dialog or inline swap — decided during planning based on existing modal patterns in
the codebase, avoiding inventing a new modal primitive if one already exists).

## Data flow

No new data flow — same signals (`job`, `cache`, `portalAnswers`, `tailorResults`, loading/error
signals) get threaded as `@Input()`s into the new child components instead of being read directly
in one giant template. Component split only; state ownership stays in the parent (or is lifted
into a small signal-based service if the parent/wizard split makes prop-drilling unwieldy —
decided during planning).

## i18n

New keys under `jobs.wizard.*` for step labels (`review_score`, `portal_answers`, `tailor_cv`,
`export`, `apply`), Back/Next buttons (reuse existing generic `common.back`/`common.next` if they
exist, else add), and step 5 labels (`open_browser`, `mark_applied` — likely already exist as
`jobs.mark_applied`). EN+DE both required, no hardcoded strings.

## Testing / verification

- Unit: smoke tests for `score-gauge` and `stepper` (render + input/output contract).
- Live verify (Tauri dev, per project rule): paste a job with existing cached score, confirm
  scoring view renders from cache with 0 new tokens (check no AI invoke fires), step through
  wizard 1→5 without long scroll, confirm Back/Next works, confirm DOCX/PDF export still produces
  files, confirm Mark Applied writes `applications.status` + `status_history` row, confirm light
  and dark theme both render correctly.

## Risks / open questions for planning phase

- Exact `ScoringCache` field names for "before you submit" notes — confirm against
  `libs/core` types before writing the scoring-view template.
- Whether an existing modal/dialog primitive exists in `libs/ui` for hosting the wizard, or the
  wizard renders as a route/inline section instead — check before assuming a new overlay pattern.
- Whether state should be lifted into a small `JobDetailStore` (signal store) vs. plain
  `@Input()`/`@Output()` prop drilling across 3 new components — lean prop drilling first (YAGNI),
  escalate only if drilling becomes awkward in practice.
