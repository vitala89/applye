# Feature Brief: Finalize AIF Product State System (Step 0)

- **Status**: `in-progress`
- **Source**: developer observation — `CURRENT_STATE.md` shows this layer in-progress, uncommitted.

---

## Overview

### Problem

The AIF Product State System (this `docs/product/` operational layer) is in-progress but not
committed or PR'd. It must be finalized and shipped **before** any new feature work starts, so the
planning layer is stable and future briefs land on a merged foundation.

### User Value

Indirect (developer/agent value): a stable, versioned planning layer that keeps ROADMAP, briefs,
feature index, and daily state in sync — reduces drift and gives every future agent a reliable
context entry point.

---

## Scope

### In Scope

- Verify all `docs/product/` files are internally consistent (README mapping, PLANNING, CURRENT_STATE,
  FEATURE_INDEX, IDEAS, templates).
- Confirm the three feature briefs (this one, follow-up drafting, documents) are present and referenced
  in `FEATURE_INDEX.md`.
- Commit the whole layer on branch `docs/aif-product-state-workflow`.
- Open a PR to `main`.

### Out of Scope

- Any application source code, `package.json`, migrations, or dependency changes.
- CHANGELOG version bump — this is a docs/config-only change (exempt per `aif-branch-finisher` skill).

---

## Execution Plan

### Acceptance Criteria

- [ ] All `docs/product/` docs cross-reference correctly (no dangling links).
- [ ] `FEATURE_INDEX.md` lists Follow-up Drafting and Documents CV/CL briefs with `Brief` links and
      `Planned`/`Ready` status.
- [ ] `CURRENT_STATE.md` "Currently working on" / "Next recommended action" updated to reflect the
      new brief queue (0 → 2 → 1).
- [ ] Branch `docs/aif-product-state-workflow` created, all doc changes committed.
- [ ] PR opened against `main` with a summary of the planning layer.

### AIF Routing

`aif-docs-sync` (consistency pass), `aif-project-state-sync` (state update), `aif-branch-finisher`
(commit + PR). No feature builder needed — docs only.

### Expected Files

- `docs/product/*.md`, `docs/product/feature-briefs/*.md`, `docs/product/decisions/*` — verify/finalize.
- No source files.

---

## Architectural & Integration Impact

### Data / Migration Impact

None.

### Privacy / Security Impact

None — docs only, nothing leaves the device.

### i18n Impact

None.

### Token / AI Impact

None.

---

## Verification & Documentation

### Testing Plan

No code tests. `nx affected` should show nothing app-level touched.

### Live Verification Plan

None (docs only).

### Docs to Update

Self-contained — this IS the docs update.

### Changelog Draft

No CHANGELOG entry (docs/config exempt). The existing `[Unreleased]` AIF Core entry already covers
the foundation.

---

## Release Planning

### Commit / PR Plan

Branch `docs/aif-product-state-workflow` → single commit `docs(aif): add product state planning
layer + initial feature briefs` → PR to `main`.

### Open Questions

None.

### Decision

Ship first, before Follow-up Drafting and Documents briefs are handed to builders.
