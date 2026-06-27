# Applye — Project Roadmap

**applye.dev** · A free, open-source, local-first desktop application for an AI-powered
job search. Built with Tauri 2 + Angular. All data stays on the user's machine. The user
brings their own AI (CLI subscription or API key). No business model — a portfolio project
and a genuinely useful personal tool.

> Inspired by the methodology of career-ops.org (CLI-based), but with a graphical
> interface for people who don't live in the terminal, plus a deeper interview-prep
> and German-market layer.

---

## 0. Core Philosophy — Augmentation, not Automation

**Applye does not try to replace the person. It makes the person stronger on the job market.**

This is the lens through which every other principle is read — not a slogan, a design constraint.

- The AI does **not** make decisions for the user. It acts as a well-informed advisor — an
  experienced recruiter, career consultant, technical interviewer, and assistant — but the
  **final decision always stays with the human, by design, not by courtesy.**
- The AI does not claim to understand the user's career better than they do. It lacks the user's
  context, history, and real priorities — the user has those. So the AI prepares material and gives
  honest assessment; the person judges and acts.
- This is why the app **never auto-submits**, why the HR check is a blunt honest mirror rather than a
  gatekeeper, why prep produces study-cards the user *learns from* (not "AI does the interview for you"),
  and why everything is local and bring-your-own-AI: the user's career is never handed to a black box.
- Deliberately anti-hype. The AI is an excellent assistant and a poor judge of someone's life.
  Applye is honest about that line — which is exactly why engineers can trust it.

> Every feature must strengthen the human, not substitute for them. If a feature makes the user more
> dependent rather than more capable, it does not belong in Applye.

---

## 1. Vision & Principles

- **Augmentation, not automation.** (See §0 — the lead principle.) AI advises; the human decides.
- **Local-first.** Everything lives in a local SQLite database on the user's machine. No cloud, no telemetry, no account.
- **Bring your own AI.** Two modes: CLI-bridge (Claude Code / Codex / Gemini CLI by subscription, zero API tokens) or Direct API (user pastes their own key).
- **Free forever.** MIT-licensed. No paid tier. A portfolio piece and a personal tool.
- **Token-economical by design.** AI is only called where genuine judgement is needed. Everything else is plain code (0 tokens). Results are cached.
- **Honesty over inflation.** Never invent or exaggerate experience. The user always submits manually — the app never clicks "apply" for them.
- **Privacy & legality first.** Especially relevant for German / EU context (GDPR, visa situation). No scraping of closed job boards.

### Decision filter (every architectural choice must pass)
1. Does it improve the job search?
2. Does it respect user privacy?
3. Does it work locally?
4. Does it save tokens?
5. Can it extend via Skills / Plugins / MCP?
6. Does it fit Local-First?
7. **Does it strengthen the human rather than replace them?**

If the answer is "no", it does not belong in Applye.

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Shell | **Tauri 2** | Tiny binary, Rust backend, secure, web frontend |
| Frontend | **Angular + TypeScript** | Core strength; clean senior-frontend showcase |
| State | **SignalStore (NgRx)** | Existing stack |
| Backend | **Rust (Tauri commands)** | Keys, AI dispatch, files, DB access |
| Database | **SQLite** (via `rusqlite`/`sqlx` in Rust) | One file, zero-config, local-first |
| Drag & drop | **Angular CDK Drag and Drop** | Official, no extra deps, canonical kanban pattern |
| Key storage | **OS keychain** (`keyring` crate) | Keys never in plaintext, never logged |
| Documents | DOCX-first → PDF (existing pipeline) | ATS reliability |

---

## 3. AI Architecture — Two Modes, One Abstraction

The frontend never knows which mode produced an answer. A single Rust command dispatches.

```
Angular AiService.run(req)  ->  invoke('ai_run', { req })
                                      |
                          +-----------+-----------+
                          |                       |
                    mode = 'api'             mode = 'cli'
                    reqwest -> provider      tokio::process -> claude/codex/gemini
```

