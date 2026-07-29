<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/wordmark-dark.svg">
    <img src="docs/assets/brand/wordmark-light.svg" alt="Applye" width="250" height="56">
  </picture>
</p>

<div align="center">

[English](README.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Українська](README.uk.md) | [Polski](README.pl.md)

</div>

<p align="center">
  <em>Companies use AI to filter candidates. Applye gives candidates a desktop to answer back.</em><br>
  <strong>Drafting is automated. Submitting is not.</strong>
</p>

<p align="center">
  <img src="docs/assets/hero-banner.png" alt="Applye desktop app - dashboard with active applications, overdue follow-ups and upcoming interviews" width="800">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.28.0-4F5BFF?style=flat" alt="Version 0.28.0">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License">
  <img src="https://img.shields.io/badge/Tauri-2-24C8DB?style=flat&logo=tauri&logoColor=white" alt="Tauri 2">
  <img src="https://img.shields.io/badge/Angular-21-DD0031?style=flat&logo=angular&logoColor=white" alt="Angular">
  <img src="https://img.shields.io/badge/Rust-2021-000000?style=flat&logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/SQLite-local--first-003B57?style=flat&logo=sqlite&logoColor=white" alt="SQLite">
  <br>
  <img src="https://img.shields.io/badge/No_account-required-2ea44f?style=flat" alt="No account">
  <img src="https://img.shields.io/badge/No_telemetry-ever-2ea44f?style=flat" alt="No telemetry">
  <img src="https://img.shields.io/badge/Your_AI-your_keys-4F5BFF?style=flat" alt="Bring your own AI">
</p>

<p align="center">
  <a href="https://applye.dev">Website</a> ·
  <a href="https://applye.dev/docs">Docs</a> ·
  <a href="https://applye.dev/methodology">Methodology</a> ·
  <a href="ROADMAP.md">Roadmap</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

---

<!-- PLACEHOLDER: demo GIF. A 30-45s screen capture of the core loop (paste JD -> recruiter check -> tailored CV -> pipeline), approx. 800px wide, saved as docs/assets/demo.gif. -->
<p align="center">
  <img src="docs/assets/demo.gif" alt="Applye demo - paste a job description, get a recruiter check, tailor the CV, track the application" width="800">
</p>

**Applye** is an open-source, local-first desktop app for an AI-powered job search. It scores roles
against your profile, tailors your CV per posting, drafts cover letters and follow-ups, preps you for
interviews, and tracks the whole pipeline - all on your machine. No cloud, no account, no telemetry.
You bring the AI you already pay for, and every submission stays a human decision.

Built for the German/EU market first, useful anywhere.

## Table of contents

