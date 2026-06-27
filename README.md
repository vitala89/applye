# Applye

**Your job search. Your data. Your AI.**

A free, local-first desktop application for AI-powered job tracking and preparation.
Built with Tauri 2 + Angular. All data stays on your machine.

> **Status:** Private — will be published after the author's job change.

---

## What it does

Paste a job description → get a blunt recruiter-style score → tailor your CV → prepare for
interviews → track your pipeline. AI advises; you decide.

Core principle: **augmentation, not automation.** The app never applies for you, never inflates
your experience, never substitutes for your judgement.

---

## Privacy & Keys

- All data lives in a local SQLite file on your machine. No cloud, no telemetry.
- AI API keys are stored in the OS keychain (macOS Keychain, Windows Credential Vault, GNOME Secret).
  They are never logged, never written to disk in plaintext.
- You bring your own AI: CLI subscription (Claude Code / Codex / Gemini CLI) or your own API key.
  The app never signs up for anything on your behalf.

---

## Job Source Legality

This app operates on a **paste-first** model (Tier 1):
- You copy a job from wherever you see it in your browser and paste the text.
- No scraping of closed job boards. No breach of terms of service.
- Tier 2 (friendly APIs/RSS) and Tier 3 (public ATS pages) are planned for v2 with explicit ToS review.

See `ROADMAP.md §11` for details.

---

## Token Economy

AI is only called where genuine judgement is needed. Everything else is plain code:

- Parsing and deduplication: **0 tokens** (Rust regex)
- Hard filtering (location, visa, language): **0 tokens** (code)
- Pipeline kanban drag: **0 tokens** (DB write)
- Analytics dashboard: **0 tokens** (SQL)
- Scoring, tailoring, interview prep: minimal tokens, cached, user-triggered

---

## How to run locally

> Prerequisites: Node.js 22+, Rust 1.77+, and platform build tools (Xcode on macOS / Visual Studio Build Tools on Windows).

```bash
# Install dependencies
npm install

# Desktop app (Tauri + Angular dev mode)
npm run desktop:dev

# Web landing site
npm run web:dev

# Tests
npm test

# Lint
npm run lint
```

---

## Tech Stack

| Layer | Choice |
|---|---|
| Shell | Tauri 2 |
| Frontend | Angular 21 (standalone components, Signals) |
| State | NgRx SignalStore |
| Backend | Rust (Tokio) |
| Database | SQLite via sqlx |
| Drag & Drop | Angular CDK |
| Key storage | OS keychain (keyring crate) |
| i18n | ngx-translate (en, de, ru, es, fr, uk) |

---

## License

MIT — see `LICENSE`.