- Adding a new provider = one branch in Rust, zero Angular changes.
- CLI adapters live behind a `CliAdapter` trait (command, build_args, parse_output).
  Exact headless flags per CLI must be checked against current docs at build time —
  they change and should not be written from memory.

### Skill files (start simple, early)
Every AI task's prompt lives in a **versioned Markdown skill file** bundled with the app
(`skills/job-scoring.md`, `ats-check.md`, `resume-tailoring.md`, ...). The app loads the file,
injects context (profile, JD, language), and sends it. This shapes the architecture cheaply from
day one and keeps prompts out of code. The *heavy* evolution — user-authored skills, a skill
registry — is vision-horizon (§13). MVP just needs the file-loading pattern.

---

## 4. Token Economy (built into the foundation, not bolted on)

**Core rule: don't call AI where code suffices.**

| Task | Tokens | How |
|---|---|---|
| Parse pasted job text/URL | 0 | Rust regex/DOM parsing |
| Deduplicate jobs | 0 | UNIQUE index on `jd_hash` |
| Hard filter (location, visa, language, salary) | 0 | Plain code, before scoring |
| First-pass ATS check (hyperref, fonts, formatting) | 0 | Rules, not judgement |
| Pipeline analytics / funnel | 0 | SQL `GROUP BY` |
| Final rubric scoring | low | Only jobs that passed the code filter |
| Tailoring / cover letter / pitch | medium | On demand only |

**Additional techniques**
- **Compressed scoring profile** (`scoring_json`) instead of the full `profile.md` in every request.
- **Prompt caching** (API mode): same profile prefix across many jobs → cheaper repeats. Verify rates/TTL against current docs.
- **Structured short output**: JSON + short rationales; full breakdown only on demand, as a separate request.
- **Model tiering**: cheap model (Haiku-class) for routine (HR-screen questions, rough scoring), strong model for tailoring / system design. User picks "economy / quality"; economy is default for routine.
- **Result cache as a DB table** (`scoring_cache`, `interview_prep`, `generated_docs`): re-opening = 0 tokens.
- **Token counter** shown in API mode (cost transparency + nice portfolio touch).

```
Pasted job
  -> [Rust] parse + hard filter (0 tokens)
  -> passed? [Rust] cache check by hash (0 tokens if hit)
  -> miss? [AI] score (cheap model, JSON, cached profile prefix)
  -> user expands? [AI] detailed breakdown on demand (separate request)
```

---

## 5. The Core Job Flow (paste -> HR check -> tailor)

This is the heart of the daily loop. Mirrors the existing three-pass methodology.

1. **User pastes** a job (text or URL) and clicks the button. (App never auto-fetches from closed boards.)
2. **Code parses + hard-filters** (0 tokens). Obvious mismatches stop here.
3. **AI acts as a blunt recruiter — no fluff, sharp and concrete:**
   - Recruiter-style score (rubric, point-by-point deductions).
   - Top missing keywords.
   - Hiring-manager red flags.
   - **ATS filter pass** (the real Endress+Hauser hyperref lesson encoded as a check).
   - The tone is deliberately direct — how an HR screener actually reads, not encouragement.
4. **AI then offers to act:** create / modify / rewrite the CV (and cover letter) tailored to this vacancy — the three-pass pipeline (XYZ rewrite → dual critique → build).
5. User reviews, edits, exports, and **submits manually**.

---

## 6. Interview Preparation (a key edge over career-ops)

After a job moves to `applied`, the user enters preparation.

- **User-defined stages.** Different companies have 2/3/4 rounds. The user adds as many stages as needed and picks a type per stage: `hr_screen / technical / system_design / behavioral / final`. (0 tokens — just DB rows.)
- **On-demand generation per stage.** "Give me 10 Q&A" or "10 STAR+R". Stage type changes the prompt focus (HR screen ≠ technical round).
- **Study-card format** (preferred): AI writes both the question and a full answer with code examples, for reading and memorization — not interactive Q&A.
  - Technical → Q&A with code blocks.
  - Behavioral → STAR+R (Situation, Task, Action, Result, Reflection), German culture-fit aware.
