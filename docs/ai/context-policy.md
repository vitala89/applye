# Context Policy

The context gate prevents accidental broad scans and stale assumptions.

## Order

1. User request.
2. `AGENTS.md`, `CLAUDE.md`, and `PROJECT_CONTEXT.md`.
3. Explicitly named files.
4. Targeted symbol or path search.
5. Context scout subagent for focused discovery.
6. Future graph tooling only when installed and explicitly available.

## Limits

- No broad repository scanning by default.
- No generated, dependency, build, coverage, log, or `.git` reads.
- Explain before reading more than 8 files.
- Use CodeGraph before grep or manual file walking only when `.codegraph/` already exists.

## Output

Return enough context to make the decision: relevant files, symbols, call paths, assumptions, and unknowns.
