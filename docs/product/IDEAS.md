# Idea Inbox

This file serves as the raw inbox for ideas, feature requests, and product suggestions.

> [!IMPORTANT]
> **Rule**: Raw ideas placed here **do not** automatically modify the canonical [ROADMAP.md](../../ROADMAP.md). They must go through triage, analysis, and acceptance before they are elevated to the roadmap or execution plans.

---

## Raw Ideas

- _Add raw ideas here to capture them before they are forgotten._

### Germany pack

Framing: the landing page deliberately moved from "Built for the German market" to the
global-first "Local rules, handled" (PR #141). This is that promise's flagship proof, not a
re-narrowing - every item below is a Germany depth layer on a market-agnostic feature.

Already shipped, for reference: `DE-traditional` / `DE-ATS-modern` CV templates, Anschreiben
generation in formal _Sie_, the Eigenbemuehungen tracker report with locale-correct printing,
the profile photo plus the German photo prompt in the tailor wizard.

- **German Discover sources (P0)** - the built-in set (Remotive, WWR, Himalayas) is
  remote-first and English, so a Germany geo scope scanned three feeds that carry almost no
  German posting. Bundesagentur fuer Arbeit (official public REST API, largest DE index),
  EURES, Interamt/bund.de for oeffentlicher Dienst, plus `ats_*` adapters for the DE-dominant
  stacks (Personio public job feed, join.com, softgarden). Explicitly **not** StepStone /
  Indeed / Xing: ToS-hostile, Tier 3 - offer "open in browser" instead.
- **Anschreiben: DIN 5008 + the two fields every DE posting asks for (P0)** - German ads
  routinely require _fruehestmoeglicher Eintrittstermin_ and _Gehaltsvorstellung_; letters
  without them get filtered. New wizard/skill inputs `earliest_start`, `salary_expectation`,
  `notice_period`, plus a DIN 5008 layout (sender block, recipient window position, Betreffzeile
  without the word "Betreff", `Ort, TT.MM.JJJJ`, `Mit freundlichen Gruessen`, `Anlagen` line).
- **Bewerbungsmappe as one artifact (P1)** - DE convention is a bundle: Deckblatt →
  Anschreiben → Lebenslauf → Anlagen. Two built-in templates (`DE-Deckblatt`,
  `DE-Anlagenverzeichnis`) and a single merged PDF export from the document library, reusing
  the photo already in `profile.photo_data_uri`.
- **`DE-tabular` Lebenslauf template (P1)** - two-column layout with a left date column
  (`MM/JJJJ - MM/JJJJ`), `Persoenliche Daten`, `Kenntnisse`, `Sprachen` at CEFR levels, and
  `Ort, Datum` + signature line at the foot. Today `DE-traditional` is only a section list.
- **Arbeitszeugnis decoder - new skill (P1)** - German references are written in coded
  language ("stets zu unserer vollsten Zufriedenheit" = grade 1, "bemuehte sich" = fail). Grade
  a pasted Zeugnis, flag harmful formulations, draft a correction request. Nobody ships this,
  and it is pure local text analysis.
- **Eigenbemuehungen quota tracking (P1)** - the report exists, the obligation does not: store
  the monthly application quota from the Eingliederungsvereinbarung, show progress and a
  "period closes in N days" nudge. Arbeitslosmeldung 3-day rule and Sperrzeit risk as
  informational notes only, behind the existing legal disclaimer.
- **DE lenses on existing skills (P2)** - `job-scoring`: required German level (B2 vs C1 is a
  hard gate), formal degree requirement, work-permit need, TVoeD/tariff bands.
  `interview-hr`: Vorstellungsgespraech norms, Gehaltsverhandlung in brutto, Probezeit,
  Urlaubstage, betriebliche Altersvorsorge. Profile fields: Kuendigungsfrist, Aufenthaltstitel
  / Blue Card status, German CEFR level, ZAB/Anabin degree recognition, Fuehrerschein class.
- **`/docs/guide/germany` page (P2)** - one page listing exactly what the Germany pack handles,
  linked from the landing's "Local rules, handled" section; mirrored in `README.de.md`.

---

## Needs Analysis

> Source: internal career-ops feature adoption analysis (kept local, not in the repo) - deltas
> that are genuinely new (not already on `ROADMAP.md`). Ranked in §3 of that doc.

- **Dual-track archetypes + per-track comp** in the profile schema (P1/M). Structured archetypes (`fit` / `track` / `sell_when`) + `alternate_ranges`; powers onboarding + Layer-1 hard-filter. See the internal career-ops adoption analysis §4.
- **Knock-out question detection** in Apply (P2/S) - warn before applying when a form auto-rejects on visa / degree / years / salary floor.
- **Voice-DNA guardrail** on generated prose (P2/S) - anti-AI-slop + correct register (ATS formal vs conversational).
- **Plugin/MCP trust model** - spec only (P2/M) - badges, commit-pinning, two consent gates, egress allowlist, no auto-submit. Foundation for the marketplace vision.
- **Cover-letter 4-prompt gate + gap detection** (P2/S) - deepens the shipped Cover module.
- **Interview audience-map** recruiter/HM/peer/panel (P2/S) - sharpens §6.
- **Follow-up cadence dashboard + pinned dates** (P2/S) - extends shipped follow-up.
- **Patterns: ATS-vendor monoculture + session-content targeting** (P3/M) - novel analytics.
- **Email variants** HR / referral / cold (P3/S) - reuses draft-then-`mailto:`.
- **Add-from-URL to CV** (P3/S) - GitHub repo / paper → grounded bullets, confirm-before-write.
- **Agent inbox** (P3/S) - durable request queue; foundation for the parked Apply-AI mode.

---

## Accepted

- _Ideas accepted for a brief but not yet shipped._

---

## Rejected / Not Now

- _Ideas that have been reviewed and determined not to fit the project scope or current direction._

---

## Later / Parking Lot

- _Good ideas that are outside the immediate roadmap horizon._
- **Managed AI tier (BYOK / Bridge / Managed proxy)** - monetization: app stays
  free/MIT; paid tier proxies AI through Applye accounts under a subscription,
  for users with no key / no AI account. **Important - deferred, revisit later.**
  Already analyzed (not raw): decision + options in
  [ADR-0001](decisions/ADR-0001-ai-key-monetization.md); provider ToS checked
  (Anthropic/OpenAI/DeepSeek all permit, conditions noted); privacy-reviewed
  (shippable IF zero-log in code + explicit opt-in). Full plan +
  Gate 0 + Workstreams A-D + D4 privacy findings in
  [managed-tier-implementation-plan.md](managed-tier-implementation-plan.md).
  Next when resumed: detail Workstream B (proxy) into tasks/estimates; resolve
  open blockers Q1 (proxy jurisdiction) + Q4 (content-free abuse handling).
- **`training` / `project` evaluators** (from career-ops) - course/cert and portfolio-project coaching modes. Low priority.
- **Apply-AI agent mode** - chat-driven agent that runs the whole flow live and narrates it. A later feature series; foundation (agent inbox, skills, cached scoring) laid first.