- **Self-introduction / elevator pitch:**
  - One **default pitch** generated once from the profile (30s / 60s / 2min options).
  - **Per-application adapted pitch** tuned to the JD. Manual edits lock auto-regeneration.
- **STAR+R story bank:** behavioral stories generated once can be marked "to bank" and reused across future companies with 0 new tokens.
- **Everything cached** by `input_hash`. Re-opening = 0 tokens. "Give me 5 more" appends rather than regenerates.

---

## 7. Pipeline UI — Kanban (Angular CDK)

- The pipeline IS a kanban by nature: `saved -> applied -> interview -> offer / rejected`.
- Drag a card between columns = update `applications.status`. **0 tokens** — pure DB write.
- The `interview` column can expand sub-stages (1st / 2nd / final).
- Counts above columns = funnel analytics via `GROUP BY status`.
- Built on **Angular CDK Drag and Drop** (`cdkDropList` + `cdkDrag` + `transferArrayItem`). No third-party kanban library.
- **No Scrum/agile ceremony** (sprints, story points) — wrong tool for personal job tracking. Clean kanban only.

---

## 8. Automatic Status Dates & Documents

- **Status changes are timestamped automatically** at the moment of action (drag to applied → application date recorded). Feeds accurate reporting.
- `status_history` table logs every status change with `changed_at`.
- **Document exports** (user chooses format; manual first, auto later):
  - CV / cover letter — DOCX-first → PDF (existing pipeline).
  - Interview prep (pitch, Q&A, STAR cards) — exported as **PDF** (verso-card layout for memorization) or Markdown.
  - Saved to `companies/<company>/cv/` and `companies/<company>/prep/`.

---

## 9. Agentur für Arbeit Report (needed in real life, near-core)

German benefit recipients must document Eigenbemühungen (proof of job-search effort).

- Pure export from `applications` JOIN `jobs`, filtered by period. **0 tokens.**
- Official-looking layout: period, applicant name, generated date, and a table of
  date applied / company / position / method / status / contact.
- Formats: **PDF** (print and submit — primary), **xlsx** (table), optional DOCX.
- Accuracy comes from auto-recorded dates + `status_history` — real events, not recalled ones.
- `doc_type = 'arbeitsagentur_report'` in `generated_docs`.

---

## 10. Analytics Dashboard (cheap, motivating, actionable)

All from existing data via SQL. 0 tokens. Keep it lean — 5-6 meaningful metrics, not 20 for show.

**Progress & motivation**
- Funnel: saved → applied → interview → offer (the single most valuable chart).
- Activity over time: applications per week (also feeds the Agentur report).
- Counters: total applied, active processes, awaiting reply, interviews this week.

**Insight (what to improve)**
- Conversion rate applied → interview (honest mirror of CV/targeting quality).
- Average time-in-status (when to follow up).
- Breakdown by source (where interviews actually come from).

**Avoid:** vanity metrics, charts for decoration. A clean dashboard reads as more mature.

---

## 11. Job Sources — Legality First (esp. Germany / EU)

**Hard truth:** closed boards cannot be connected.

| Source | Connector possible? | Notes |
|---|---|---|
| LinkedIn | **No** | No job-search API for third parties; scraping breaches ToS, actively litigated |
| Indeed | **No (practically)** | Public API closed/restricted to employer partners |
| Glassdoor | **No** | Public API effectively withdrawn |
| StepStone (DE) | **No** | No public API for job-seeker apps |

**Three legal tiers instead:**

- **Tier 1 — Manual paste (MVP, 100% clean).** User copies a job from anywhere (LinkedIn, StepStone, any board) and pastes text/URL. The user brings what they already see in their browser; no scraping. Covers ~90% of real need with zero risk.
- **Tier 2 — Friendly APIs / RSS (early v2, legal by design).** Remotive, We Work Remotely, Himalayas — public APIs/RSS feeds built for machine reading.
- **Tier 3 — ATS scrapers, career-ops model (late v2 / later, with care).** Greenhouse / Lever / Ashby company career pages — public, structured employer hiring pages, not aggregators. Formats change; always read each source's ToS.

