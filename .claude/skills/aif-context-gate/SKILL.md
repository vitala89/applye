---
description: Decide whether to use manual file reading, a context scout, future graph tools, or no broad context tool.
---

# AIF Context Gate

Use before non-trivial work or any broad search.

## Steps

1. Read the user request and core context files.
2. Prefer explicit paths and targeted symbols.
3. If the user says "classify only", "without reading files", "do not read files", or "do not modify files", stop at the task text and do not perform context discovery.
4. For text-only classification, return `Graph/context tool needed: no` unless the task is explicitly architecture, security, migration, or broad-impact.
5. Do not recommend context scout, Graphify, CodeGraph, manual file exploration, or prior memory/observation lookup for text-only classification.
6. For bounded feature tasks with clear scope and no storage, sync, privacy, security, plugin, notification, Tauri/Angular boundary, architecture, large-refactor, or 8+ file signal, do not recommend subagents or graph/context tools.
7. Use targeted manual reads only if implementation actually starts.
8. Do not recommend graph/context tools just because they exist.
9. Use Graphify, CodeGraph, or other graph/context tools only when the area is unknown, cross-module, architectural, touches storage, sync, plugins, notifications, the Tauri/Angular boundary, or would require reading more than 8 files.
10. Use `aif-context-scout` only when implementation is starting, relevant files are unknown, and a focused read-only map would reduce total context.
11. Do not use graph tooling that is not already installed.
12. Stop when enough context exists to act.

## Output

Return files to read, files to avoid, scout needed, graph/context tool needed, open assumptions, and Stop condition.

When the user requests exact field names, use those names verbatim.
