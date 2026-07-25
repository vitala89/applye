# Feature Brief: First-run Onboarding Wizard

- **Status**: `planned`
- **Source**: ROADMAP §17; Career-Ops adoption analysis ([CAREER_OPS_ADOPTION.md](../CAREER_OPS_ADOPTION.md) §2 onboarding). Design dialogue 2026-07-06.

---

## Overview

### Problem

On first launch a new user lands in an empty app with no profile. Nothing can
be scored, tailored, or generated until a profile exists, and today the only way
to create one is the manual `/profile` form. Non-technical users also have no
guidance on the one hard prerequisite: configuring an AI provider API key.
Career-ops proves the winning pattern - ingest a resume, auto-fill, confirm the
gaps - which turns a cold start into a 2-minute guided setup.

### User Value

- A guided, skippable first-run flow that fills the whole profile from a resume
  (PDF/DOCX/text) instead of a blank form.
- A beginner-friendly AI-setup step: pick a provider, open its console, create a
  key, paste it - with a link and a slot for a video tutorial. Written for
  non-technical users, not just developers.
- Auto-suggested target archetypes + compensation range the user just confirms
  or corrects - no fabrication.
- Privacy reassurance up front: everything stays local.

---

## Scope

### In Scope (v1)

- Full-screen onboarding overlay, gated in `app.ts` after the health-check
  (`first-launch`), by a new `settings.onboardingSeen` flag. Same mechanism as
  `healthCheckSeen`.
- Steps: **0 Welcome/privacy → 1 AI setup → 2 Resume input → 3 Preview & edit →
  4 Archetypes + comp → 5 Done**. Internal `step` signal; no routing.
- **Resume input:** upload PDF/DOCX (Rust `pdf-extract`, already a dependency) or
  paste text. Parsed by the existing `cv-import` skill (cached by input hash).
- **AI-setup step:** provider choice (existing `AiProvider` enum), per-provider
  beginner guide (intro, "Open console & create key" → `openExternal()`, numbered
  steps, paste field, "Validate" reusing health-check validation, optional
  `helpVideoUrl` opened externally). Key stored in keyring only.
- **Archetype + comp suggestion:** new small skill `onboarding-archetypes` - from
  the parsed resume, propose 2-3 archetypes + a comp range (1 AI call, cached,
  Haiku). Suggestion only; user confirms/edits.
- Writes to the **existing** `Profile` (`fullMd`, flat `targetArchetypes`) - no
  new profile schema in v1.
- **Skip** anywhere sets `onboardingSeen = true`. If skipped with an empty
  profile, a dismissible `OnboardingBannerComponent` on the dashboard offers
  "Finish setup". Manual re-entry from Settings and Profile.
- i18n keys `onboarding.*` (EN + DE minimum).

### Out of Scope (deferred)

- **Dual-track profile schema** (archetypes with `fit`/`track`/`sell_when` +
  `alternate_ranges`). Separate P1 brief; see CAREER_OPS_ADOPTION.md §4.
- **Conversational resume path** ("tell me about your experience" →
  `cv-generate-baseline`).
- **CLI-bridge / account-subscription login** (sign in with a Claude/OpenAI
  account instead of a key) - ROADMAP §v2. Reserve a place on the AI-setup step
  for it; do not build now.
- Embedded/bundled video assets - v1 only links out via `helpVideoUrl`.

---

## Execution Plan

### Acceptance Criteria

- [ ] On first launch, after the health-check, the onboarding overlay shows when `settings.onboardingSeen` is false.
- [ ] Completing or skipping sets `onboardingSeen = true`; it never auto-shows again.
- [ ] Uploading a PDF/DOCX or pasting text produces a structured preview via `cv-import`; the user can edit before saving.
- [ ] The AI-setup step lets a non-technical user pick a provider, open its console (`openExternal`), paste a key, and validate it; the key lands in keyring, never the DB or logs.
- [ ] Each provider shows a numbered beginner guide and an optional "watch video" link driven by data (`helpVideoUrl`), addable without code changes.
- [ ] The archetype+comp step shows AI-suggested values the user confirms/edits; nothing is written without confirmation and nothing is fabricated.
- [ ] Saving writes the profile to `Profile.fullMd` + `targetArchetypes` (existing schema).
- [ ] If skipped with an empty profile, a dismissible dashboard banner offers "Finish setup"; it disappears once the profile has content.
- [ ] Onboarding can be re-run manually from Settings and Profile.
- [ ] EN + DE strings present; `i18n-keys.spec.ts` passes.

