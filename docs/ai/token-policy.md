# Token Policy

Tokens are a shared engineering budget. Spend them on context that changes the decision.

## Rules

- Prefer targeted reads over broad scans.
- Do not read more than 8 files without explaining why.
- Summarize diffs first; avoid full-file dumps except when creating a new file.
- Keep logs, plans, and final summaries concise.
- Use subagents only when their focused output reduces total context.
- Start a new session after a completed task when context is no longer useful.

## Avoid

- Repeating large instructions.
- Reading generated files.
- Dumping dependency trees.
- Running broad searches before the context gate.