**Search is code, not AI.** RSS/ATS/paste parsing is deterministic Rust (0 tokens). AI only acts *after* a job is in the DB (scoring, tailoring). "Auto-search jobs by prompt" is a costly myth — code collects, AI evaluates.

### Geographic filtering
User chooses scope on top of the source tiers: **Worldwide / Europe / EU / USA / specific countries**.
Stored in `settings.geo_scope` + `geo_filters` (selectable country codes, plus `remote`).
Useful for the visa case: "Germany + remote-EU". Sources carry `geo_tags_json`, so collection
respects the active scope automatically.

### User-added sources
Users can add their own **RSS feeds** or **company career pages** (Greenhouse / Lever / Ashby).
Stored in `sources` (`is_builtin = 0`). Makes the system extensible without app updates — each user
builds their own board set. UI gently steers toward legal source types (RSS / public career pages)
and shows a `legality_note`; it does not encourage adding sources that breach ToS.

---

## 11b. Internationalization (i18n)

Launch languages: **English, German, Russian, Spanish, French, Ukrainian.**

- **UI language** via Angular i18n / `@ngx-translate` — UI strings in per-language JSON.
  JetBrains Mono + Inter both cover Latin (with diacritics) and Cyrillic, so no font swapping needed.
- **Critical separation: UI language ≠ output language.** The user may run the interface in Russian
  but generate the CV / cover letter / pitch / prep in German or English because they're applying to a
  German company. AI output language is chosen per item, not globally.
- **Three independent language levels** (this matters — one application can mix languages):
  - **UI language** — global, `settings.ui_language`.
  - **Document language** — per application, `applications.doc_language` (CV, cover letter). Matches the JD/market.
  - **Interview-stage language** — per stage, `interview_stages.stage_language` (Q&A, STAR, pitch).
    Real case: same company, HR screen prepared in German, technical round in English.
  - Pitches carry their own `language` too — a user may keep a German and an English pitch in parallel.
- Language is part of the cache `input_hash`, so switching language generates fresh cards rather than
  returning a wrong-language cached result.
