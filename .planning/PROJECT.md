# Applye

## What This Is

Applye is a free, open-source, local-first desktop app that helps job seekers manage their search
with clarity and honesty. Built with Tauri 2 + Angular, it runs fully on the user's machine — no
cloud, no account, no telemetry. The user brings their own AI (CLI subscription or API key); the
app uses it only where genuine judgement is needed, caching everything else.

Primary market: German/EU job seekers. Key audience: engineers who want an honest, non-inflating
tool that respects their intelligence and their data.

## Core Value

A kanban pipeline that tracks every application — where it stands, what happened, and what's next —
with honest AI assistance available on demand but never making decisions for the user.

## Business Context

<!-- Not applicable — free, open-source, portfolio project + personal tool. -->

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Foundation**
- [ ] Tauri 2 + Angular monorepo skeleton (Nx workspace) compiles and runs
- [ ] Settings screen: AI mode (api/cli), provider, API key stored in OS keychain
- [ ] `ai_run` Rust command — single abstraction dispatching API and CLI modes

**Profile**
- [ ] Profile editor: form over `profile.md` (Markdown), stored in SQLite `profile` table
- [ ] Compressed `scoring_json` generated from profile (cached, 0 tokens on re-open)

**Job intake**
- [ ] User pastes job text/URL; Rust parses + deduplicates via `jd_hash`
- [ ] Hard filter (location, visa, language, salary) runs in code — 0 tokens
- [ ] Recruiter-style AI score: rubric, missing keywords, red flags, ATS filter check
- [ ] AI scoring result cached in `scoring_cache`; re-open = 0 tokens

**CV tailoring**
- [ ] Three-pass tailoring wizard: XYZ rewrite → dual critique → build
- [ ] Cover letter generation
- [ ] Export to DOCX and PDF
- [ ] Generated docs stored in `generated_docs` table and `companies/<co>/cv/`

**Kanban pipeline**
- [ ] Kanban board: saved → applied → interview → offer / rejected (Angular CDK Drag & Drop)
- [ ] Drag card between columns updates `applications.status` — 0 tokens
- [ ] Status changes auto-timestamped; `status_history` table records every change
- [ ] Funnel counts above columns (SQL `GROUP BY status`)

**i18n**
- [ ] i18n scaffolding with Angular i18n / ngx-translate; EN + DE from launch
- [ ] UI language stored in `settings.ui_language`
- [ ] Per-application document language (`applications.doc_language`) — separate from UI language
- [ ] AI output language passed explicitly in every prompt

**Result caching**
- [ ] All AI results cached by `input_hash`; re-open and re-score cost 0 tokens

### Out of Scope

- LinkedIn / Indeed / Glassdoor / StepStone connectors — no public API, ToS violation risk; manual paste covers ~90% of need
- Auto-submit / click "apply" on behalf of user — augmentation principle, never automation
- Interview prep (stages, study-cards, STAR+R) — v2
- CLI-bridge AI mode — v2 (API mode ships first; abstraction is ready for it)
- Agentur für Arbeit PDF export — v2 (schema supports it; no UI yet)
- Analytics dashboard — v2
- Tier-2 job sources (Remotive/WWR/Himalayas APIs/RSS) — v2
- Remaining UI languages (RU/ES/FR/UK) — v2 (architecture ready from day one)
- Company research subsystem — v2
- Gmail integration — later
- STAR+R story bank — later
- Local RAG / long-term memory — vision horizon
- Plugin architecture / marketplace — vision horizon
- MCP integration layer — vision horizon

## Context

- Solo developer project; must be maintainable by one person.
- Tech stack already decided: Tauri 2 · Rust 2021 · Tokio · SQLite (sqlx) · Angular 19 · TypeScript · NgRx Signals · Angular CDK.
- AI prompts live in versioned Markdown skill files bundled with the app (lightweight skills pattern from day one).
- Offline-first: core workflows (kanban, export, filters) never call the network.
- Token economy is architectural: code does everything deterministic; AI is called only for scoring, tailoring, and prep — and results are always cached.
- Repository currently private on GitHub; made public after job change. MIT license.
- Distribution via GitHub Releases + Tauri 2 auto-updater; landing page on Cloudflare Pages.
- Dogfooding is the primary quality signal: Vitalii uses it in his own job search.

## Constraints

- **Privacy**: all user data stays on-device; no telemetry; no cloud sync — hard requirement
- **Legality**: no scraping of closed job boards (LinkedIn, Indeed, StepStone); manual paste only for MVP
- **Offline**: core workflow must function with no network access
- **Token budget**: AI called only where code cannot substitute; results always cached
- **Solo maintenance**: no abstractions or subsystems that require a team to maintain
- **Augmentation principle**: every feature must make the user stronger, not substitute for them

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Angular + Nx monorepo | Core strength; clean senior-frontend showcase; Nx for future apps/libs | — Pending |
| Tauri 2 (not Electron) | Tiny binary, Rust backend, secure IPC, no Node.js overhead | — Pending |
| SQLite via sqlx (Rust) | One file, zero-config, local-first, no migration headaches | — Pending |
| Angular CDK for kanban | Official drag-and-drop, no third-party kanban library | — Pending |
| Skills as Markdown files | Keeps prompts out of code, cheap architecture, enables user-authored skills later | — Pending |
| API mode first, CLI-bridge v2 | Simpler to ship; abstraction already in place for CLI layer | — Pending |
| Manual paste (no scraping) | Legal safety, covers ~90% of real need, no ToS exposure | — Pending |
| EN + DE i18n from day one | Architecture decision: costs little now, impossible to retrofit later | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-26 after initialization*