- [Why Applye](#why-applye)
- [Features](#features)
- [Quick start](#quick-start)
- [Usage: the core loop](#usage-the-core-loop)
- [How it works](#how-it-works)
- [Screenshots](#screenshots)
- [Project structure](#project-structure)
- [Tech stack](#tech-stack)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [About the author](#about-the-author)
- [Disclaimer](#disclaimer)
- [License](#license)

## Why Applye

**Augmentation, not automation.** This is the first principle, and everything else bends to it.

AI assists. You decide. Applye will never auto-apply, auto-send, or auto-submit anything on your
behalf. It scores, drafts, and suggests - then hands control back to you. Every AI output is a
proposal you read, edit, and accept or throw away. No background agent is quietly representing you
to a recruiter.

Why this matters:

- A recruiter or hiring manager is a person, and the relationship is yours, not a bot's.
- Mass-automated applications are noise; a tool that helps you send _fewer, better_ ones is the point.
- You stay accountable for every word that goes out under your name.

If a feature ever requires giving up that control, it doesn't ship.

## Features

| Feature                      | What it does                                                                                                                                                                             | Tokens     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Dashboard**                | One screen with your pipeline health, follow-ups due, and recent activity.                                                                                                               | 0          |
| **Discover**                 | Scans your configured sources (Remotive, Himalayas, RSS feeds, Greenhouse, Lever, Ashby boards) over HTTPS, filters by keywords and geography locally, and shows a match score per role. | 0          |
| **Paste pipeline**           | Paste any job description; Applye parses company, title, salary, and language, runs a deterministic legitimacy check (ghost-job and scam signals), and files the role.                   | 0          |
| **Recruiter check**          | An opt-in AI read of the role vs your profile: fit score, missing keywords, red flags, and a blunt verdict before you invest time.                                                       | opt-in     |
| **CV tailoring**             | A multi-pass tailoring flow that adapts your profile to the posting - you review every change - exported to PDF.                                                                         | opt-in     |
| **Cover letters**            | A cover-letter draft per role, built from your profile and the posting, ready to review and export. You edit, you submit.                                                                | opt-in     |
| **Pipeline kanban**          | Applied, interview, offer - drag roles across stages; status history records itself.                                                                                                     | 0          |
| **Job tracker & follow-ups** | Every application with dates, statuses, notes, and follow-up drafts when a role goes quiet.                                                                                              | 0 / opt-in |
| **Interview prep**           | A timeline of interview stages per application - dates, interviewers, statuses, and your notes.                                                                                          | 0          |
| **Analytics**                | Funnel conversion, pipeline aging, where-you-are-applying breakdowns - computed locally from your own data.                                                                              | 0          |
| **German market tools**      | Eigenbemühungen report for the Agentur für Arbeit, German-language documents, Blue-Card awareness.                                                                                       | 0 / opt-in |
| **Multilingual UI**          | English, German, Russian, Spanish, French, Ukrainian.                                                                                                                                    | 0          |

The "Tokens" column is a design contract: everything marked **0** runs entirely offline with
deterministic code. AI is only spent where judgement is genuinely needed, and only when you click.

## Quick start

### Download

> **PLACEHOLDER: release links.** Installable builds (Windows `.msi`, macOS `.dmg`, Linux
> `.AppImage`/`.deb`) will be published on the
> [Releases page](https://github.com/vitala89/applye/releases) at public launch. Until then, build
> from source below.

### Build from source

**Prerequisites:** Node 20+, Rust (stable, 2021 edition), and the
[Tauri 2 system dependencies](https://v2.tauri.app/start/prerequisites/) for your OS. Add
[Git LFS](https://git-lfs.com) if you intend to build or deploy the website: the documentation's
screenshots and screen recordings are stored as LFS pointers, and a clone without it gets
132-byte stubs where the images and videos should be. The desktop app does not depend on them.

```bash
git clone https://github.com/vitala89/applye.git
cd applye
npm install

npm run desktop:dev      # launch the Tauri + Angular app in dev mode
```

Other useful scripts:

```bash
npm run desktop:build    # production build of the desktop app
npm run web:dev          # run the applye.dev site locally
npm test                 # run the test suite
npm run lint             # lint all projects
npm run type-check       # type-check all projects
```

AI features are off until you add a key or CLI bridge in **Settings**. The app is fully usable
without them.

## Usage: the core loop

1. **Paste** a job description (or let **Discover** surface roles from your sources).
2. **Check** - a deterministic legitimacy pass, then an opt-in AI recruiter read of the fit.
3. **Tailor** - a multi-pass CV adaptation you review line by line, exported to PDF.
4. **Apply** - you copy, you open the posting, you submit. Applye records it; it never clicks for you.
5. **Track** - the role moves across the pipeline kanban; follow-up drafts appear when things go quiet.
6. **Prep** - track every interview stage on a timeline and keep your notes per role.

<!-- PLACEHOLDER: video walkthrough. A 2-3 minute narrated walkthrough of the core loop, hosted on YouTube; embed the thumbnail here as docs/assets/walkthrough-thumb.png linking to the video. -->

## How it works

**Local-first and private.** Your profile, job list, notes, and generated documents live in a local
SQLite database on your machine. Core workflows work with no network at all. No accounts, no
telemetry, no cloud sync. Nothing about your search leaves the device unless _you_ trigger an AI
call, and even then only the minimum needed for that one request is sent. GDPR-friendly because
there is nothing to leak - there is no server holding your data.

**Bring your own AI.** Applye doesn't bundle a model or resell tokens. You wire in the AI you
already pay for:

- **API key** - point Applye at Anthropic Claude or DeepSeek with your own key.
- **CLI bridge** - or route through a local AI CLI you already have: Claude Code, or Codex, which
  is also how OpenAI models are reached.

Either way the keys are yours, the billing is yours, and you can run the whole app with AI features
switched off.

**Token economy.** AI is treated as a scarce, paid resource - not sprinkled everywhere:

- **Everything is cached.** Identical inputs never pay twice (`jd_hash -> scoring`, `input_hash -> output`).
- **Opt-in calls only.** Nothing hits a model until you ask it to.
- **Frugal prompts.** Features are scoped to the smallest useful request, so a real job search costs
  cents, not a subscription.

**On source legality.** Applye is a tool you point at job descriptions **you** are already looking
at. It does not scrape job boards, bypass logins, or harvest postings at scale. Discover fetches
only public APIs and feeds that are meant to be read by software. Respect the terms of service of
any site you use - the app is built to keep you on the right side of them by never automating
collection or submission.

## Screenshots

<!-- PLACEHOLDER: screenshot set. Capture each screen below at 1440x900 (light + dark), save under docs/assets/screens/, then replace the placeholder cells. -->

| Dashboard                                                                                                            | Discover                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| ![Dashboard](docs/assets/screens/dashboard.png) <br> _PLACEHOLDER: dashboard.png - pipeline health + follow-ups due_ | ![Discover](docs/assets/screens/discover.png) <br> _PLACEHOLDER: discover.png - feed with match scores and filters_ |

| Job detail & recruiter check                                                                                                   | CV tailoring                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| ![Job detail](docs/assets/screens/job-detail.png) <br> _PLACEHOLDER: job-detail.png - score ring, missing keywords, red flags_ | ![Tailoring](docs/assets/screens/tailoring.png) <br> _PLACEHOLDER: tailoring.png - diff-style CV review before export_ |

| Pipeline kanban                                                                                                      | Analytics                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| ![Pipeline](docs/assets/screens/pipeline.png) <br> _PLACEHOLDER: pipeline.png - applied / interview / offer columns_ | ![Analytics](docs/assets/screens/analytics.png) <br> _PLACEHOLDER: analytics.png - funnel + pipeline aging_ |

## Project structure

```
applye/
├── apps/
│   ├── desktop/          # Tauri 2 desktop app
│   │   ├── src/          # Angular frontend (dashboard, discover, jobs, pipeline, ...)
│   │   └── src-tauri/    # Rust backend: SQLite, scan engine, scoring, AI bridge
│   ├── web/              # applye.dev - landing, docs, methodology, changelog
│   └── mobile/           # placeholder for a future companion app
├── libs/
│   ├── core/             # domain models and interfaces
│   ├── data/             # Tauri invoke wrappers and service abstractions
│   ├── ui/               # shared Angular components and design tokens
│   ├── i18n/             # translations (en, de, ru, es, fr, uk)
│   └── skills/           # versioned prompt/skill content
├── docs/                 # architecture, product, and design docs
└── design-system/        # design source of truth for every screen
```

## Tech stack

| Layer         | Choice                                    | Why                                             |
| ------------- | ----------------------------------------- | ----------------------------------------------- |
| Desktop shell | [Tauri 2](https://v2.tauri.app)           | Native webview, tiny binaries, Rust backend     |
| Backend       | Rust 2021 + SQLite (sqlx)                 | Deterministic, fast, fully offline data layer   |
| Frontend      | Angular 21 + TypeScript                   | Signals, standalone components, strict types    |
| State         | NgRx Signals                              | Local, predictable UI state                     |
| Monorepo      | [Nx](https://nx.dev)                      | One repo for desktop, web, and shared libraries |
| Quality       | Jest, ESLint, Prettier, Husky, commitlint | Tests and conventional commits enforced         |

See [`docs/architecture.md`](docs/architecture.md) for the layout and the
[decision filter](docs/decision-filter.md) every change is checked against.

## Roadmap

The near-term plan lives in [ROADMAP.md](ROADMAP.md); shipped work is tracked in
[CHANGELOG.md](CHANGELOG.md). Highlights ahead: richer Discover sources, deeper interview prep, and
installable release builds for all three platforms.

## Contributing

Contributions are welcome - issues, docs, translations, and code.

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, branch flow, and commit conventions.
- Be kind: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Found a vulnerability? See [SECURITY.md](SECURITY.md) - please don't open a public issue.

## About the author

Applye is built by **[Vitalii Kasap](https://vitaliikasap.com)**, a frontend engineer based in
Germany, while running the exact job search the app is designed for. Every feature ships because it
was needed in a real search, not because it demos well.

**Also open source:** Applye's pipeline philosophy is openly inspired by
[career-ops](https://github.com/santifer/career-ops) by Santiago Fernández de Valderrama Aparicio -
a brilliant CLI-first take on the same problem. career-ops gives developers a CLI; Applye gives
everyone a desktop. If you live in a terminal, go star it.

## Disclaimer

Applye is a personal productivity tool. It does not guarantee interviews, offers, or employment. AI
outputs are drafts that can be wrong - review everything before you send it. Applye never submits
applications on your behalf and never fabricates experience; honesty over inflation is a design
rule, not a suggestion. This software is provided under the [MIT License](LICENSE) "as is", without
warranty of any kind. Applye is not affiliated with any job board, ATS vendor, or AI provider
mentioned in this document.

See [LEGAL_DISCLAIMER.md](LEGAL_DISCLAIMER.md) for the full disclaimer and acceptable-use terms.

## License

[MIT](LICENSE) © 2026 Vitalii Kasap