- Language is passed **explicitly** into the AI prompt (don't let the model guess). Negligible token cost.
- Example real flow: Ukrainian user, Russian UI, applies to a German firm, English JD → English CV,
  German HR-screen prep, English technical prep.

---

## 12. Database Schema (consolidated)

```sql
-- Profile-level (source of truth)
CREATE TABLE profile (
  id INTEGER PRIMARY KEY,
  full_md TEXT,
  scoring_json TEXT,        -- compressed profile for scoring (generated once)
  scoring_hash TEXT,        -- cache invalidation
  updated_at TEXT
);

CREATE TABLE story_bank (
  id INTEGER PRIMARY KEY,
  title TEXT,
  star_situation TEXT, star_task TEXT, star_action TEXT,
  star_result TEXT, star_reflection TEXT,
  tags_json TEXT,
  created_at TEXT
);

-- Jobs
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY,
  company TEXT, title TEXT,
  jd_text TEXT,
  jd_hash TEXT UNIQUE,      -- dedupe (0 tokens)
  source TEXT, location TEXT, language TEXT,
  salary_min INTEGER,
  blue_card_eligible INTEGER,
  hard_filter_passed INTEGER,
  created_at TEXT
);

CREATE TABLE scoring_cache (
  id INTEGER PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id),
  profile_hash TEXT, jd_hash TEXT,
  score REAL,
  dimensions_json TEXT,
  missing_keywords_json TEXT,
  red_flags_json TEXT,
  model_used TEXT,
  tokens_input INTEGER, tokens_output INTEGER,
  created_at TEXT,
  UNIQUE(job_id, profile_hash, jd_hash)
);

-- Applications
CREATE TABLE applications (
  id INTEGER PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id),
  status TEXT,              -- saved/applied/interview/offer/rejected
  application_method TEXT,  -- online_form/email/portal
  applied_at TEXT,
  follow_up_at TEXT,
  cv_path TEXT, cover_letter_path TEXT,
  contract_type TEXT, eor_provider TEXT,
  doc_language TEXT,        -- AI output language for this application's docs (overrides default)
  notes TEXT, updated_at TEXT
);

CREATE TABLE status_history (
  id INTEGER PRIMARY KEY,
  application_id INTEGER REFERENCES applications(id),
  status TEXT,
  changed_at TEXT          -- auto-set
);

-- Interview
CREATE TABLE interview_stages (
  id INTEGER PRIMARY KEY,
  application_id INTEGER REFERENCES applications(id),
  stage_order INTEGER,
  stage_type TEXT,         -- hr_screen/technical/system_design/behavioral/final
  stage_label TEXT,
  scheduled_at TEXT,
  status TEXT,             -- upcoming/done
  stage_language TEXT,     -- prep language for THIS stage (HR call in DE, tech round in EN...)
  interviewer_name TEXT,   -- (Gmail later)
  interviewer_role TEXT,
  interviewer_email TEXT,
  notes TEXT
);

CREATE TABLE interview_prep (
  id INTEGER PRIMARY KEY,
  stage_id INTEGER REFERENCES interview_stages(id),
  format TEXT,             -- qa/star
  language TEXT,           -- language this card was generated in (part of input_hash)
  question TEXT, answer TEXT,
  star_situation TEXT, star_task TEXT, star_action TEXT,
  star_result TEXT, star_reflection TEXT,
  input_hash TEXT, model_used TEXT,
  created_at TEXT
);

CREATE TABLE pitches (
  id INTEGER PRIMARY KEY,
  scope TEXT,              -- default/application
  application_id INTEGER REFERENCES applications(id),
  language TEXT,           -- pitch language (a user may keep pitches in several languages)
  pitch_text TEXT,
  duration_hint TEXT,     -- 30s/60s/2min
  input_hash TEXT,
  is_user_edited INTEGER,
  model_used TEXT,
  created_at TEXT, updated_at TEXT
);

CREATE TABLE company_research (   -- v2
  id INTEGER PRIMARY KEY,
  application_id INTEGER REFERENCES applications(id),
  summary TEXT, recent_news TEXT, culture_notes TEXT,
  smart_questions_json TEXT,
  input_hash TEXT, created_at TEXT
);

-- Cross-cutting
CREATE TABLE generated_docs (
  id INTEGER PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id),
  doc_type TEXT,          -- cv/cover_letter/pitch/interview_prep/arbeitsagentur_report
  export_format TEXT,     -- pdf/docx/md/xlsx
  input_hash TEXT,
  file_path TEXT,
  created_at TEXT
);

CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ai_mode TEXT,           -- api/cli
  provider TEXT,
  default_model TEXT, economy_model TEXT,
  auto_export_on_apply INTEGER DEFAULT 0,   -- future automation (off by default)
  auto_export_format TEXT DEFAULT 'pdf',
  export_dir TEXT,
  ui_language TEXT DEFAULT 'en',     -- interface language: en/de/ru/es/fr/uk
  default_doc_language TEXT DEFAULT 'en',  -- default AI output language (overridable per application)
  geo_scope TEXT DEFAULT 'worldwide' -- worldwide/europe/eu/usa/custom
);

-- Job sources (built-in + user-added)
CREATE TABLE sources (
  id INTEGER PRIMARY KEY,
  name TEXT,
  type TEXT,              -- rss / api / ats_greenhouse / ats_lever / ats_ashby / manual
  url TEXT,
  is_builtin INTEGER,     -- 1 = shipped (Remotive, WWR, Himalayas...), 0 = user-added
  is_enabled INTEGER DEFAULT 1,
  geo_tags_json TEXT,     -- ["worldwide"] / ["eu","de"] / ["usa"] for geo filtering
  legality_note TEXT,     -- legal tier reminder shown in UI
  created_at TEXT
);

-- Geo filter presets (countries selectable on top of scope)
CREATE TABLE geo_filters (
  id INTEGER PRIMARY KEY,
  country_code TEXT,      -- de, us, fr... or 'remote'
  is_active INTEGER DEFAULT 1
);
```

---

## 13. Release Phasing

### MVP (build first)
- Tauri 2 + Angular skeleton; Settings screen with key entry (keyring working).
- `ai_run` abstraction; API mode + one provider end-to-end.
- Profile editor (form over `profile.md`) + compressed `scoring_json`.
- Paste job → hard filter → recruiter scoring + ATS filter (the blunt HR pass).
- Tailoring wizard (XYZ → dual critique → build) + DOCX/PDF export.
- Tracker as a kanban (CDK) with auto status dates + `status_history`.
- Local result cache everywhere.
- **i18n scaffolding** + EN/DE from the start (architecture ready for all 6 languages).
- Per-application document language (output language separate from UI language).

### v2
- CLI-bridge mode (second layer over the AI abstraction).
- Interview prep: stages, study-card Q&A / STAR+R, default + adapted pitch.
- Export interview prep to PDF (card layout).
- **Agentur für Arbeit report** (PDF/xlsx) — pull forward, needed in real life.
- Analytics dashboard (funnel, conversion, activity, sources).
- Tier-2 job sources (Remotive / WWR / Himalayas APIs & RSS).
- **Geo filtering** (Worldwide / Europe / EU / USA / countries) + **user-added sources**.
- Remaining UI languages (RU / ES / FR / UK).
- Company research subsection.

### Later
- Gmail integration (interviewer name/role/context — public professional info only, GDPR-careful; no personality profiling).
- Auto-export on `applied` (settings flag already in schema).
- STAR+R story bank reuse across companies.
- Weighted A–F scoring; ghost-job legitimacy checks; explicit dedup logic.
- Tier-3 ATS scrapers (Greenhouse / Lever / Ashby), per-source ToS review.

### Vision horizon (aspirational — the "Career OS", NOT near-term)
These define the long-term north star. Each is a subsystem the size of its own project, so they
are deliberately parked beyond `later`. **Do not start any of these until the core loop ships and
is genuinely used.** They are written down so the vision isn't lost, not so they're built soon.
- **Skills-driven architecture.** All AI logic lives in versioned Markdown skill files
  (`job-scoring.md`, `ats-check.md`, `resume-tailoring.md`, `interview-hr.md`, `star-r.md`, ...),
  each with version / description / inputs / output format / recommended model / language.
  Eventually users author their own skills. *(Lightweight version starts early — see note below.)*
- **Local RAG.** Index the user's own corpus (profile, resumes, JDs, applications, notes, stories,
  company research) locally; feed only relevant context into prompts — cheaper and higher quality.
