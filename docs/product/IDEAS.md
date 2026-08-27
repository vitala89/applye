# Idea Inbox

This file serves as the raw inbox for ideas, feature requests, and product suggestions.

> [!IMPORTANT]
> **Rule**: Raw ideas placed here **do not** automatically modify the canonical [ROADMAP.md](../../ROADMAP.md). They must go through triage, analysis, and acceptance before they are elevated to the roadmap or execution plans.

---

## Raw Ideas

- _Add raw ideas here to capture them before they are forgotten._

### Features the documentation expected to find

Framing: while capturing the guide on 2026-07-27 and 2026-07-28, four slots described a UI that does
not exist. The decision taken on 2026-07-28 was to let the descriptions settle for the product for
launch - the guide now documents what ships - and to keep the four here rather than lose them, because
each is a feature someone reasonably expected. None blocks the launch.

- **"Tailored" badge in the Documents library (P2/S)** - `cv-list.component.html` renders region,
  language and Default only, so a tailored CV is told apart by its label and its "Linked to" line.
  The cheapest of the four and the one with the clearest daily value once a user has a dozen CVs.
- **Live CV preview beside the section list (P2/M)** - `cv-detail.component.html` renders `editor-col`
  or `preview-col`, never both, so preview is a mode rather than a companion pane. Wanting both at
  1440 points wide is a layout question, not just a template change.
- **Section-level style overrides in the CV editor (P3/M)** - style is one document-wide block today.
  Per-section overrides mean a schema addition, so it needs a migration and an export path that
  honours them, for a gain that is mostly cosmetic.
- **Save-to-profile on the gap question itself (P3/S)** - the toggle sits on a separate confirmation
  dialog after the last question. Moving it onto each question reads as more direct, but it splits one
  consent point into several, which is the reason it was built as a single dialog.
- **A manual, empty CV in the Documents library (P2/S)** - `document_library` fills by exactly three
  paths: importing a file, generating a baseline, and finishing the apply wizard. The first two are AI
  calls, so a new user cannot start a CV by hand and a documentation state cannot be prepared without
  spending money. A fourth path - an empty CV from the section template, no AI - would fix both. Worth
  doing on the same argument as the rest of the app: AI assists, the user decides.

### Germany pack

Framing: the landing page deliberately moved from "Built for the German market" to the
global-first "Local rules, handled" (PR #141). This is that promise's flagship proof, not a
re-narrowing - every item below is a Germany depth layer on a market-agnostic feature.

Already shipped, for reference: `DE-traditional` / `DE-ATS-modern` CV templates, Anschreiben
generation in formal _Sie_, the Eigenbemuehungen tracker report with locale-correct printing,
the profile photo plus the German photo prompt in the tailor wizard, Bundesagentur fuer Arbeit
and service.bund.de as built-in Discover sources (`migrations/0021`, `migrations/0030`), and
Personio as a DE-dominant `ats_*` adapter.

- **German Discover sources (P0)** - the built-in set (Remotive, WWR, Himalayas) is
  remote-first and English, so a Germany geo scope scanned three feeds that carry almost no
  German posting. Bundesagentur fuer Arbeit and service.bund.de now cover the general and
  public-sector labor markets (see above). Still open, each blocked on something concrete rather
  than unresearched - see `docs/product/local-markets-analysis.md`'s 2026-08-27 follow-up for the
  live-probe findings: **EURES** (works, but its only known endpoint is an undocumented internal
  API, not a published one - a legality-tier call, not a technical one), **Interamt** (no live
  feed found yet), **`ats_join`** (its job list needs a numeric company id with no slug lookup,
  which only an HTML scrape could resolve - conflicts with this project's no-scraping rule),
  **`ats_softgarden`** (its API requires a per-client token, unlike the other four keyless ATS
  types). Explicitly **not** StepStone / Indeed / Xing: ToS-hostile, Tier 3 - offer "open in
  browser" instead.
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
