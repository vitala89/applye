# Agent Prompt — Career-Ops Feature Adoption

Use this prompt to triage and implement features adopted from career-ops into
Applye. It is the reusable driver for the analysis in
[`docs/product/CAREER_OPS_ADOPTION.md`](docs/product/CAREER_OPS_ADOPTION.md).

---

## Context

Read first (do not skip):

- `AGENTS.md`, `PROJECT_CONTEXT.md`, `docs/product/CURRENT_STATE.md`
- `docs/product/CAREER_OPS_ADOPTION.md` — the cross-reference matrix + accepted deltas (§3) + adapted profile schema (§4)
- `ROADMAP.md` §0 (philosophy), §5 / §5b (core flow + archetype), §6 (interview), §16 (documents), §17 (onboarding)
- `docs/product/PLANNING.md` (statuses, P0–P3, XS–XL), `docs/product/README.md` (product-state flow)

Use the `aif-orchestrator` skill to route non-trivial work.

## Hard constraints (never violate)

1. **Augmentation, not automation** — no auto-submit, no auto-apply, no scraping closed boards. Every outward action is a reviewed draft handed off via copy / `mailto:` / `openExternal()`.
2. **Privacy-first, local-first** — user data stays on device; off-device calls are explicit and disclosed.
3. **Token economy** — deterministic work (filters, dedup, status, analytics) at 0 tokens; AI cached by `input_hash`.
4. **Data contract** — never overwrite user data; migrations are additive (`DATA_CONTRACT.md`).
5. **No fabrication** — generated candidate-facing text reformulates real profile facts; never invents metrics, skills, or authorship.

## Task

Pick ONE accepted delta from `CAREER_OPS_ADOPTION.md` §3 (highest priority first,
unless the user names one). For that delta:

1. **Triage** — add/confirm it in `docs/product/IDEAS.md` (Needs Analysis → Accepted), then a row in `docs/product/FEATURE_INDEX.md`.
2. **Brief** — write a feature brief from `docs/product/feature-briefs/FEATURE_BRIEF_TEMPLATE.md`: problem, user value, scope, acceptance criteria, data/migration impact, privacy impact, i18n impact, token impact, test + live-verification plan, changelog draft.
3. **Implement** — follow the brief. Match existing patterns (Documents module, skills in `libs/skills/`, models in `libs/core`, data in `libs/data`, Rust commands). Keep i18n (EN + DE minimum). Add tests.
4. **Verify** — run the affected target tests + a live check on the running app. Never claim done without proof.
5. **Finish** — use `aif-branch-finisher`: diff review, docs sync (`CURRENT_STATE.md`, `FEATURE_INDEX.md`, `CHANGELOG.md [Unreleased]`), Conventional Commit, PR.

## Priority order (default)

1. Dual-track archetypes + per-track comp (P1, M) — **also unblocks onboarding**
2. Knock-out question detection (P2, S)
3. Voice-DNA guardrail (P2, S)
4. Plugin/MCP trust model — spec only (P2, M)
5. Cover-letter 4-prompt gate + gap detection (P2, S)
6. Interview audience-map (P2, S)
7. Follow-up cadence dashboard + pinned dates (P2, S)
8. Patterns: ATS-vendor + session-content targeting (P3, M)
9. Email variants HR/referral/cold (P3, S)
10. Add-from-URL to CV (P3, S)
11. Agent inbox (P3, S) — foundation for the parked Apply-AI mode
12. `training` / `project` evaluators (P3, S)

## Out of scope (do not build)

- Apply-AI agent mode (parked for a later series).
- `scan` / `batch` mass automation and auto-runs.
- LinkedIn auto-scrape in core (clean path = user's own PDF export; any MCP scraper lives behind the plugin trust model, user-enabled only).

## Definition of done (per delta)

- [ ] Feature brief written and linked in `FEATURE_INDEX.md`.
- [ ] Implementation matches an existing Applye pattern; no new deps unless justified.
- [ ] i18n keys added (EN + DE).
- [ ] Tests added and passing; live-verified on the app.
- [ ] Privacy + token impact stated; no off-device data leak; AI cached.
- [ ] Docs synced; Conventional Commit; PR opened.
