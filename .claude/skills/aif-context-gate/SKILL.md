---
description: Decide whether to use manual file reading, a context scout, future graph tools, or no broad context tool.
---

# AIF Context Gate

Use before non-trivial work or any broad search.

## Steps

1. Read the user request and core context files.
2. Prefer explicit paths and targeted symbols.
3. If `.codegraph/` exists, use CodeGraph before grep or manual file walking.
4. If context is unclear, ask `aif-context-scout` for a focused read-only map.
5. Do not use graph tooling that is not already installed.
6. Stop when enough context exists to act.

## Output

Return files to read, files to avoid, whether a scout is needed, and open assumptions.