- **Long-term memory.** Local memory of preferences, constraints, past decisions, lessons learned,
  successful interviews — part of RAG.
- **Plugin architecture + marketplace.** Small core, optional plugins (Interview, Gmail, GitHub,
  LeetCode, German/USA market packs, resume templates, analytics extensions).
- **MCP integration layer.** Always optional, always explicit consent. Gmail, Calendar, GitHub,
  Notion, Obsidian, Filesystem, Browser, etc. Never required.

---

## 13b. How to Prioritize After MVP (build by need, not by excitement)

The MVP ships first. Everything after is chosen **by real need**, not by what's fun to build.
When deciding the next feature, score candidates against:

1. **Does Vitalii hit this pain in his own search right now?** (Dogfooding is the strongest signal.)
2. **Does it strengthen the human?** (Core philosophy, §0.)
3. **Effort vs. payoff** — small effort + high daily value wins over big effort + rare use.
4. **Does it unlock other features?** (Foundational beats cosmetic.)

**Likely first post-MVP features** (high need, moderate effort, immediate self-use):
- **Agentur für Arbeit report** — concrete real-world need; near-free once kanban + status dates exist.
- **Interview prep (stages + study-cards)** — used the moment any application reaches an interview.
- **CLI-bridge mode** — removes API cost for the daily driver; high payoff once the AI abstraction is in.

