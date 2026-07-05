# Model Policy

Use Claude Sonnet as the default model for Applye development.

## Tiers

- `fast`: simple docs edits, formatting, small lookups.
- `standard`: normal implementation, tests, docs, and code review. Default to Claude Sonnet.
- `deep`: architecture decisions, security/privacy reviews, hard debugging, high-blast-radius changes.

## Routing Rules

- Start with the lowest tier that can handle the task reliably.
- Escalate for ambiguity, sensitive data, cross-module changes, or repeated failures.
- Do not use heavier models to compensate for missing context. Use the context gate first.
- Keep subagents specialist-scoped and concise.
