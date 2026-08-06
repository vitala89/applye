# Model Policy

Every task starts with the `task-triage` skill: it scores the work 0-10 and names the
model, the reasoning effort, the subagents and the token budget that score deserves.
This file is the Applye-specific table that triage reads. The skill supplies the
method; this file wins on thresholds, named specialists and gates.

Superseded `aif-model-router`, which offered three unnamed tiers (`fast`, `standard`,
`deep`) with no models, no effort levels, no score and no way to tell whether it had
been applied.

## The score

Five axes, 0-2 each, summed. The digits are reported, not just the total, because the
digits are what a maintainer can argue with.

| Axis         | 0                       | 1                               | 2                                                                         |
| ------------ | ----------------------- | ------------------------------- | ------------------------------------------------------------------------- |
| Blast radius | one file, or text only  | 2-5 files                       | 6+ files, or a `libs/` public API, a database schema, or a layer boundary |
| Ambiguity    | one honest reading      | small gaps, safe defaults exist | two readings that lead to materially different work                       |
| Risk         | none                    | user-visible behaviour          | privacy, security, a migration, or anything outward-facing                |
| Verification | nothing to run          | lint, type-check, unit tests    | the full validation matrix, mutation testing, or a manual walkthrough     |
| Unknowns     | area known, paths given | a few targeted reads            | needs a map before planning                                               |

## The routing table

Model names are the ones this harness accepts today. `Agent` takes
`model: haiku | sonnet | opus | fable` and `effort: low | medium | high | xhigh | max`.

| Score | Model    | Effort                                             | Subagents                           | Output budget             |
| ----- | -------- | -------------------------------------------------- | ----------------------------------- | ------------------------- |
| 0-2   | `haiku`  | low                                                | none                                | ≤15k                      |
| 3-4   | `sonnet` | medium                                             | none                                | ≤60k                      |
| 5-6   | `sonnet` | high                                               | at most one read-only scout         | ≤120k                     |
| 7-8   | `opus`   | high                                               | scout + reviewer, read-only         | ≤250k                     |
| 9-10  | `opus`   | xhigh, `max` only when a wrong answer is expensive | gate first, then scout and reviewer | 250k+, announced up front |

`fable` replaces `haiku` at 0-2 when latency matters more than reasoning.

### Applye adjustments, applied after the table

- **Ambiguity = 2 runs `aif-grilling` before any edit**, at any score. This is the same
  gate `AGENTS.md` already requires for a `libs/` public API, a schema, or the privacy
  and security posture.
- **Risk = 2 never routes below `sonnet`**, and names the specialist: `aif-security-review`,
  `aif-privacy-review`, or the migration path in `VALIDATION_MATRIX.md`.
- **Blast radius = 2 on `libs/application`, `libs/core`, or `eslint.config.mjs`** is an
  architecture decision, not a refactor: `ADR-0005` and the grilling gate apply.
- **Unknowns = 2 starts with a bounded map**, through `aif-context-gate`, not with
  implementation. One read-only scout beats the main session reading twelve files.
- **Verification = 2 means the gate set is part of the estimate**, not a surprise at the
  end: `nx run desktop:type-check`, `nx run-many --target=lint --skip-nx-cache`,
  `nx test`, `nx build desktop`, `quality:file-size`, `quality:attribution`,
  `format:check`, `git diff --check`.

## Rules that have earned their place

- **Escalate context before escalating the model.** A cheap model with the right three
  files beats a frontier model with none.
- **Repeated failure is not a reason to escalate.** Two failed attempts mean the context
  or the diagnosis is wrong. A larger model applied to a wrong premise costs more and
  still fails.
- **Do not use a heavier model to compensate for a skipped `aif-context-gate`.**
- **Subagents are specialists, not implementers.** They scout and review; the main
  session decides, edits and verifies.
- **Delegation is opt-in.** Triage always prints its verdict; it spawns nothing unless the
  maintainer says "route it", "auto", or "delegate". Autonomous fan-out is how a 3/10 task
  becomes a 200k-token session, and the spend is invisible until it has happened.
- **The main session's model cannot be switched from inside a session.** When it does not
  match the verdict, triage says so once, in one line, and continues.

## Other harnesses

Applye is also worked on from Codex, Cursor and Antigravity. The score and the
adjustments above are harness-independent; the model names are not.

**Do not write a model name for another harness from memory.** State the tier by role -
cheapest, mid, frontier - and read that tool's own model list before naming anything. The
same rule already applies to lucide icon identities in this repository, and for the same
reason: nothing fails, the wrong thing is simply selected.

| Harness         | What routing can set automatically | How the verdict is delivered                                        |
| --------------- | ---------------------------------- | ------------------------------------------------------------------- |
| **Claude Code** | a subagent's model and effort      | verdict block, plus a one-line note when the session model is wrong |
| **Codex**       | nothing at runtime                 | verdict block plus a recommended invocation                         |
| **Cursor**      | nothing - the picker is the user's | verdict block only                                                  |
| **Antigravity** | nothing                            | verdict block only                                                  |
