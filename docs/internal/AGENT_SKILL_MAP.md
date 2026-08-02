# Agent Skill Map

Which skill owns what, and which external ones Applye actually relies on.

Two skill packs are installed alongside this repository's own, and both overlap it. Without a
written division, an agent runs two processes for one task, or picks whichever it noticed first.
This file is that division. It is a routing document, not a tutorial.

## Applye's own skills

`.claude/skills/` holds the AIF set. They are the authority on everything Applye-specific: this
repository's gates, its size budgets, its privacy posture, its Duty Watch handoff, its stacks.

| Skill                      | Owns                                                                   |
| -------------------------- | ---------------------------------------------------------------------- |
| `aif-orchestrator`         | Routing: workflow, model tier, context path, which specialists to call |
| `aif-grilling`             | Turning an underspecified task into settled decisions before any edit  |
| `aif-planning-review`      | Prioritising, estimating, splitting, deciding what to do next          |
| `aif-architecture-planner` | Boundaries, data flow, migration steps                                 |
| `aif-feature-builder`      | Building a feature through scoped context, tests, docs                 |
| `aif-testing-strategy`     | Which tests a change actually needs                                    |
| `aif-debugger`             | Applye-specific debugging: Tauri IPC, SQLite, AI providers             |
| `aif-code-review`          | Reviewing a diff on both axes, standards and design                    |
| `aif-security-review`      | Secrets, shell, dependencies, MCP, browser automation                  |
| `aif-privacy-review`       | User data, storage, sync, external job sources                         |
| `aif-docs-sync`            | Which documents a change obliges                                       |
| `aif-project-state-sync`   | `CURRENT_STATE.md`, feature state, ADRs                                |
| `aif-commit-writer`        | Conventional Commit messages under this repo's attribution rules       |
| `aif-branch-finisher`      | Diff review, gates, docs, PR summary                                   |
| `aif-context-gate`         | Whether to read files, scout, or use a graph tool                      |
| `aif-model-router`         | Model tier per task                                                    |
| `aif-token-guard`          | Keeping context spend honest                                           |
| `applye-angular`           | Angular, signals, templates, styles                                    |
| `applye-rust`              | Rust, Tauri commands, sqlx                                             |
| `applye-code-quality`      | The mandatory quality gate before writing or reviewing code            |

## superpowers, and it is already load-bearing

The `superpowers` plugin injects `using-superpowers` into every session, so its skills are in play
whether or not this repository mentions them. It has been used here already: seven implementation
plans under `docs/superpowers/plans/` are in its format.

Keep it. Its process skills are stronger than anything worth rewriting here, and five of them
overlap the AIF set. Where they do, the split is by **scope**: superpowers owns the general
technique, AIF owns the Applye-specific rules that technique must respect.

| superpowers skill                  | Applye rule                                                                                                                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brainstorming`                    | Use for open creative work. When the ask is a decision between known options, `aif-grilling` is the sharper tool - it ends in a list of settled decisions rather than a design    |
| `systematic-debugging`             | Use as the method. `aif-debugger` supplies the Applye layers to suspect and the checks that prove it                                                                              |
| `test-driven-development`          | Use as the method. `aif-testing-strategy` decides which level the test belongs at, and this repo adds one rule: a new test must fail without its fix                              |
| `requesting-code-review`           | Use for the request. `aif-code-review` supplies the two axes                                                                                                                      |
| `verification-before-completion`   | Use before claiming anything is done. The gate itself is `docs/governance/VALIDATION_MATRIX.md`, and "never claim a check passed unless it was run" outranks any general phrasing |
| `writing-plans`, `executing-plans` | Plans live in `docs/superpowers/plans/`. The handoff at the end is still a Duty Watch entry                                                                                       |
| `writing-skills`                   | Use when editing anything in `.claude/skills/`                                                                                                                                    |
| `using-git-worktrees`              | Available, unused here so far. Not a rule                                                                                                                                         |

## mattpocock/skills, mined rather than adopted

The `mattpocock-skills` plugin stays installed - several of its skills are already reachable - but
its process is built around an issue-tracker workflow this repository does not use. Two ideas were
taken and rewritten into the AIF set rather than wired in:

- the **grilling** interview, now `aif-grilling`. Its own version delegates to a plugin skill and is
  marked user-invoked only, which means it fires only when the maintainer remembers it. Applye's
  version is model-invoked with hard triggers, and asks in rounds of 2 to 4 through the interactive
  question tool instead of one question per turn;
- the **two-axis review**, now a step in `aif-code-review`: standards and design reported separately,
  because a diff can satisfy every written rule and still be the wrong shape.

`writing-great-skills` is worth reading before editing any skill here. Its vocabulary - context load
versus cognitive load, the information hierarchy, leading words, and the failure modes (premature
completion, duplication, sediment, sprawl, no-op, negation) - is the sharpest available account of
why a skill misfires. It is reference, not a process, so it was not copied.

Nothing from `deprecated/` or `in-progress/` was taken.

## When the routing is unclear

Ask. `aif-orchestrator` decides which specialists a task needs, and `aif-grilling` exists precisely
for the case where the answer is a convention decision rather than a fact.
