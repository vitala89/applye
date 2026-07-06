# Career-Ops → Applye — Feature Adoption Analysis

> **Purpose.** Career-ops is a local-first CLI job-search agent. Applye is a
> privacy-first Tauri + Angular desktop app in the same problem space. This
> document maps **every career-ops mode and cross-cutting system** to Applye's
> current state, so we can see at a glance what we already have (shipped or
> planned in `ROADMAP.md`) and what is a genuine **delta worth adopting**.
>
> This is an **analysis / triage** document, not a plan of record. Accepted
> deltas graduate to `IDEAS.md` → `FEATURE_INDEX.md` → a feature brief, per the
> product-state flow in `docs/product/README.md`.

**Last updated:** 2026-07-06 · **Applye version:** 0.22.0

---

## How to read the status column

| Badge               | Meaning                                                                           |
| ------------------- | --------------------------------------------------------------------------------- |
| ✅ **Shipped**      | Already implemented and released in Applye.                                       |
| 🟡 **Planned**      | Already on `ROADMAP.md` (section cited). No new decision needed.                  |
| 🔵 **Partial**      | Some of it exists / is planned; a specific slice is a delta.                      |
| 🔴 **Gap — adopt**  | Genuinely new. Not in the roadmap. Candidate for `IDEAS.md`.                      |
| ⚪ **Out of scope** | Conflicts with Applye principles (§0 augmentation-not-automation) or is CLI-only. |

**Applye guardrails that override any adoption (from `ROADMAP.md` §0 / `INSTRUCTIONS.md`):**

- **Augmentation, not automation.** Never auto-submit, never auto-apply, never scrape closed boards. Every outward action is a reviewed draft.
- **Privacy-first, local-first.** User data stays on device. Off-device calls are explicit and disclosed.
- **Token economy.** Deterministic work (filters, dedup, status, analytics) runs at 0 tokens. AI is cached by `input_hash`.

---

## 1. Command / mode cross-reference

Every entry in the career-ops "Command Center", plus the non-command `modes/`
files, mapped to Applye.

