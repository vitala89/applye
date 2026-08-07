# Model Policy

Every task starts by being **scored**, and the score - not a hunch - selects the model, the reasoning
effort, the delegation plan and the token budget. This file is the canon: the rubric, the thresholds,
the adjustments and the gate commands. It is **tool-independent**.

Applye is worked on from several tools - Claude Code, Codex, Cursor, Copilot, Antigravity - and each
loads its own instruction file. Those files carry a **pointer to this document and their own model
names**, nothing else. Copying the rubric into five places is how five files come to disagree, and the
disagreement stays invisible until two agents score the same task differently.

Superseded `aif-model-router`, which offered three unnamed tiers (`fast`, `standard`, `deep`) with no
models, no effort levels, no score and no way to tell whether it had been applied.

## The score

Five axes, 0-2 each, summed. **Report the digits, not just the total** - the digits are what a
maintainer can argue with, while a bare number invites either blind trust or dismissal.

| Axis         | 0                       | 1                               | 2                                                                         |
| ------------ | ----------------------- | ------------------------------- | ------------------------------------------------------------------------- |
| Blast radius | one file, or text only  | 2-5 files                       | 6+ files, or a `libs/` public API, a database schema, or a layer boundary |
| Ambiguity    | one honest reading      | small gaps, safe defaults exist | two readings that lead to materially different work                       |
| Risk         | none                    | user-visible behaviour          | privacy, security, a migration, or anything outward-facing                |
| Verification | nothing to run          | lint, type-check, unit tests    | the full validation matrix, mutation testing, or a manual walkthrough     |
| Unknowns     | area known, paths given | a few targeted reads            | needs a map before planning                                               |

**Score from the request text and what is already in context.** Reading files to produce an estimate is
the work, not the estimate.

## The routing table, by role

Roles rather than names, because the names differ per tool and are listed below.

| Score | Model role | Reasoning effort | Delegation                                   | Output budget             |
| ----- | ---------- | ---------------- | -------------------------------------------- | ------------------------- |
| 0-2   | cheapest   | lowest           | none                                         | ≤15k                      |
| 3-4   | mid        | medium           | none                                         | ≤60k                      |
| 5-6   | mid        | high             | at most one read-only scout                  | ≤120k                     |
| 7-8   | frontier   | high             | scout + reviewer, read-only                  | ≤250k                     |
| 9-10  | frontier   | highest          | decision gate first, then scout and reviewer | 250k+, announced up front |

Where a tool has no delegation mechanism, read the delegation column as a **context budget**: how many
files this task may read before it should be split.

### Applye adjustments, applied after the table

- **Ambiguity = 2 runs the grilling gate before any edit**, at any score - `aif-grilling` in Claude
  Code, the equivalent instruction elsewhere. Same gate `AGENTS.md` already requires for a `libs/`
  public API, a schema, or the privacy and security posture.
- **Risk = 2 never routes to the cheapest role**, and names the specialist: security review, privacy
  review, or the migration path in `VALIDATION_MATRIX.md`.
- **Blast radius = 2 on `libs/application`, `libs/core`, or `eslint.config.mjs`** is an architecture
  decision, not a refactor: `ADR-0005` and the grilling gate apply.
- **Unknowns = 2 starts with a bounded map**, not implementation. One read-only scout beats the main
  session reading twelve files.
- **Verification = 2 means the gate set is part of the estimate**, not a surprise at the end:
  `nx run desktop:type-check`, `nx run-many --target=lint --skip-nx-cache`, `nx test`,
  `nx build desktop`, `quality:file-size`, `quality:attribution`, `format:check`, `git diff --check`.

## Rules that have earned their place

Every one of these survives translation to any tool, and they matter more than any automation:

- **Escalate context before escalating the model.** A cheap model with the right three files beats a
  frontier model with none.
- **Repeated failure is not a reason to escalate.** Two failed attempts mean the context or the
  diagnosis is wrong. A larger model applied to a wrong premise costs more and still fails.
- **Do not use a heavier model to compensate for skipped context selection.**
- **Delegated agents are specialists, not implementers.** They scout and review; the main session
  decides, edits and verifies.
- **Delegation is opt-in.** The verdict always prints; nothing is spawned unless the maintainer says
  "route it", "auto", or "delegate". Autonomous fan-out is how a 3/10 task becomes a 200k-token
  session, and the spend is invisible until it has happened.
- **Most tools cannot switch the main session's model from inside a session.** When it does not match
  the verdict, say so once, in one line, and continue.

## The verdict block

Printed before anything else happens, in every tool:

```
Triage 6/10 (radius 2 · ambiguity 1 · risk 1 · verify 2 · unknowns 0)
Harness: <tool> · Model: <name> · Effort: <level>
Delegation: <plan> · Gate: <yes/no> · Context: <what will be read>
Budget: ~120k output · Stop when: <the condition that ends the task>
```

Then one sentence naming the cheapest thing the maintainer could say that would **lower** the score.
That sentence is what makes the estimate negotiable rather than decorative.

**Skip the block** for questions about the conversation, one-word confirmations, and unchanged-scope
continuations. Say "re-triage" and print a fresh block when the scope changes, so a change in cost is
visible rather than silent.

## Per-tool mapping

**Never write a model name from memory.** Read the tool's own model list first. Nothing fails when a
name is wrong - the wrong model is simply selected, quietly. An unverified row says so.

| Tool            | Carrier for the pointer                          | "Always" mechanism                                                                                                                                                                   | Role → name                                                                                                                                                                         |
| --------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Code** | `CLAUDE.md` + global `task-triage` skill         | `UserPromptSubmit` hook in `~/.claude/settings.json` - **deterministic**                                                                                                             | cheapest `haiku` (`fable` when latency matters), mid `sonnet`, frontier `opus`; effort `low`/`medium`/`high`/`xhigh`/`max` - **verified** against the `Agent` tool's own parameters |
| **Codex**       | `AGENTS.md`, first section                       | `AGENTS.md` is read per session, so placement is the gate. `.codex/hooks.json` exists here with `PreToolUse` and `SessionStart`; whether a per-prompt event exists is **unverified** | **unverified** - model and effort are chosen at launch, not at runtime                                                                                                              |
| **Cursor**      | `.cursor/rules/100-task-triage.mdc`              | `alwaysApply: true` - **deterministic**, and the same flag `000-aif-core.mdc` already relies on                                                                                      | **unverified** - the picker is the maintainer's                                                                                                                                     |
| **Copilot**     | `.github/copilot-instructions.md`                | none known - **advisory**                                                                                                                                                            | **unverified**                                                                                                                                                                      |
| **Antigravity** | none yet - `.antigravity/` holds only `mcp.json` | **unverified**                                                                                                                                                                       | **unverified**                                                                                                                                                                      |

Fill an unverified cell the first time work actually happens from that tool, by reading its own
documentation - not by analogy with Claude Code. Until then the role names in the routing table are
what the verdict reports.
