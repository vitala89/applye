# Contributing to Applye

Thanks for your interest in making Applye better. Issues, docs, translations, and code are all
welcome. This document explains how the project works and what a good contribution looks like.

## Ground rules

- Be kind. The [Code of Conduct](CODE_OF_CONDUCT.md) applies everywhere in this project.
- Security issues go to [SECURITY.md](SECURITY.md), never to a public issue.
- One principle is non-negotiable: **augmentation, not automation**. Applye never auto-applies,
  auto-sends, or auto-submits on the user's behalf. Features that break this rule will not be
  merged, no matter how well built.
- Privacy is a feature: no telemetry, no accounts, no cloud storage of user data. AI calls are
  opt-in and minimal. Contributions must keep it that way.

## Before you start

- For bugs, open an issue with steps to reproduce, expected vs actual behavior, and your OS.
- For features, open an issue first to discuss scope before writing code. This keeps you from
  spending effort on something that conflicts with the roadmap or the principles above.
- Check [ROADMAP.md](ROADMAP.md) and existing issues to avoid duplicates.

## Development setup

**Prerequisites:** Node 20+, Rust (stable, 2021 edition), and the
[Tauri 2 system dependencies](https://v2.tauri.app/start/prerequisites/) for your OS.

```bash
git clone https://github.com/vitala89/applye.git
cd applye
npm install

npm run desktop:dev      # Tauri + Angular desktop app in dev mode
npm run web:dev          # applye.dev site
```

Verify your changes:

```bash
npm test                 # Jest test suite (all projects)
npm run lint             # ESLint
npm run type-check       # TypeScript type checks
cd apps/desktop/src-tauri && cargo test   # Rust backend tests
```

## Project layout

An [Nx](https://nx.dev) monorepo:

- `apps/desktop` - Tauri 2 app: Angular frontend in `src/`, Rust backend in `src-tauri/`.
- `apps/web` - the applye.dev site (landing, docs, methodology).
- `libs/core` - domain models; `libs/data` - Tauri invoke wrappers; `libs/ui` - shared components
  and design tokens; `libs/i18n` - translations; `libs/skills` - versioned prompt content.

See [`docs/architecture.md`](docs/architecture.md) and the
[decision filter](docs/decision-filter.md) every change is checked against.

## Branch and commit conventions

- Branch from `main`: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `refactor/<topic>`.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) and are enforced by
  commitlint via Husky:

```
feat(discover): add location filter hierarchy
fix(paste): stop clobbering company on re-paste
docs(readme): add Polish translation
```

- Keep commits atomic: one logical change per commit.
- Do not use em dashes or en dashes in code, comments, commit messages, or docs; use a plain
  hyphen.

## Pull requests

1. Make sure `npm test`, `npm run lint`, and `npm run type-check` pass locally. If you touched
   Rust code, `cargo test` must pass too.
2. Update [CHANGELOG.md](CHANGELOG.md) under the current version with a short entry.
3. If behavior changed, update the relevant doc (`docs/`, `README.md`, or the site in `apps/web`).
4. Open the PR against `main` with a description of what changed and why. Screenshots for UI
   changes help a lot.
5. Reviews may push back on scope: small, focused PRs merge fastest.

## Translations

The desktop UI ships in English, German, Russian, Spanish, French, and Ukrainian
(`libs/i18n`). README translations live at the repo root (`README.<lang>.md`). Fixes to awkward
phrasing are as valuable as new languages - native-speaker polish is very welcome.

## What we will not merge

- Auto-apply, auto-submit, or any feature that acts toward a recruiter without a human click.
- Scraping of job boards, login bypasses, or bulk harvesting of postings.
- Telemetry, analytics beacons, accounts, or server-side storage of user data.
- Fabricated-experience features. Applye tailors truthfully; it does not invent.

## Questions

Open a [GitHub Discussion or issue](https://github.com/vitala89/applye/issues) - happy to help you
get started.
