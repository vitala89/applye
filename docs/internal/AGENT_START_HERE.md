# Applye Agent Start Here

This repository uses the Intentloom Duty Watch workflow for AI-assisted development.

## Mandatory architecture canon

Before any non-trivial design, feature, refactor, bug fix, review, or code edit, the agent must read the canonical instructions below. Do not design from memory, generic best practices, or invented conventions when the repository already defines the answer.

Applye intentionally keeps these concerns in existing canonical documents instead of creating duplicate files named `DDD_ARCHITECTURE.md`, `UBIQUITOUS_LANGUAGE.md`, `ARCHITECTURE_GUIDELINES.md`, `BACKEND_ARCHITECTURE.md`, `FRONTEND_ARCHITECTURE.md`, `CODE_STYLE.md`, or `AGENT_DEVELOPMENT_RULES.md`. Their canonical equivalents are:

| Concern | Canonical source |
| --- | --- |
| DDD architecture and tactical-pattern policy | `docs/domain-architecture.md` |
| Ubiquitous language and domain naming | `docs/domain-architecture.md` |
| Overall architecture and dependency direction | `docs/architecture.md` plus applicable ADRs |
| Desktop/backend boundaries, Rust/Tauri/data access | `docs/architecture.md`, `docs/governance/CODE_QUALITY.md`, applicable ADRs |
| Frontend/application/UI boundaries | `docs/architecture.md`, `docs/governance/CODE_QUALITY.md`, `ADR-0005` |
| Code style, maintainability and file-size budgets | `docs/governance/CODE_QUALITY.md` |
| Agent development workflow and mandatory gates | `AGENTS.md` and this file |
| Required validation | `docs/governance/VALIDATION_MATRIX.md` |

If a canonical document and existing code disagree, treat that as a finding. Do not silently choose a third convention. Verify the relevant ADR/current state and either follow the authoritative decision or explicitly update the stale documentation in the same task when appropriate.

Before any non-trivial task, read these files in order:

1. `AGENTS.md`
2. `docs/internal/PROJECT_CONTEXT.md`
3. `docs/domain-architecture.md`, including the ubiquitous language and pragmatic DDD policy
4. `docs/architecture.md`
5. `docs/governance/CODE_QUALITY.md`, including layer ownership and file-size budgets
6. `docs/product/CURRENT_STATE.md`
7. `docs/internal/DUTY_WATCH.md`, starting with the latest entry
8. `docs/product/decisions/ADR-0005-application-layer-owns-page-state.md`
9. `docs/governance/VALIDATION_MATRIX.md`
10. The smallest relevant roadmap, plan, ADR, design-system, specification, stack skill, and code files

Do not begin implementation from the user request alone. First verify the current branch, recent commits, open pull requests, repository state, and whether the requested work is already complete.

For every proposed new or changed symbol, model, workflow, command, gateway, API, module, or user-facing business term, check the ubiquitous language first. Reuse an existing canonical term when it represents the same concept. If a genuinely new business concept is needed, define it deliberately and update the domain language rather than introducing an undocumented synonym.

For every file you plan to grow, check its responsibility and current non-empty line count before editing. File-size budgets come from `docs/governance/CODE_QUALITY.md`; do not guess or copy stale numbers into feature code or task prompts. Existing oversized files are technical debt, not precedent, and may not grow.

## Canonical roles

- `docs/internal/PROJECT_CONTEXT.md` contains durable product and architecture context.
- `docs/domain-architecture.md` is the canonical domain-language and pragmatic DDD contract. It defines the ubiquitous language, logical bounded contexts, layer ownership, and when tactical DDD patterns are justified. New business concepts, workflows, gateways, commands, and durable APIs must use it rather than inventing parallel vocabulary or speculative DDD scaffolding.
- `docs/architecture.md` is the canonical system architecture overview. Applicable ADRs override general guidance for decisions they specifically govern.
- `docs/product/CURRENT_STATE.md` is the canonical operational state: current focus, blockers, completed work, and next action.
- `docs/internal/DUTY_WATCH.md` is the chronological handoff log between sessions and agents.
- `docs/governance/CODE_QUALITY.md` is the mandatory maintainability, decomposition, file-size, test, MCP, and attribution contract.
- `docs/governance/VALIDATION_MATRIX.md` maps affected layers to required checks.
- `docs/internal/NATIVE_GATE_BACKLOG.md` lists the `tauri dev` walkthroughs that are outstanding because no agent can drive them. Add to it rather than carrying a pending native check forward as a line in the next watch entry.
- `ROADMAP.md` describes strategic and phased work.
- `CHANGELOG.md` records shipped changes, not future work.

Applye deliberately does not add duplicate architecture or state documents merely to satisfy a conventional filename. One rule has one canonical source so agents cannot choose whichever duplicate happens to agree with them.

## Accepting the watch

**Before all of this, run the `task-triage` skill and print its verdict** - score 0-10 across blast radius, ambiguity, risk, verification and unknowns, then the model, effort, subagents and token budget from `docs/ai/model-policy.md`. Ambiguity scored 2 goes to `aif-grilling` before any edit. Subagents are never spawned unless the maintainer asked.

Before editing, state briefly:

- where the task belongs in the plan;
- what the repository already implements;
- whether `CURRENT_STATE.md` agrees with Git and the code;
- what validation is required for the affected layers;
- whether the task affects privacy, security, data migration, Tauri IPC, AI providers, or external tools;
- which domain owns the work and which terms it introduces or changes. Reuse the ubiquitous language in `docs/domain-architecture.md`; do not create Aggregates, Entities, Value Objects, Repositories, Domain Events, or physical bounded-context libraries merely to satisfy a DDD pattern;
- where the work sits in the layering and what owns its state. A page component renders and delegates; screen state belongs in a signal store in `libs/application`, budget 250, and a page does not inject a data gateway (`ADR-0005`). The rule binds new code now; an existing page migrates when it is touched for another reason. Lint enforces it for components with no exceptions left: injecting `AiService`, `JobSourceService` or any `*Gateway` in a `*.component.ts` is an error, and the `COMPONENTS_STILL_USING_THE_GATEWAY` allowlist is gone rather than empty - there is nothing to add a file to;
- which touched files are near or above their code-size budgets, what responsibility each file owns, and where the new behavior will be tested.

Before adding framework or library code, use the configured read-only documentation MCP tools or current official docs for the installed version. Do not send source code, secrets, personal data, or private prompts to a documentation MCP.

## Relieving the watch

A task is not complete until the agent:

- reviews the final diff;
- runs the relevant checks from `docs/governance/VALIDATION_MATRIX.md`;
- runs `npm run quality:file-size`, `npm run quality:attribution`, `npm run format:check`, and `git diff --check` when available;
- updates `docs/product/CURRENT_STATE.md` if project status changed;
- appends a truthful entry to `docs/internal/DUTY_WATCH.md`;
- updates changelog, roadmap, ADRs, specs, or design docs when applicable;
- records incomplete work, blockers, failed checks, file-size changes near or above budget, and the next first action.

Never claim a check passed unless it was actually run and its result was observed.
