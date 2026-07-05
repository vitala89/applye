---
description: Write focused Conventional Commit messages for Applye from staged or changed files, including split recommendations and risk notes.
---

# AIF Commit Writer

Use when preparing a commit message, reviewing staged changes, or deciding whether a diff should be split.

## Rules

- Use Conventional Commits: `<type>(<scope>): <summary>`.
- Use English.
- Keep the header under 90 characters.
- Use imperative style where possible.
- Do not mention AI-generated code in commit messages.
- Do not use vague summaries such as "update files", "changes", "fix stuff", or "misc".
- Recommend splitting commits when staged changes are unrelated or too broad for one specific header.
- If changes touch privacy, storage, sync, auth, notifications, plugins, MCP, external sources, or user data, include a concise risk or behavior note in the commit body.

## Allowed Types

`feat`, `fix`, `refactor`, `test`, `docs`, `style`, `chore`, `build`, `ci`, `perf`, `revert`.

## Recommended Scopes

`jobs`, `applications`, `profile`, `notifications`, `storage`, `sync`, `plugins`, `mcp`, `ai`, `ui`, `auth`, `docs`, `repo`, `tauri`, `angular`.

## Output

Return:

1. Recommended commit message
2. Optional commit body
3. Whether changes should be split
4. Risk note if privacy/security/storage/sync/MCP/user data is involved
