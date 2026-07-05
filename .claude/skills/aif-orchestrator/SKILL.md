---
description: Choose the AIF workflow, model tier, context path, specialist skills, and subagents for non-trivial Applye work.
---

# AIF Orchestrator

Use before non-trivial feature, architecture, debug, test, security, privacy, docs, commit, or branch-finish work.

## Steps

1. Classify the task using `AGENTS.md`. Route non-trivial feature, product, or architecture tasks through the `aif-project-state-sync` skill first to align on state.
2. Select model tier from `docs/ai/model-policy.md`.
3. If the user says "classify only", "without reading files", "do not read files", or "do not modify files", classify from the current task text only.
4. For text-only classification, do not read files, do not call context scouts, do not recommend Graphify, CodeGraph, or graph/context tools, and do not reference previous observations, memory IDs, prior smoke tests, or internal state.
5. Exception: architecture, security, migration, or broad-impact tasks may recommend more context, but still must not read files when the user explicitly requested classification only.
6. Run `aif-context-gate` for context selection only when implementation is actually starting or broad context is explicitly needed.
7. Do not recommend subagents for simple or bounded feature tasks by default.
8. For bounded feature tasks with clear scope, local mock data only, and no storage, sync, privacy, security, architecture, plugin, notification, Tauri/Angular boundary, large-refactor, or 8+ file signal, set `Subagents needed: no` and `Graph/context tool needed: no`.
9. Add specialist skills or subagents only when triggered by risk, unknown ownership, architecture, security, privacy, storage, sync, plugins, notifications, the Tauri/Angular boundary, or review needs.
10. Use subagents for focused scouting or review, not implementation.
11. Keep the main session responsible for decisions, edits, verification, and final response.

## Output

Return task type, selected model tier, context plan, specialist plan, subagents needed, graph/context tool needed, verification plan, known risks, and Stop condition.

When the user requests exact field names, use those names verbatim.
