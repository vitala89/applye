# Applye Agent Start Here

This repository uses the Intentloom Duty Watch workflow for AI-assisted development.

Before any non-trivial task, read these files in order:

1. `AGENTS.md`
2. `PROJECT_CONTEXT.md`
3. `docs/product/CURRENT_STATE.md`
4. `DUTY_WATCH.md`, starting with the latest entry
5. `docs/governance/VALIDATION_MATRIX.md`
6. The smallest relevant roadmap, plan, ADR, design-system, specification, and code files

Do not begin implementation from the user request alone. First verify the current branch, recent commits, open pull requests, repository state, and whether the requested work is already complete.

## Canonical roles

- `PROJECT_CONTEXT.md` contains durable product and architecture context.
- `docs/product/CURRENT_STATE.md` is the canonical operational state: current focus, blockers, completed work, and next action.
- `DUTY_WATCH.md` is the chronological handoff log between sessions and agents.
- `ROADMAP.md` and `STEP_BY_STEP_PLAN.md` describe strategic and phased work.
- `CHANGELOG.md` records shipped changes, not future work.

Applye deliberately does not add a second `PROJECT_STATE.md`. The existing `docs/product/CURRENT_STATE.md` remains the single operational state file.

## Accepting the watch

Before editing, state briefly:

- where the task belongs in the plan;
- what the repository already implements;
- whether `CURRENT_STATE.md` agrees with Git and the code;
- what validation is required for the affected layers;
- whether the task affects privacy, security, data migration, Tauri IPC, AI providers, or external tools.

## Relieving the watch

A task is not complete until the agent:

- reviews the final diff;
- runs the relevant checks from `docs/governance/VALIDATION_MATRIX.md`;
- runs `npm run format:check` and `git diff --check` when available;
- updates `docs/product/CURRENT_STATE.md` if project status changed;
- appends a truthful entry to `DUTY_WATCH.md`;
- updates `CHANGELOG.md`, roadmap, ADRs, specs, or design docs when applicable;
- records incomplete work, blockers, failed checks, and the next first action.

Never claim a check passed unless it was actually run and its result was observed.