# Applye — Project Instructions (Working Agreement & Build Guide)

This file is the working agreement for building Applye. It tells any developer or AI agent
**how** to build, in what order, and what rules never to break. Pair it with `ROADMAP.md`
(the *what*) — this file is the *how*.

---

## 0. Non-negotiable principles (never violate)

1. **Augmentation, not automation.** AI advises; the human decides. Never auto-submit, never
   decide for the user. If a feature makes the user more dependent rather than more capable, reject it.
2. **Local-first.** All user data lives in local SQLite on the user's machine. No cloud, no telemetry,
   no account, ever.
3. **Privacy by design.** Collect nothing. No analytics, no usage history, no documents leave the device.
4. **Bring your own AI.** Two modes only: Direct API (user's key) and CLI-bridge (user's local CLI).
   Applye never sells or bundles AI.
5. **Token economy.** Never call AI where plain code suffices. Cache by hash. Regenerate only when
   inputs change.
6. **Legal-first.** No scraping of closed boards. Manual paste + legal sources (RSS / official APIs /
   public ATS / user sources) only.
7. **Open-source first.** MIT. Code readable, forkable, extendable via Skills / Plugins / MCP.
8. **Ship the core, then build by need.** No vision-horizon subsystem (RAG, memory, marketplace)
   before the core loop ships and is dogfooded.

---

## 1. Tech stack (fixed for v1)

- **Monorepo:** Nx (matches Vitalii's senior daily stack; recruiter signal).
- **Desktop shell:** Tauri 2 (Rust backend, web frontend, tiny signed binary, built-in updater).
- **Frontend:** Angular + TypeScript, standalone components, Signals / SignalStore.
- **Mobile (later):** Tauri 2 mobile (iOS/Android) — same core, just don't close the door now.
- **Web landing:** Angular app for applye.dev (static, hosted on Cloudflare Pages).
- **Database:** SQLite, accessed from Rust (`rusqlite`/`sqlx`). Frontend never runs raw SQL.
- **Drag & drop:** Angular CDK.
- **Key storage:** OS keychain via `keyring` crate. Never plaintext, never logged.
- **Styling:** design tokens (CSS variables) from the Applye design system (monochrome + indigo).
- **Fonts:** JetBrains Mono (signature) + Inter (body) — both OFL, bundled locally.

> Versions of Tauri plugins, the updater API, and CLI headless flags change frequently.
> Always verify against current official docs at implementation time — never write them from memory.

---

## 2. Monorepo layout (target)

```
applye/                         # Nx workspace root
├── apps/
│   ├── desktop/                # Tauri 2 + Angular (primary app)
│   │   ├── src/                # Angular frontend
│   │   └── src-tauri/          # Rust backend (commands, db, ai, files)
│   ├── web/                    # Angular landing site for applye.dev
│   └── mobile/                 # (placeholder) Tauri 2 mobile — scaffold later
├── libs/
│   ├── core/                   # domain models, types, interfaces (framework-agnostic)
│   ├── data/                   # Tauri invoke wrappers, DB/AI service abstractions
│   ├── ui/                     # shared Angular components + design tokens
│   ├── i18n/                   # translations (en/de/ru/es/fr/uk)
│   └── skills/                 # markdown skill files (prompts), versioned
├── tools/                      # scripts, generators
├── ROADMAP.md
├── INSTRUCTIONS.md             # this file
└── nx.json / package.json / tsconfig.base.json
```

Shared libs are the point of the monorepo: `core`, `data`, `ui`, `i18n`, `skills` are imported by
desktop, web, and (later) mobile — write once, reuse everywhere.

---

## 3. Build order (strict — each step must run before the next)

**Phase 0 — Foundation**
1. Nx workspace + Angular desktop app shell.
2. Tauri 2 integrated (`src-tauri`), `tauri dev` runs the Angular app in a window.
3. Design tokens in `libs/ui` (colors, type scale, spacing). Dark + light themes.
4. App shell UI: sidebar nav + topbar (from ROADMAP §Shell).

**Phase 1 — Data spine**
5. `db.rs`: all tables from ROADMAP §12 + migrations.
6. Tauri commands: profile CRUD, jobs CRUD, applications CRUD, settings.
7. `libs/data`: typed `invoke()` wrappers so Angular never touches SQL.
8. Keyring command: store/retrieve provider key securely.

**Phase 2 — AI spine**
9. `ai_run` command (dispatch). Start with Direct API + one provider, end-to-end.
10. Skill-file loader (markdown → prompt with injected context + language).
11. Settings screen: provider/key/model + economy/quality toggle + languages.

**Phase 3 — Core loop (the MVP value)**
12. Profile editor + compressed `scoring_json`.
13. Paste job → hard filter (code, 0 tokens) → recruiter scoring + ATS check (AI).
14. Scoring screen with cache by hash.
15. Tailoring wizard (XYZ → dual critique → build) + DOCX/PDF export.
16. Pipeline kanban (CDK) + auto status dates + `status_history`.

**Phase 4 — Polish & ship**
17. i18n wired (en/de first), empty/loading/error states.
18. README (privacy, source legality, token economy, augmentation principle).
19. GitHub Actions (Tauri build, 3 OSes), signed Releases, Tauri updater.
20. Web landing on applye.dev.

> MVP = Phases 0–3 working + Phase 4 minimum (README + one build). Everything in ROADMAP §13 v2/later
> is chosen afterward by the §13b prioritization filter (dogfooding need first).

---

## 4. Coding rules

- **Separation:** Angular = presentation + state. Rust = data, AI dispatch, files, keys. No SQL in
  the frontend; no business rules duplicated across the boundary.
- **One AI entry point:** everything goes through `ai_run`. Adding a provider = one Rust branch.
- **Cache everything AI-produced** by `input_hash` (includes language). Re-open = 0 tokens.
- **Prompts live in `libs/skills` as markdown**, never hardcoded in TS/Rust.
- **Three language levels** stay independent: UI / document / interview-stage (ROADMAP §11b).
- **No `localStorage`/`sessionStorage`** for real data — SQLite is the store.
- **Privacy in git:** `profile.example.md` only; `.gitignore` personal data + the `.sqlite` file.
- **Verify-don't-assume:** Tauri/Nx/plugin APIs from current docs at build time.

---

## 5. Definition of "done" for any feature

A feature is done when it: works locally offline (where applicable) · respects the augmentation
principle · caches AI output · has empty/loading/error states · is wired for i18n · leaks no personal
data into git · and passes the 7-question decision filter in ROADMAP §1.
