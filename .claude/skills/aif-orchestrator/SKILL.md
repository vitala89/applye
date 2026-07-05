---
description: Choose the AIF workflow, model tier, context path, specialist skills, and subagents for non-trivial Applye work.
---

# AIF Orchestrator

Use before non-trivial feature, architecture, debug, test, security, privacy, docs, commit, or branch-finish work.

## Steps

1. Classify the task using `AGENTS.md`.
2. Select model tier from `docs/ai/model-policy.md`.
3. If the user says "classify only" or "do not modify files", classify from the task text and avoid file reads unless necessary.
4. Run `aif-context-gate` for context selection only when implementation or broad context is needed.
5. Do not recommend subagents for simple or bounded feature tasks by default.
6. Add specialist skills or subagents only when triggered by risk, unknown ownership, architecture, security, privacy, storage, sync, plugins, notifications, the Tauri/Angular boundary, or review needs.
7. Use subagents for focused scouting or review, not implementation.
8. Keep the main session responsible for decisions, edits, verification, and final response.

## Output

Return task type, selected model tier, context plan, specialist plan, subagents needed, graph/context tool needed, verification plan, known risks, and Stop condition.
