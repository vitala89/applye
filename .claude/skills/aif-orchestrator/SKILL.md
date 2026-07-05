---
description: Choose the AIF workflow, model tier, context path, specialist skills, and subagents for non-trivial Applye work.
---

# AIF Orchestrator

Use before feature, architecture, debug, test, security, privacy, docs, commit, or branch-finish work.

## Steps

1. Classify the task using `AGENTS.md`.
2. Select model tier from `docs/ai/model-policy.md`.
3. Run `aif-context-gate` for context selection.
4. Add specialist skills only when triggered by task risk.
5. Use subagents for focused scouting or review, not implementation.
6. Keep the main session responsible for decisions, edits, verification, and final response.

## Output

Return task type, selected model tier, context plan, specialist plan, verification plan, and known risks.
