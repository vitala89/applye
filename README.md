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
  <img src="https://img.shields.io/badge/version-0.29.0-4F5BFF?style=flat" alt="Version 0.29.0">
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
- [Where Discover looks](#where-discover-looks)
- [Screenshots](#screenshots)
- [Project structure](#project-structure)
- [Tech stack](#tech-stack)
- [Roadmap](#roadmap)
- [FAQ](#faq)
- [Contributing](#contributing)
- [About the author](#about-the-author)
- [Also open source](#also-open-source)
- [Disclaimer](#disclaimer)
- [License](#license)
- [Connect](#connect)

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

<p align="center">
  <a href="https://applye.dev/docs/guide/tour/">
    <img src="docs/assets/walkthrough-thumb.png" alt="Watch the first-run tour of Applye" width="800">
  </a>
  <br>
  <em>A silent six-screen tour of the first run, on applye.dev.</em>
</p>

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

## Where Discover looks

Applye ships with a set of built-in sources, and **every one of them starts switched off**.
Collection is an explicit choice: you enable the feeds that match your market, and nothing is
fetched until you do. Each source is a public API or RSS feed meant to be read by software, and
each carries a legality note in the app explaining why it is safe to read.

| Source                   | Type | Market    | Notes                                                     |
| ------------------------ | ---- | --------- | --------------------------------------------------------- |
| Remotive                 | API  | Worldwide | Remote-first listings, public API                         |
| We Work Remotely         | RSS  | Worldwide | Public RSS feed                                           |
| Himalayas                | API  | Worldwide | Remote-first listings, public API                         |
| Jobicy                   | RSS  | Worldwide | Public RSS feed                                           |
| Arbeitnow                | API  | Europe    | Public API, strong on German-language postings            |
| Bundesagentur für Arbeit | API  | Germany   | Official REST API of the German federal employment agency |
| No Fluff Jobs            | API  | Poland    | Public API, IT-focused                                    |
| DOU.ua                   | RSS  | Ukraine   | Public RSS feed                                           |
| Djinni.co                | RSS  | Ukraine   | Public RSS feed                                           |
| Habr Career              | RSS  | RU-market | Public RSS feed                                           |
| TrudVsem (Rostrud)       | API  | RU-market | Official public API                                       |

On top of these you can add **company career boards** directly: Greenhouse, Lever, Ashby and
Personio. Point Applye at a company's board and its openings join your Discover feed alongside
the aggregators. You can also add any custom RSS feed.

What Applye deliberately does **not** do: it does not scrape HTML job boards, does not log into
anything on your behalf, and does not harvest postings at scale. If a site does not publish a
machine-readable feed, Applye does not read it.

## Screenshots

| Dashboard                                                                               | Discover                                                                                                               |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| ![Dashboard](docs/assets/screens/dashboard.png) <br> _pipeline health + follow-ups due_ | ![Discover](docs/assets/screens/discover.png) <br> _the feed grouped by your target roles, with what each row matched_ |

| Job detail & recruiter check                                                                               | CV tailoring                                                                                                         |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| ![Job detail](docs/assets/screens/job-detail.png) <br> _missing keywords, the ATS check and the red flags_ | ![Tailoring](docs/assets/screens/tailoring.png) <br> _the wizard review step, with the tailored CV and cover letter_ |

| Pipeline kanban                                                                          | Analytics                                                                                                 |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| ![Pipeline](docs/assets/screens/pipeline.png) <br> _applied / interview / offer columns_ | ![Analytics](docs/assets/screens/analytics.png) <br> _counters, the application funnel and weekly volume_ |

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

![Tauri](https://img.shields.io/badge/Tauri_2-24C8DB?style=flat&logo=tauri&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-000000?style=flat&logo=rust&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat&logo=sqlite&logoColor=white)
![Angular](https://img.shields.io/badge/Angular_21-DD0031?style=flat&logo=angular&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Nx](https://img.shields.io/badge/Nx-143055?style=flat&logo=nx&logoColor=white)
![Jest](https://img.shields.io/badge/Jest-C21325?style=flat&logo=jest&logoColor=white)

See [`docs/architecture.md`](docs/architecture.md) for the layout and the
[decision filter](docs/decision-filter.md) every change is checked against.

## Roadmap

The near-term plan lives in [ROADMAP.md](ROADMAP.md); shipped work is tracked in
[CHANGELOG.md](CHANGELOG.md). Highlights ahead: richer Discover sources, deeper interview prep, and
installable release builds for all three platforms.

## FAQ

**What is Applye?**
Applye is a free, open-source, local-first desktop app for an AI-assisted job search. It scores
job postings against your profile, tailors your CV per role, drafts cover letters and follow-ups,
and tracks the whole pipeline on your own machine. It runs on Windows, macOS and Linux, and it
never applies to a job on your behalf.

**Is Applye free? Do I need an account?**
Yes, free and MIT-licensed, and there is no account. There is no sign-up, no server, and no
subscription - you download the app and it works. The only thing you may pay for is the AI you
choose to connect, and you pay your AI provider directly, never Applye.

**Does Applye apply to jobs for me?**
No, and it never will. Applye scores, drafts and suggests; you review, edit and submit. There is
no auto-apply, no auto-send and no background agent talking to recruiters under your name. That
human-in-the-loop rule is the product's first design principle, not a setting you can flip.

**Where is my data stored?**
In a local SQLite database on your machine, alongside the documents Applye generates. There is no
cloud, no sync and no telemetry. Nothing leaves the device unless you trigger an AI call, and then
only the minimum needed for that one request is sent to the provider you configured.

**Which AI providers does Applye work with?**
Bring your own: an Anthropic Claude or DeepSeek API key, or a local AI CLI bridge such as Claude
Code or Codex, which is also how OpenAI models are reached. Keys and billing stay yours. Every AI
feature is opt-in, and the app is fully usable with AI switched off.

**Can I use Applye without AI, or without internet?**
Yes. The dashboard, pipeline kanban, tracker, interview timeline, analytics and the deterministic
legitimacy check all run offline with zero tokens. AI is spent only where judgement is genuinely
needed, and only when you click.

**Does Applye scrape job boards?**
No. Discover reads public APIs and RSS feeds that are published for machine reading, plus company
career boards (Greenhouse, Lever, Ashby, Personio) you add yourself. It does not scrape HTML, does
not bypass logins, and does not harvest postings at scale. Every built-in source ships disabled.

**Is Applye only for Germany?**
No. It is built for the German and EU market first - there is an Eigenbemühungen report for the
Agentur für Arbeit, German-language documents and Blue-Card awareness - but the sources cover
worldwide, Polish, Ukrainian and RU-market feeds, and the interface speaks English, German,
Russian, Spanish, French and Ukrainian.

**Which platforms are supported?**
Windows, macOS (Apple Silicon and Intel) and Linux. Installers are published on the
[Releases page](https://github.com/vitala89/applye/releases); building from source is documented
in [Quick start](#quick-start).

## Contributing

Contributions are welcome - issues, docs, translations, and code.

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, branch flow, and commit conventions.
- Not sure where a question belongs? [SUPPORT.md](SUPPORT.md) routes it.
- Be kind: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Found a vulnerability? See [SECURITY.md](SECURITY.md) - please don't open a public issue.

**Applye helped you land something?**
[Tell the story](https://github.com/vitala89/applye/issues/new?template=applye-helped.yml) - it is
the only metric this project has, since nothing is measured inside the app.

## About the author

Applye is built by **[Vitalii Kasap](https://vitaliikasap.com)**, a frontend engineer based in
Germany, while running the exact job search the app is designed for. Every feature ships because it
was needed in a real search, not because it demos well.

## Also open source

- **[career-ops](https://github.com/santifer/career-ops)** by Santiago Fernández de Valderrama
  Aparicio - the project that made me want to build this. A brilliant CLI-first take on the same
  problem: it turns any AI coding CLI into a job-search command center. career-ops gives developers
  a CLI; Applye gives everyone a desktop. If you live in a terminal, go there and star it.

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

## Connect

[![Website](https://img.shields.io/badge/vitaliikasap.com-4F5BFF?style=for-the-badge&logo=safari&logoColor=white)](https://vitaliikasap.com)
[![LinkedIn](https://img.shields.io/badge/Vitalii_Kasap-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/vitaliikasap/)
[![X](https://img.shields.io/badge/@vitala89-000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/vitala89)
[![GitHub](https://img.shields.io/badge/vitala89-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/vitala89)
[![Discussions](https://img.shields.io/badge/Ask_a_question-Discussions-2ea44f?style=for-the-badge&logo=github&logoColor=white)](https://github.com/vitala89/applye/discussions)