### AIF Routing

`aif-feature-builder` (implementation), `aif-testing-strategy` (test plan),
`aif-privacy-review` (resume text → AI + key handling), `aif-branch-finisher`
(finish). Route via `aif-orchestrator`.

### Expected Files

- `apps/desktop/src/app/core/onboarding/onboarding.component.ts` + per-step sub-components.
- `apps/desktop/src/app/core/onboarding/onboarding-banner.component.ts`.
- `apps/desktop/src/app/app.ts` - gate after `first-launch`.
- `libs/core/src/lib/models/settings.model.ts` - `onboardingSeen: boolean`.
- Migration `apps/desktop/src-tauri/.../migrations/0012_onboarding_seen.sql` + Rust settings command/mapping.
- `libs/skills/src/onboarding-archetypes/onboarding-archetypes.md`.
- i18n keys in `libs/i18n` (EN + DE).

---

## Architectural & Integration Impact

### Data / Migration Impact

- `0012_onboarding_seen.sql`: `ALTER TABLE settings ADD COLUMN onboarding_seen INTEGER DEFAULT 0;` - additive, no data loss (`DATA_CONTRACT.md`). Mirrors `0007_health_check_seen.sql`.
- No profile-schema change; writes existing `Profile` columns.

### Privacy / Security Impact

- Resume file parsed **locally** (Rust `pdf-extract`); only the extracted text is sent to the AI for structuring/archetype suggestion, with an explicit on-screen notice at that step.
- API key stored in the OS keyring only - never in SQLite, never logged.
- No auto-submit, no scraping. Every value is user-confirmed before save.

### i18n Impact

- New `onboarding.*` namespace (welcome, privacy, AI-setup per-provider guides, resume, preview, archetypes, done, banner). EN + DE required; RU/ES/FR/UK follow the existing rollout.

### Token / AI Impact

- `cv-import`: 1 call, cached by input hash (existing behavior).
- `onboarding-archetypes`: 1 call, cached by input hash, Haiku tier.
- Everything else (gating, navigation, key handling, writes) is 0 tokens.

---

## Verification & Documentation

### Testing Plan

- Unit: gate logic (`onboardingSeen` show/hide), flag write on complete/skip, idempotent re-entry, banner visibility (skipped + empty profile).
- Skill: `onboarding-archetypes` output shape (valid JSON, suggestion-only).
- i18n: `i18n-keys.spec.ts` covers new keys.

### Live Verification Plan

Fresh DB → launch → health-check → onboarding shows → set a test key + validate →
upload a sample PDF → preview/edit → confirm archetypes/comp → Done → flag set →
dashboard normal. Re-launch → onboarding does not reappear. Skip path → empty
profile → dashboard banner appears → "Finish setup" reopens onboarding.

### Docs to Update

- `docs/product/CURRENT_STATE.md`, `docs/product/FEATURE_INDEX.md` (status + brief link), `CHANGELOG.md [Unreleased]`.
- `ROADMAP.md` §17 - mark in-progress when work starts.

### Changelog Draft

`Added - First-run onboarding wizard: guided, skippable setup that configures an
AI provider key and builds the profile from an uploaded/pasted resume, with
AI-suggested target archetypes and compensation the user confirms. All local;
key stored in keyring.`

---

## Release Planning

### Commit / PR Plan

- Branch `feat/onboarding-wizard`. Atomic commits: migration + settings flag →
  gate/shell → wizard steps → AI-setup step → archetype skill → banner → i18n →
  tests. Conventional Commits. Single PR to `main`.

### Open Questions

- Provider set for v1 AI-setup: Claude (Anthropic), OpenAI (Codex), DeepSeek -
  confirm final list against the current `AiProvider` enum during implementation.
- Where exactly the "re-run onboarding" entry point lives in Settings vs Profile
  (both, per design).

### Decision

- Approach A (full-screen overlay, gated in `app.ts`), current profile schema,
  PDF/DOCX + paste input, show-once + dashboard banner when profile empty.
  Approved in the 2026-07-06 design dialogue.
