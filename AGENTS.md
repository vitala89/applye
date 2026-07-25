# AIF Core Agent Instructions

Applye is an open-source, privacy-first job-search productivity app built as an Nx monorepo with Tauri 2, Angular, Rust, SQLite, TypeScript, and shared domain/UI/i18n libraries. Treat user career data, applications, notes, contacts, notifications, resumes, and imported job content as sensitive by default.

See `PROJECT_CONTEXT.md` for product, architecture, and command context.

## AIF Conductor Model

The main agent session is the conductor. It owns task framing, context selection, implementation decisions, verification, and the final response. Skills and subagents are specialists. They advise, review, or scout context; they do not replace the conductor and they do not perform broad implementation.

## Task Types

- `simple`: small edits, direct answers, formatting, or local command checks.
- `feature`: user-facing or workflow behavior changes.
- `architecture`: module boundaries, data flow, durable interfaces, or migration planning.
- `debug`: reproduce, isolate, fix, and verify a defect.
- `test`: test strategy, coverage gaps, fixtures, or reliability work.
- `security`: auth, secrets, permissions, shell commands, dependencies, MCP, browser automation, or external tools.
- `privacy`: user data, local storage, sync, notifications, external job sources, plugins, or MCP.
- `docs`: README, project docs, AI docs, ADRs, and docs sync.
- `commit`: prepare a focused commit message and change summary.
- `branch finish`: final verification, release notes, docs sync, and PR summary.

## Canonical Document Roles

The project separates strategic documents from operational daily tracking:

- **ROADMAP.md**: Strategy / vision / product principles.
- **INSTRUCTIONS.md**: Working agreement / engineering rules.
- **STEP_BY_STEP_PLAN.md**: Phased execution checklist.
- **CHANGELOG.md**: Historical record of shipped changes.
- **docs/product/CURRENT_STATE.md**: Operational daily/focus state. Check this first before starting feature work.

## Plan Check (mandatory, every task)

Before any non-trivial task, and before proposing what to work on next, read
`docs/product/CURRENT_STATE.md` and locate the task in the plan. Then state, in one line each:

1. **Where it sits**: the roadmap section, `STEP_BY_STEP_PLAN.md` phase, or `docs/product/IDEAS.md`
   entry this task belongs to - or explicitly that it is off-plan and why it is still worth doing.
2. **What is already shipped**: the part of the task that the code already does. Never plan or
   rebuild something `CURRENT_STATE.md` or the code says is done.
3. **Whether the state doc is stale**: if `CURRENT_STATE.md` disagrees with `main` (wrong branch,
   wrong version, work described as pending that already merged), say so before starting.

A stale state doc is itself a finding - report it, do not silently work around it.

## Before Coding

1. Classify the task type.
2. For `feature`, `debug`, or any other task that adds, changes, or fixes application code: create and switch to a new branch before editing (e.g. `feat/<slug>`, `fix/<slug>`). Never make feature/fix edits directly on `main`. Skip only for pure `docs`, `commit`, or `branch finish` tasks, or when the user is already on a dedicated branch for this exact task.
3. Read `PROJECT_CONTEXT.md` and the smallest relevant docs or files.
4. Use the AIF Context Gate for non-trivial work.
5. State the working plan before editing when the change has meaningful blast radius.
6. Do not read broad directories or generated outputs.
7. Do not modify application source code unless the user explicitly asked for it.

## After Coding

1. Review the diff before summarizing.
2. Run only relevant existing checks.
3. Update docs when behavior, workflow, privacy, or security expectations change.
4. Update `docs/product/CURRENT_STATE.md` and add a `CHANGELOG.md` `[Unreleased]` entry whenever the
   task changes what the app does or where the work stands. The Plan Check reads this doc next time -
   leaving it stale poisons the next task's starting point.
5. Report changed files, verification, known gaps, and next steps.
6. Recommend starting a fresh agent session after a completed task.

## Model Tiers

- `fast`: simple edits, docs cleanup, short inspections.
- `standard`: normal feature, test, docs, and review work. Use Claude Sonnet by default.
- `deep`: architecture, security, privacy, hard debugging, cross-cutting refactors.

Escalate model depth only for task risk, ambiguity, or blast radius.

## Context Gate

- Start with the user request, `AGENTS.md`, `CLAUDE.md`, and `PROJECT_CONTEXT.md`.
- Read targeted files by path or symbol.
- Do not read more than 8 files without explaining why.
- Prefer diff-first and symbol-first context.
- For structural code lookups (find a symbol, trace callers, map a module), prefer the `codebase-memory-mcp` graph tools before grep, find, or manual file walks. In this repo `codebase-memory-mcp` is the single graph tool of record; do not also reach for CodeGraph, so the two do not duplicate work.
- Do not read `node_modules`, `dist`, `.angular`, `coverage`, `target`, `src-tauri/target`, `.git`, logs, or generated files.
- Do not configure or install Graphify, CodeGraph, Headroom, Context Mode, Token Optimizer, Superpowers, Browser Harness, Agent Reach, MCP, or other external tools in this PR.

## Git Workflow

- Do feature/fix/change work on a dedicated branch (see Before Coding step 2), never directly on `main`.
- Commit atomically: one logical change per commit, not one giant end-of-session commit.
- Push after each commit on a feature branch, so remote stays in sync as work lands.
- NEVER include "Co-authored-by" or mention AI assistants/agents in commit messages or pull request descriptions (e.g., "generated by Claude", "written by Codex"). Commits and PRs must be clean and authored entirely under the user's name.

## Safety Rules

- Never create real secrets, tokens, credentials, or production configs.
- Never run destructive git commands.
- Do not install dependencies or change `package.json` unless explicitly requested.
- Treat auth, secrets, shell execution, browser automation, dependencies, MCP, and external tools as security-sensitive.
- Treat user data, storage, sync, notifications, external job sources, plugins, and MCP as privacy-sensitive.
- Ask before expanding scope beyond the current task.

## Applye Conventions

- Core workflows must work offline.
- AI features are opt-in, cached where practical, and token-frugal.
- Shared types and IPC contracts belong in `libs/core`.
- Data access abstractions belong in `libs/data`.
- Shared components and design tokens belong in `libs/ui`.
- User-facing strings must go through `libs/i18n`.
- AI assists; the user decides. Never auto-apply AI output.

## Design Consistency (any UI change)

Applye has a fixed design system; keep it fixed. For any task that adds or changes UI:

1. **Before building**, read `design-system/MASTER.md` (the design contract) and the
   matching `design-system/pages/<page>.md` if one exists. The canonical token values
   live in `libs/ui/tokens.css`. State which button variant, tokens, and typeface the
   change uses before editing.
2. **While building**, use `--token` values only - never raw hex, px, or rgba. Match the
   component contracts in MASTER (buttons, inputs, cards, badges) exactly; do not skip
   button states (hover, pressed, focus-visible ring, disabled). Route copy through i18n.
3. **After building**, run `npx impeccable detect <changed-path>` (on-demand drift check,
   no install) and reconcile findings against MASTER. Verify both `data-theme="dark"` and
   `light`.
4. If the user provides a design reference (link or mock), it overrides MASTER for that
   screen - implement all of it (including button and control styling) and record the
   deltas in `design-system/pages/<page>.md`.
