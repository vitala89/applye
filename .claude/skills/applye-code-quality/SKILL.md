---
description: Mandatory Applye code-quality gate for every implementation or review. Use before writing, changing, or reviewing TypeScript, Angular, HTML, SCSS, Rust, Tauri, SQLite, scripts, tests, or shared contracts.
---

# Applye Code Quality Gate

Read [`docs/governance/CODE_QUALITY.md`](../../../docs/governance/CODE_QUALITY.md) before editing code,
then load the relevant `applye-angular` or `applye-rust` skill.

Before implementation:

1. State the responsibility of each file you will touch.
2. Check its current non-empty line count against the repository budget.
3. Existing oversized files may not grow. Extract a cohesive responsibility first.
4. Identify the test seam before writing behavior.
5. Use read-only documentation MCP tools or official docs for version-sensitive APIs.

Before handoff:

```bash
npm run quality:file-size
npm run quality:attribution
```

Then run the relevant validation matrix checks, formatting, and `git diff --check`.

Never add co-author, sign-off, generated-by, model, or agent attribution to commits or pull requests.
Never claim a check passed unless it was run and observed.
