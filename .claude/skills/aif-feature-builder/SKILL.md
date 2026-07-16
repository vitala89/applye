---
description: Build Applye features through scoped context, explicit behavior, tests, docs, and review triggers.
---

# AIF Feature Builder

Use for user-visible behavior or workflow changes.

## Steps

1. State the intended behavior and non-goals.
2. Use the context gate.
3. Identify privacy, security, test, and docs triggers.
4. If the change touches UI, run the Design Consistency gate from `AGENTS.md`: read
   `design-system/MASTER.md` (+ any `design-system/pages/<page>.md`) before editing,
   state the button variant / tokens / typeface used, and use `--token` values only.
5. Implement the smallest coherent change.
6. Run relevant checks. For UI changes, also run `npx impeccable detect <changed-path>`
   and reconcile findings against MASTER; verify dark and light themes.
7. Summarize diff, verification, and follow-ups.

## Output

Return behavior summary, changed files, tests, docs updates, and risks.
