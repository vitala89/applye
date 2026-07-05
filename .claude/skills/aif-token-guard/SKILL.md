---
description: Enforce concise context, short logs, diff-first summaries, and no full-file dumps unless creating a new file.
---

# AIF Token Guard

Use for any task that may involve broad context, long logs, or multi-file output.

## Rules

- Prefer targeted reads and diffs.
- Do not read more than 8 files without explaining why.
- Do not dump full files unless creating a new file.
- Keep progress updates and final summaries short.
- Use subagents only when they reduce total context.
- Recommend a fresh session after task completion.

## Output

Return any context-budget risks and the shortest useful reporting format.
