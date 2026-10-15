# Applye Project Context

For the daily operational planning, current branch focus, and status of active features, refer to the operational state file: [docs/product/CURRENT_STATE.md](../product/CURRENT_STATE.md).

## Product

Applye is an open-source, privacy-first job-search productivity app for German/EU job seekers. It helps people track applications, paste job descriptions for AI-assisted HR checks and resume tailoring, and prepare for interviews. Core workflows should run offline; AI features are opt-in and token-frugal.

## Tech Stack

- Nx monorepo.
- Tauri 2 desktop app with Rust backend and SQLite.
- Angular frontend with TypeScript, Angular CDK, signal stores in `libs/application`, and shared design-system libraries. NgRx is not used.
- Jest, ESLint, Prettier, Husky, and commitlint.

## Architecture Direction

- Prefer local-first and privacy-preserving defaults.
- Keep domain logic separate from UI and integration code.
- Treat job sources, notifications, sync, plugins, and AI integrations as explicit boundaries.
- Favor small, testable modules with clear data ownership.
- Shared contracts belong in `libs/core`.
- Desktop screen state and use-case orchestration live in `libs/application`. Production app code does not call `libs/data` directly. Stateless Tauri gateways live in `libs/data`. The enforced graph is `docs/architecture.md`.
- Shared UI should live in `libs/ui`.
- Translations should live in `libs/i18n`; avoid hardcoded user-facing strings.

## Privacy Principles

- Collect the minimum data needed for the workflow.
- Keep user-controlled storage and export paths clear.
- Avoid sending resumes, notes, contacts, job history, or application details to external systems without explicit user intent.
- Make sync, notifications, scraping/imports, plugins, MCP, and AI features privacy-reviewed before implementation.

## Planned Modules

- Desktop app: `apps/desktop`.
- Landing site: `apps/web`.
- Mobile: **no target and no directory**. The plan and its preconditions are in
  `docs/mobile-target.md`.
- Domain models and interfaces: `libs/core`.
- Desktop application state and use-case orchestration: `libs/application`.
- Stateless Tauri invoke wrappers and service abstractions: `libs/data`.
- Shared Angular components and tokens: `libs/ui`.
- Translations: `libs/i18n`.
- Versioned prompt/skill content: `libs/skills`. Markdown only, compiled into
  the Rust binary by `include_str!` rather than imported by TypeScript, so it is
  deliberately not an Nx project - see `docs/architecture.md`.
  The physical module map above is current. Future web and Company Intelligence libraries are accepted direction in ADR-0006 and ADR-0007, not extra directories.

## Design Sources

- CV Editor visual spec: Claude Design project "Страница редактирования CV" (`project_id: 0ca6fecb-ecb5-4ec3-9b21-abf332d381fa`, file `CV Editor.dc.html`). Before restyling CV editor UI, fetch this via the `claude-design` MCP (`get_project` / `list_files` / `read_file`) rather than guessing from screenshots alone.

## Development Commands

- `npm run desktop:dev`
- `npm run desktop:build`
- `npm run desktop:build:tauri`
- `npm run web:dev`
- `npm run web:build`
- `npm run mobile:dev`
- `npm test`
- `npm run lint`
- `npm run type-check`
- `npm run format`
- `npm run format:check`
- `npm run affected:test`
