# Applye Agent Instructions

Applye is an open-source, privacy-first job-search productivity app built as an Nx monorepo with Tauri 2, Angular, Rust, SQLite, TypeScript, and shared domain/UI/i18n libraries. Treat user career data, applications, notes, contacts, notifications, resumes, and imported job content as sensitive by default.

This repository adopts the Intentloom Duty Watch workflow. Start every non-trivial task at `docs/internal/AGENT_START_HERE.md`.

## Duty Watch entry sequence

Before any non-trivial work, read in order:

1. `docs/internal/AGENT_START_HERE.md`
2. `docs/internal/PROJECT_CONTEXT.md`
3. `docs/product/CURRENT_STATE.md`
4. the latest entry in `docs/internal/DUTY_WATCH.md`
5. `docs/governance/VALIDATION_MATRIX.md`
6. the smallest relevant roadmap, plan, ADR, design-system, specification, and code files

Do not begin from the user request alone. Verify branch, commits, open pull requests, code, and current state first.

## Conductor model

The main agent session is the conductor. It owns task framing, context selection, implementation decisions, verification, and the final response. Skills and subagents are specialists. They advise, review, or scout context; they do not replace the conductor and they do not perform broad implementation.

## Task types

- `simple`: small edits, direct answers, formatting, or local command checks.
- `feature`: user-facing or workflow behavior changes.
- `architecture`: module boundaries, data flow, durable interfaces, or migration planning.
- `debug`: reproduce, isolate, fix, and verify a defect.
- `test`: test strategy, coverage gaps, fixtures, or reliability work.
- `security`: auth, secrets, permissions, shell commands, dependencies, MCP, browser automation, or external tools.
- `privacy`: user data, local storage, sync, notifications, external job sources, plugins, or MCP.
- `docs`: README, project docs, AI docs, ADRs, and docs sync.
- `commit`: prepare a focused commit message and change summary.
- `branch finish`: final verification, release notes, docs sync, PR summary, and Duty Watch handoff.

## Canonical document roles

- `ROADMAP.md`: strategy, vision, and product principles.
- `docs/internal/INSTRUCTIONS.md`: working agreement and engineering rules.
- `CHANGELOG.md`: historical record of shipped changes.
- `docs/internal/PROJECT_CONTEXT.md`: durable product and architecture context.
- `docs/product/CURRENT_STATE.md`: the single operational state file. Check it before feature work and update it when project status changes.
- `docs/internal/DUTY_WATCH.md`: chronological handoff log between sessions and agents.

Do not create a duplicate `PROJECT_STATE.md`.

## Plan check, mandatory for every non-trivial task

Before implementing or proposing what to work on next, read `docs/product/CURRENT_STATE.md` and state briefly:

1. Where the task sits in the roadmap or `docs/product/IDEAS.md`, or that it is off-plan and why it is still justified.
2. What the repository already implements. Never rebuild something already shipped.
3. Whether `CURRENT_STATE.md` disagrees with `main`, Git history, open PRs, or the code.
4. Which validation rows from `docs/governance/VALIDATION_MATRIX.md` apply.
5. Whether the task is privacy-sensitive or security-sensitive.

A stale state file is a finding. Report and correct it rather than silently working around it.

## Before coding

1. Classify the task type.
2. For feature, debug, fix, or other application-code work, create and switch to a dedicated branch before editing. Never make such edits directly on `main`.
3. Read `docs/internal/PROJECT_CONTEXT.md` and the smallest relevant files.
4. Use the context gate for non-trivial work.
5. State a working plan when the change has meaningful blast radius.
6. Do not read broad directories or generated outputs.
7. Do not modify application source code unless the user explicitly asked for it.

## After coding and before commit

1. Review the final diff.
2. Run the smallest sufficient checks from `docs/governance/VALIDATION_MATRIX.md`.
3. Run `npm run format:check` and `git diff --check` when available.
4. Do not open a PR with a known formatting, lint, type, test, build, migration, or security failure unless the PR is explicitly documenting that blocked state.
5. Update docs when behavior, workflow, privacy, security, architecture, migrations, or design expectations change.
6. Update `docs/product/CURRENT_STATE.md` whenever the task changes current focus, implementation status, blockers, or next action.
7. Append a truthful entry to `docs/internal/DUTY_WATCH.md` for every completed, partial, blocked, or rolled-back non-trivial watch.
8. Add a `CHANGELOG.md` `[Unreleased]` entry when the user-visible product or shipped developer workflow changes.
9. Report changed files, checks actually run, known gaps, and the concrete next first action.
10. Recommend a fresh agent session after a large completed task.

A task is not complete when its required state update or Duty Watch handoff is missing.

## Duty Watch evidence rules

- Never claim a check passed unless it was run and observed.
- Record failed, skipped, unavailable, and manual-only checks.
- Do not declare a milestone complete without repository evidence.
- Do not erase old watch entries to hide mistakes. Add a correcting entry.
- Do not record secrets, personal data, credentials, private prompts, or hidden reasoning in the watch log.
- The next first action must be specific and executable, not "continue development".

## Model tiers

- `fast`: simple edits, docs cleanup, short inspections.
- `standard`: normal feature, test, docs, and review work. Use Claude Sonnet by default.
- `deep`: architecture, security, privacy, hard debugging, and cross-cutting refactors.

Escalate model depth only for task risk, ambiguity, or blast radius.

## Context gate

- Start with the user request and the Duty Watch entry sequence above.
- Read targeted files by path or symbol.
- Do not read more than 8 files without explaining why.
- Prefer diff-first and symbol-first context.
- For structural code lookups, prefer the configured `codebase-memory-mcp` graph tools before broad grep or manual file walks.
- Do not read `node_modules`, `dist`, `.angular`, `coverage`, `target`, `src-tauri/target`, `.git`, logs, or generated files.
- Do not install or configure unrelated external tools in a task unless explicitly requested.

## Git workflow

- Use a dedicated branch for feature, fix, and change work.
- Commit atomically, one logical change per commit.
- Push after each commit on a feature branch.
- Never include `Co-authored-by`, agent names, model names, or generated-by attribution in commit messages or PR descriptions.
- Do not merge, publish, tag, or release unless the user explicitly requests it and repository protections allow it.

## Safety rules

- Never create real secrets, tokens, credentials, or production configs.
- Never run destructive Git commands.
- Do not install dependencies or change `package.json` unless explicitly requested.
- Treat auth, secrets, shell execution, browser automation, dependencies, MCP, and external tools as security-sensitive.
- Treat user data, storage, sync, notifications, external job sources, plugins, and MCP as privacy-sensitive.
- Ask before expanding scope beyond the current task.

## Applye conventions

- Core workflows must work offline.
- AI features are opt-in, cached where practical, and token-frugal.
- Shared types and IPC contracts belong in `libs/core`.
- Data-access abstractions belong in `libs/data`.
- Shared components and design tokens belong in `libs/ui`.
- User-facing strings must go through `libs/i18n`.
- AI assists; the user decides. Never auto-apply AI output.

## Design consistency for UI changes

1. Before building, read `design-system/MASTER.md` and the matching page contract when present.
2. Use design tokens only, never arbitrary values when a canonical token exists.
3. Preserve hover, pressed, focus-visible, disabled, keyboard, light-theme, and dark-theme behavior.
4. Route user-facing copy through i18n.
5. Run the repository design-drift check when available and reconcile findings against the canonical design contract.
6. If a user-provided design reference conflicts with the current page contract, implement the approved reference and record the deltas in the page documentation.
