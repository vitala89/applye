---
description: Decide whether to use manual file reading, a context scout, future graph tools, or no broad context tool.
---

# AIF Context Gate

Use before non-trivial work or any broad search.

## Steps

1. Read the user request and core context files.
2. Prefer explicit paths and targeted symbols.
3. If the user says "classify only" or "do not modify files", prefer pure classification from the task text and do not read files unless necessary.
4. For bounded feature tasks with clear scope and no storage, sync, privacy, security, plugin, notification, or Tauri/Angular boundary risk, do not recommend subagents or graph/context tools by default.
5. Use targeted manual reads only if implementation starts.
6. Do not recommend graph/context tools just because they exist.
7. Use Graphify, CodeGraph, or other graph/context tools only when the area is unknown, cross-module, architectural, touches storage, sync, plugins, notifications, the Tauri/Angular boundary, or would require reading more than 8 files.
8. Use `aif-context-scout` only when the relevant files are unknown and a focused read-only map would reduce total context.
9. Do not use graph tooling that is not already installed.
10. Stop when enough context exists to act.

## Output

Return files to read, files to avoid, scout needed, graph/context tool needed, open assumptions, and Stop condition.
