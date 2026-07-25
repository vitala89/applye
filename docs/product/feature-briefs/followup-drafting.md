# Feature Brief: Follow-up Message Drafting (Step 2)

- **Status**: `shipped` (v0.19.0)
- **Source**: `IDEAS.md` (2026-07-05) - "Draft follow-up message for overdue applications".
- **Roadmap**: §13 v2 - "Follow-up drafting"; complements the shipped overdue badge (§7, v0.11.0).

---

## Overview

### Problem

Applications go overdue (the amber "Overdue" badge already renders on Pipeline cards once
`follow_up_at` passes, v0.11.0), but the user still has to write the follow-up email by hand.
That is exactly the kind of judgement-light drafting the app should assist.

### User Value

One click on an overdue card drafts a polite, context-aware follow-up email (company, role, days
since applied). User reviews/edits, then it opens their mail client via `mailto:` pre-filled. **User
sends manually - never auto-sent.** Small effort, high daily value, builds directly on shipped work.

---

## Scope

### In Scope

- A "Draft follow-up" action on overdue Pipeline cards (and/or quick-view modal).
- New skill file `libs/skills/src/followup/followup.md` (quality or economy model - see Token section).
- One AI call per draft, cached by `(application_id, input_hash)` where `input_hash` covers company,
  role, applied date, language, model.
- Language selector defaulting to the application's `doc_language`.
- Editable draft box + copy button + "Open in mail" (`mailto:` via `tauri-plugin-opener`).
- EN + DE strings in `libs/i18n/src/lib/translations/translations.ts`.

### Out of Scope

- Any send/transmit path. No SMTP, no API email. `mailto:` only - the OS mail client sends.
- Gmail/MCP integration (that is a later, separate roadmap item).
- Follow-up scheduling/reminders beyond the existing `follow_up_at` badge.

---

## Execution Plan

### Acceptance Criteria

- [ ] Overdue cards expose a "Draft follow-up" action.
- [ ] Action calls `ai_run` once with `followup.md`, produces a short polite draft grounded in
      company/role/days-overdue.
- [ ] Draft is cached; re-opening the same overdue application with unchanged inputs is 0 tokens.
- [ ] Language defaults to `applications.doc_language`, user can override; language is part of the
      cache key.
- [ ] Draft is editable; a copy button and a "Open in mail" (`mailto:`) button are present.
- [ ] **No code path transmits the message** - verified by review (augmentation boundary, §0/filter #8).
- [ ] EN + DE strings added to `translations.ts` (not the deleted JSON files).

### AIF Routing

`aif-feature-builder` (impl), `aif-privacy-review` (confirm no send path, `mailto:` only),
`aif-testing-strategy` (cache-key + no-transmit tests), `aif-branch-finisher` (CHANGELOG + minor bump + PR).

### Expected Files

- `libs/skills/src/followup/followup.md` - new skill (versioned prompt).
- Pipeline card / quick-view component + template (reuse existing overdue-badge component).
- A draft cache table or reuse of an existing cache pattern (see Data Impact - confirm before adding a
  table; a `followup_drafts` table mirrors `portal_answers`).
- `libs/core` / `libs/data` types if a new cache table is added.
- `libs/i18n/src/lib/translations/translations.ts` (EN + DE).
- Rust command for the cached draft (mirror `portal_answers` command shape).

---

## Architectural & Integration Impact

### Data / Migration Impact

Likely one additive migration `0010_followup_drafts.sql` (or reuse a generic drafts cache) - **confirm
the next-free migration number against `apps/desktop/src-tauri/migrations/` at build time** (currently
0009 is the latest; Documents §16 also wants 0010, so coordinate ordering). Purely additive, never edit
an applied migration.

### Privacy / Security Impact

**Critical boundary check.** The draft text is generated locally via `ai_run` (same provider path as
scoring). Nothing is emailed by the app - only `mailto:` hands a pre-filled draft to the user's own
mail client. Passes filter #8 (submit/send stays with the user). No new permissions.

### i18n Impact

New user-facing strings: action label, draft section header, language selector, copy/open buttons,
empty/loading/error states. EN + DE in `translations.ts`; `ru/es/fr/uk` inherit via the existing
`stub(en, …)` pattern.

### Token / AI Impact

One AI call per draft, cached. Short structured output (subject + body). Aggregated context in (company,
role, days), not raw JD. Economy model is likely sufficient - follow-ups are routine drafting; confirm
tone quality against a quality-model sample before locking the tier in the skill file front-matter.

---

## Verification & Documentation

### Testing Plan

- Cache-key test: same inputs → 0-token read; changed language → fresh draft.
- Guard test: assert no send/transmit code path (grep-style, like the portal-answers augmentation guard).
- i18n-keys spec must pass (new keys present in EN + DE).

### Live Verification Plan

1. Take an application overdue.
2. Click "Draft follow-up" → draft appears, grounded in company/role.
3. Switch language → new draft.
4. Edit, copy, "Open in mail" → mail client opens pre-filled, nothing sent by app.
5. Re-open → cached, 0 tokens.

### Docs to Update

CHANGELOG `[Unreleased]`; move IDEAS.md entry to Accepted → then Done; update FEATURE_INDEX + CURRENT_STATE.

### Changelog Draft

> **Follow-up drafting.** Overdue Pipeline cards now offer a "Draft follow-up" action that drafts a
> polite follow-up email from the company, role, and days-overdue via the `followup.md` skill (one AI
> call, cached per application + language + model). The draft is editable and opens the user's own mail
> client pre-filled via `mailto:` - Applye never sends it. EN + DE.

---

## Release Planning

### Commit / PR Plan

Branch `feat/followup-drafting` → CHANGELOG + minor version bump across the four manifests → PR to `main`.

### Open Questions

- New `followup_drafts` table vs. a generic drafts cache - decide during architecture pass.
- Migration 0010 ownership: this feature vs. Documents - whichever ships first takes 0010.

### Decision

Ship after Step 0, before Documents. Fast momentum win.
