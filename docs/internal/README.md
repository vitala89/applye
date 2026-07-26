# Internal working documents

This directory holds how Applye is _built_, not what Applye _is_. It is committed
deliberately: the project is developed with AI agents in the loop, and the working
agreement they follow is part of the public record rather than something hidden.

None of this is required reading to use Applye, to build it from source, or to
contribute a patch. For that, start at the [README](../../README.md) and
[CONTRIBUTING.md](../../CONTRIBUTING.md).

| File                                       | What it is                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| [AGENT_START_HERE.md](AGENT_START_HERE.md) | Entry point for any non-trivial task: what to read, in what order, before touching code.               |
| [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)   | Durable product and architecture context that does not change per branch.                              |
| [INSTRUCTIONS.md](INSTRUCTIONS.md)         | The working agreement: non-negotiable principles, engineering rules, definition of done.               |
| [DUTY_WATCH.md](DUTY_WATCH.md)             | Chronological handoff log. One truthful entry per completed, partial, blocked, or rolled-back session. |

Related, kept outside this directory because they are read more widely:

- [AGENTS.md](../../AGENTS.md) and [CLAUDE.md](../../CLAUDE.md) - agent entry points, at the
  repository root where the tooling expects them.
- [docs/product/CURRENT_STATE.md](../product/CURRENT_STATE.md) - the canonical operational
  state: current focus, blockers, what shipped.
- [docs/governance/VALIDATION_MATRIX.md](../governance/VALIDATION_MATRIX.md) - which checks
  apply to which kind of change.
- [docs/ai/](../ai/) - the policies those agent entry points reference.