**Lightweight now vs. heavy later** — one nuance worth respecting:
- The **skill-files pattern** (prompts as versioned Markdown) should start *early and simple* — it's
  cheap and shapes the architecture. The heavy parts (user-authored skills, RAG, memory) come much later.
- **RAG / memory / plugins / marketplace** are vision-horizon. Resist starting them until the core loop
  is shipped and dogfooded — otherwise the "OS" ambition stalls the actual product.

---

## 14. Brand & Infrastructure

**Name:** Applye · **Domain:** applye.dev (Cloudflare Registrar) · **Repo:** private GitHub (public after job change)

`.dev` is on the HSTS preload list — browsers force HTTPS automatically. Good security signal out of the box.

### Distribution model (important)
Applye is a **desktop app** — downloaded and run on the user's machine. It is **not** a hosted
web service. No VPS/app hosting is needed. Infrastructure is intentionally minimal and near-free:

| Need | Solution | Cost |
|---|---|---|
| Domain | Cloudflare Registrar (applye.dev) | at-cost |
| Landing page + docs site | Cloudflare Pages (static) | free |
| App binaries (Win/Mac/Linux) | GitHub Releases | free |
| CI builds | GitHub Actions (Tauri action) | free |

All under the Cloudflare ecosystem + GitHub — no server to maintain.

### GitHub setup
- Private now; **public after the job change**.
- MIT `LICENSE`.
- Strong README: what it is, demo gif/screenshot, install, privacy/keys, source legality, token-economy.
- `.gitignore` for personal data + the SQLite DB file; `profile.example.md` instead of the real profile.
- **GitHub Actions** build Tauri for all three OSes on tag push (official Tauri action).
- **GitHub Releases** per version (`v0.1.0`) with signed binaries — also the auto-update source.

### Auto-updates
- **Tauri 2 built-in updater plugin** — no custom update server.
- Source: GitHub Releases + a small `latest.json` manifest (version + download links).
- App checks the manifest on launch → prompts user → downloads & installs.
- Updates are **cryptographically signed** with a private key (mandatory; Tauri supports it natively).
- Exact updater config (manifest format, key generation, flags) must be verified against
  current Tauri 2 docs at build time — the updater API has changed across versions; do not write from memory.

### Documentation
- **MVP:** docs live in the repo — README + `docs/` markdown. Enough for first users.
- **Later:** dedicated docs site (VitePress / Docusaurus / Starlight) hosted on Cloudflare Pages,
  generated from the same markdown. Write once, lives in both repo and site.

### Launch plan (each channel doubles as engineer visibility)
- **GitHub** itself — good README, tags, releases, trending.
- **vitaliikasap.com** — projects section with screenshots + GitHub link. Highest-value channel
  for the job-search goal: recruiters see a serious open-source project.
- **Show HN (Hacker News)** — local-first / open-source / bring-your-own-AI resonates (career-ops route).
- **Reddit** — r/jobsearch, r/cscareerquestions, r/SideProject, job-search subs.
- **LinkedIn** — professional network + signals activity to recruiters (double benefit).
- **dev.to / Hashnode** — "How I built a job-search tool with Tauri 2 + Angular" — promotes the
  project and demonstrates expertise simultaneously.

Strategic note: since the goal is half portfolio / half utility, prioritise channels that boost
both the project and Vitalii's visibility as an engineer — personal site + technical write-up + LinkedIn.

---

## 15. Repo Hygiene (for public release)

- Publish **after** the job change.
- `profile.example.md` instead of the real profile; `.gitignore` for all personal data + the SQLite file.
- MIT license.
- README sections: privacy/keys handling, legality of job sources, token-economy design.
- Provide DB export (copy SQLite file) + xlsx export so users never fear data loss.
