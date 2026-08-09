# Applye Agent Start Here

This repository uses the Intentloom Duty Watch workflow for AI-assisted development.

Before any non-trivial task, read these files in order:

1. `AGENTS.md`
2. `PROJECT_CONTEXT.md`
3. `docs/product/CURRENT_STATE.md`
4. `DUTY_WATCH.md`, starting with the latest entry
5. `docs/governance/CODE_QUALITY.md`, including the section "Layers, and which one owns what"
6. `docs/product/decisions/ADR-0005-application-layer-owns-page-state.md`
7. `docs/governance/VALIDATION_MATRIX.md`
8. The smallest relevant roadmap, plan, ADR, design-system, specification, stack skill, and code files

Do not begin implementation from the user request alone. First verify the current branch, recent commits, open pull requests, repository state, and whether the requested work is already complete.

## Canonical roles

- `PROJECT_CONTEXT.md` contains durable product and architecture context.
- `docs/product/CURRENT_STATE.md` is the canonical operational state: current focus, blockers, completed work, and next action.
- `DUTY_WATCH.md` is the chronological handoff log between sessions and agents.
- `docs/governance/CODE_QUALITY.md` is the mandatory maintainability, decomposition, file-size, test, MCP, and attribution contract.
- `docs/governance/VALIDATION_MATRIX.md` maps affected layers to required checks.
- `ROADMAP.md` describes strategic and phased work.
- `CHANGELOG.md` records shipped changes, not future work.

Applye deliberately does not add a second `PROJECT_STATE.md`. The existing `docs/product/CURRENT_STATE.md` remains the single operational state file.

## Accepting the watch

**Before all of this, run the `task-triage` skill and print its verdict** - score 0-10 across blast
radius, ambiguity, risk, verification and unknowns, then the model, effort, subagents and token budget
from `docs/ai/model-policy.md`. Ambiguity scored 2 goes to `aif-grilling` before any edit. Subagents
are never spawned unless the maintainer asked.

Before editing, state briefly:

- where the task belongs in the plan;
- what the repository already implements;
- whether `CURRENT_STATE.md` agrees with Git and the code;
- what validation is required for the affected layers;
- whether the task affects privacy, security, data migration, Tauri IPC, AI providers, or external tools;
- **where the work sits in the layering, and what owns its state.** A page component renders and
  delegates; screen state belongs in a signal store in `libs/application`, budget 250, and a page
  does not inject `DbService` (`ADR-0005`). The rule binds new code now; an existing page migrates
  when it is touched for another reason. Lint enforces it for components: injecting `DbService` in a
  `*.component.ts` is an error unless the file is in `COMPONENTS_STILL_USING_THE_GATEWAY` in
  `eslint.config.mjs`, a 15-entry list that only shrinks - never add to it;
- which touched files are near or above their code-size budgets, what responsibility each file owns, and where the new behavior will be tested.

Before adding framework or library code, use the configured read-only documentation MCP tools or current official docs for the installed version. Do not send source code, secrets, personal data, or private prompts to a documentation MCP.

## Relieving the watch

A task is not complete until the agent:

- reviews the final diff;
- runs the relevant checks from `docs/governance/VALIDATION_MATRIX.md`;
- runs `npm run quality:file-size`, `npm run quality:attribution`, `npm run format:check`, and `git diff --check` when available;
- updates `docs/product/CURRENT_STATE.md` if project status changed;
- appends a truthful entry to `DUTY_WATCH.md`;
- updates changelog, roadmap, ADRs, specs, or design docs when applicable;
- records incomplete work, blockers, failed checks, file-size changes near or above budget, and the next first action.

Never claim a check passed unless it was actually run and its result was observed.