| career-ops mode          | What it is                                                                                                                          | Applye status                                                                               | Delta to adopt                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{JD}` **auto-pipeline** | Paste JD/URL → evaluate + report + PDF + tracker, in one shot.                                                                      | 🟡 Planned — `ROADMAP.md` §5 Core Job Flow (MVP).                                           | Applye keeps it **stepwise + reviewed** (paste → filter → score → tailor → apply), not a single black-box run. Keep our version.                                        |
| `pipeline`               | URL inbox: drop links anytime, batch-process later. Liveness sweep first.                                                           | 🔵 Partial — §5 handles one pasted job; there is no queue.                                  | **Inbox queue** (paste several URLs, process one-by-one on demand) — small delta, pairs with future apply-AI mode.                                                      |
| `oferta`                 | A–F evaluation only (no PDF).                                                                                                       | 🟡 Planned — §5.3 recruiter scoring + rubric.                                               | Our scoring rubric already mirrors this. No new work.                                                                                                                   |
| `ofertas`                | Compare & rank multiple offers.                                                                                                     | 🟡 Planned — §7 "Compare offers" button (0 new scoring tokens).                             | Already designed. No new work.                                                                                                                                          |
| `contacto`               | Find hiring-manager/recruiter, draft ≤300-char LinkedIn message. Greeting variant for chat platforms.                               | 🟡 Planned — §Later "LinkedIn outreach drafting".                                           | **Greeting variant** (ultra-short cold opener, configurable char budget) is a cheap add-on.                                                                             |
| `deep`                   | Deep company-research prompt (6 axes).                                                                                              | 🟡 Planned — §v2 "Company deep research" (`company_research` table exists).                 | Already designed. No new work.                                                                                                                                          |
| `interview-prep`         | Company-specific interview intel: audience map (recruiter / HM / peer / panel), round-by-round, story-bank mapping.                 | 🔵 Partial — §6 is our named "edge over career-ops" but is stage-typed, not audience-typed. | **Audience map** (recruiter-screen / hiring-manager / peer-tech / panel-mixed) as a lens on top of our stages — sharpens §6.                                            |
| `interview`              | Interactive profile/CV onboarding interview (one question at a time).                                                               | 🔵 Partial — feeds §17 onboarding.                                                          | **Conversational profile-building** = onboarding "tell me about your experience" path. Fold into onboarding.                                                            |
| `pdf`                    | ATS-optimized single-column CV PDF, truth-based keyword injection.                                                                  | ✅ **Shipped** — §16 Documents CV module (v0.21.0).                                         | Done.                                                                                                                                                                   |
| `latex`                  | Export CV as LaTeX/Overleaf `.tex`.                                                                                                 | ✅ **Shipped** — §16 `.tex` source-only export (v0.21.0).                                   | Done.                                                                                                                                                                   |
| `cover`                  | Cover letter: company research + keyword mirror + 4-prompt gate + gap detection.                                                    | ✅ **Shipped** — §16 Cover Letter module (v0.22.0).                                         | **4-prompt gate** (why / problem / approach / tone) + **gap detection** (domain/lang/notice/title) would deepen our shipped module.                                     |
| `training`               | Evaluate a course/cert against the user's North Star.                                                                               | 🔴 Gap — not in roadmap.                                                                    | Low priority. Park in IDEAS "Later".                                                                                                                                    |
| `project`                | Evaluate a portfolio-project idea (BUILD / SKIP / PIVOT).                                                                           | 🔴 Gap — not in roadmap.                                                                    | Low priority. Park in IDEAS "Later".                                                                                                                                    |
| `tracker`                | Application status overview + stats.                                                                                                | 🟡 Planned — §7 Kanban + §8 auto status dates.                                              | Already designed (CDK kanban). No new work.                                                                                                                             |
| `apply`                  | Live application assistant: read form, draft answers, **knock-out question detection**, ATS-quirk handling.                         | 🔵 Partial — §5.4 portal answer drafts + §Later screenshot-to-answers.                      | **Knock-out detection** (visa / degree / years / salary floor → warn before applying) is a strong, cheap delta.                                                         |
| `scan`                   | Portal scanner: 45+ boards, zero-token local parsers + public ATS APIs, dedup.                                                      | 🟡 Planned — §11 job sources + §Later ATS public APIs (Greenhouse/Lever/Ashby).             | Already designed. Legality-first framing already in §11. No new work.                                                                                                   |
| `patterns`               | Rejection-pattern detector: funnel, archetype conversion, **ATS-vendor monoculture warning**, **session-content targeting signal**. | 🔵 Partial — §v2 rejection patterns + archetype performance.                                | **ATS-vendor advance-rate** ("this channel is dead, go direct/referral") + **session-content misfit** ("you're fluent in X but apply to Y") are novel analytics deltas. |
| `followup`               | Follow-up cadence tracker: flag overdue, generate drafts, pinned dates.                                                             | ✅ **Shipped** (v0.19.0) + 🔵 §v2 cadence.                                                  | **Cadence dashboard** (per-status rules, urgency tiers, pinned next-date) extends our shipped `mailto:` drafting.                                                       |
| `update`                 | Update the career-ops CLI system files with diff preview.                                                                           | ⚪ Out of scope — Applye ships as a versioned app, not a self-updating skill repo.          | N/A.                                                                                                                                                                    |
| `add`                    | Add a finished project/paper/role to `cv.md` from a link, grounded only in the source.                                              | 🔵 Partial — §16 CV section constructor covers manual build.                                | **"Add from URL"** (GitHub repo / paper → grounded CV bullets, confirm-before-write) is a nice CV-module add-on.                                                        |
| `agent-inbox`            | Durable queue of requests the agent drains next session.                                                                            | 🔴 Gap — not in roadmap.                                                                    | **Foundation for the future Apply-AI mode.** Small now, unlocks later.                                                                                                  |
| `batch`                  | Mass headless processing of many jobs (conductor + workers).                                                                        | ⚪ Out of scope — mass automation conflicts with §0 (augmentation, reviewed one-by-one).    | Do **not** adopt as automation.                                                                                                                                         |
| `email`                  | Application email drafts (HR application / referral / cold).                                                                        | 🔵 Partial — shipped follow-up `mailto:`; no application-email variants.                    | **Email variants** (HR / referral / cold) — cheap, reuses draft-then-`mailto:` pattern.                                                                                 |
| `job` / `jobs`           | Single-offer A–G / multi-offer comparison (older names for `oferta`/`ofertas`).                                                     | 🟡 Planned — §5 / §7.                                                                       | Same as above. No new work.                                                                                                                                             |

---

## 2. Cross-cutting systems

Not commands — systems that shape the whole tool.

| career-ops system                                                        | What it is                                                                                                                                                                                            | Applye status                                                                        | Delta to adopt                                                                                                                       |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Onboarding / profile** (`doctor` + `interview` + `profile.yml`)        | Cold-start check → ingest resume → auto-detect archetypes → confirm gaps.                                                                                                                             | 🟡 Planned — §17 first-run wizard + §5b archetype field + `onboarding_seen` DB flag. | See **§4 below** — adopt the **dual-track archetype + per-track comp** structure into our profile schema. This is the biggest delta. |
| **Dual-track profiles** (`profile.example.md`)                           | Two `fit: primary` archetypes (e.g. engineer + instructor) + two comp ranges; evaluator picks per-JD.                                                                                                 | 🔴 Gap — §5b assumes 1–5 flat archetype strings.                                     | **Adopt.** Structured archetypes with `fit` / `track` / `sell_when` + `alternate_ranges`.                                            |
| **Plugins + MCP** (`plugins.mjs`, trust badges)                          | Installable plugins/MCP with a trust model: bundled / approved / community-unverified / off-registry; commit-pinning; tamper detection; two consent gates; sandboxed egress; **no auto-submit hook**. | 🟡 Planned — Vision "Plugin architecture + marketplace" + "MCP integration layer".   | **Adopt the trust model as the spec** now (badges, pinning, explicit consent, egress allowlist) even before building a loader.       |
| **Voice-DNA / writing-style calibration** (`voice-dna.md`, `_shared.md`) | Anti-AI-slop guardrail (banned words, no em-dashes) + per-user style extracted from writing samples; formal register for ATS, conversational for letters/outreach.                                    | 🔴 Gap — not in roadmap.                                                             | **Adopt** as a lightweight guardrail applied to generated candidate-facing prose. Improves every draft.                              |
| **Source-of-truth / no-fabrication rules** (`_shared.md`)                | Exclusive source files; never invent metrics; keywords reformulated, never fabricated; never claim un-attributed authorship.                                                                          | 🔵 Partial — §0 philosophy + `DATA_CONTRACT.md`.                                     | **Formalize** these as explicit skill-prompt rules in `libs/skills/`.                                                                |
| **Posting legitimacy (Block G)**                                         | Ghost-job detector: freshness, JD quality, layoff news, repost pattern → 3 tiers, ethical framing.                                                                                                    | 🟡 Planned — §5.2 legitimacy tier (green/yellow/red).                                | Already designed. No new work.                                                                                                       |
| **Scoring A–G rubric**                                                   | 6-block eval, 1–5 global, apply-threshold.                                                                                                                                                            | 🟡 Planned — §5.3 recruiter scoring + rubric + "Before you submit".                  | Already designed. No new work.                                                                                                       |

---

## 3. Accepted deltas (ranked)

The genuinely-new items above, ready to graduate to `IDEAS.md`. Priority/Effort
per `PLANNING.md` (P0–P3, XS–XL).

| #   | Delta                                                            | Why it matters                                                                                                                         | Priority | Effort   |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| 1   | **Dual-track archetypes + per-track comp** in profile schema     | Hybrid careers (eng + instructor, IC + manager) don't fit one flat list; wrong comp range → wrong scoring. Directly powers onboarding. | P1       | M        |
| 2   | **Knock-out question detection** (in Apply)                      | Warns before wasting an application on an auto-reject filter (visa / degree / years / salary floor).                                   | P2       | S        |
| 3   | **Voice-DNA guardrail** on generated prose                       | Kills AI-slop, keeps register correct (ATS vs conversational). Improves every draft at ~0 marginal cost.                               | P2       | S        |
| 4   | **Plugin/MCP trust model** (spec)                                | Foundation for the marketplace vision; safe extensibility (badges, pinning, consent, egress allowlist, no auto-submit).                | P2       | M (spec) |
| 5   | **Cover-letter 4-prompt gate + gap detection**                   | Deepens the shipped Cover module; forces real angles, flags domain/lang/notice gaps.                                                   | P2       | S        |
| 6   | **Interview audience-map** (recruiter/HM/peer/panel)             | Sharpens §6; a recruiter screen ≠ a peer-tech round; pre-routes prep.                                                                  | P2       | S        |
| 7   | **Follow-up cadence dashboard + pinned dates**                   | Extends shipped follow-up: per-status cadence, urgency tiers, override next-date.                                                      | P2       | S        |
| 8   | **Patterns: ATS-vendor monoculture + session-content targeting** | Novel analytics: "this channel is dead" + "you're fluent in X, applying to Y".                                                         | P3       | M        |
| 9   | **Email variants** (HR / referral / cold)                        | Reuses draft-then-`mailto:`; covers direct-application email, not just follow-up.                                                      | P3       | S        |
| 10  | **Add-from-URL to CV** (GitHub/paper → grounded bullets)         | Confirm-before-write CV enrichment from a public source.                                                                               | P3       | S        |
| 11  | **Agent inbox** (durable request queue)                          | Foundation for the future Apply-AI mode.                                                                                               | P3       | S        |
| 12  | **`training` / `project` evaluators**                            | Nice-to-have coaching modes.                                                                                                           | P3       | S        |

---

## 4. Adapted Applye profile schema (dual-track)

Career-ops `profile.yml` (dual-track example) taken as the reference and adapted
to Applye. Today `Profile` is `{ fullMd, scoringJson, pitchMd, targetArchetypes, ... }`.
Proposal: keep `fullMd` (the human-editable CV/profile markdown) as source of
truth, and add a **structured `profile_json`** (or widen `targetArchetypes`) that
the onboarding wizard fills and the scorer reads.

```jsonc
// profile_json — structured, machine-read; fullMd stays the human source of truth
{
  "candidate": {
    "fullName": "…",
    "email": "…",
    "phone": "…",
    "location": "…",
    "linkedin": "…",
    "portfolioUrl": "…",
    "github": "…",
  },

  // Dual-track: MORE THAN ONE archetype may be `fit: "primary"`.
  // The scorer picks whichever is closest to the JD at scoring time.
  "archetypes": [
    {
      "name": "Senior AI Engineer",
      "level": "Senior/Staff",
      "fit": "primary", // primary | secondary | adjacent
      "track": "engineering", // engineering | teaching | hybrid | <free text>
      "sellWhen": "JD emphasizes shipping production AI, agent infra, eval systems",
    },
    {
      "name": "Senior Technical Instructor (AI/ML)",
      "level": "Senior/Lead",
      "fit": "primary",
      "track": "teaching",
      "sellWhen": "JD emphasizes curriculum, cohort delivery, DevRel education",
    },
  ],

  "narrative": {
    "headline": "One line naming BOTH tracks — the rare combination is the value",
    "exitStory": "Why moving now, bridging both tracks",
    "superpowers": ["…"],
    "proofPoints": [{ "name": "…", "url": "…", "heroMetric": "…", "track": "engineering" }],
  },

  "compensation": {
    "targetRange": "EUR 95K-130K", // default = engineering (usually higher)
    "currency": "EUR",
    "minimum": "EUR 80K",
    "locationFlexibility": "Remote within EU; ≤1 week/month on-site",
    // The scorer picks the range matching the detected archetype's track.
    "alternateRanges": [
      {
        "track": "teaching",
        "targetRange": "EUR 70K-95K",
        "minimum": "EUR 60K",
        "note": "Teaching pays less; walk-away lower but not unlimited.",
      },
    ],
  },

  "location": {
    "country": "Germany",
    "city": "Berlin",
    "timezone": "CET/CEST",
    "visaStatus": "EU citizen, no sponsorship needed",
    "onsiteAvailability": "1 week/month any EU city; full remote preferred",
  },
}
```

**Notes for implementation (later brief, not now):**

- Keep `fullMd` as the edited human artefact; `profile_json` is derived/structured and drives scoring, hard-filters, and the title filter (§5b).
- Onboarding writes `profile_json` from the parsed resume; the "confirm gaps" step edits `compensation` + `archetypes`.
- The Layer-1 hard-filter (§5b, 0 tokens) reads `archetypes[].track` + `sellWhen` keywords.
- A DB migration adds `profile_json` (nullable) — additive, no data loss (`DATA_CONTRACT.md`).

---

## 5. Explicitly parked (not now)

| Item                                 | Why parked                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apply-AI agent mode**              | Chat-driven agent that runs the whole flow live. Deliberately a later feature series — foundation (agent inbox, skills, cached scoring) is being laid, but the agent UX is not near-term.                                                                                                                                   |
| **`scan` / `batch` mass automation** | Discovery scanning is planned (§11, legality-first). Headless mass-processing / auto-runs are **out** — they conflict with §0 (reviewed, one-by-one).                                                                                                                                                                       |
| **LinkedIn auto-scrape MCP**         | Even for the user's own profile, automated LinkedIn access violates its ToS (grey zone, ban risk). **Clean path adopted instead:** user's own "Save to PDF" / official data export → local parse. An optional MCP plugin can exist behind the trust model (delta #4), owned by the user who enables it — never in the core. |

---

## Appendix — career-ops supporting facts worth remembering

- **Zero-token scanning** is real: local parsers + public ATS JSON APIs (Greenhouse, Lever, Ashby, Workday, +40 boards). No HTML scraping. Aligns with §11 legality-first.
- **~35% of jobs fail on archetype, not skills** — the empirical basis for §5b and for the dual-track schema above.
- **Report numbering uses atomic reservation** (sentinel files) to avoid race conditions in parallel runs — relevant only if we ever parallelize; our kanban is single-user.
