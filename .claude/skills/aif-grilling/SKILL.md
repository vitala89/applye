---
name: aif-grilling
description: Grill the maintainer through a decision tree before implementing, one round of questions at a time. Use when the user says grill, stress-test, or challenge me; and before any work whose decision changes a public API, a database schema, the privacy or security posture, or that has two readings leading to materially different work.
---

# AIF Grilling

The conductor's failure mode in this repository is choosing for the maintainer, then discovering the choice was a convention decision. This skill spends questions instead of rework.

Facts are yours to find. Decisions are the maintainer's. Never trade those roles.

## Steps

1. Map the work as a **decision tree**: every open decision, and which other decisions it hangs off. Write the tree down before asking anything.
2. Resolve every **fact** yourself: read the files, run `git log`, `gh pr view`, the test suite, `npm run quality:file-size`, the compiled output - whatever settles it. Asking the maintainer something the repository already answers wastes the round and reads as laziness.
3. Compute the **frontier**: the decisions whose prerequisites are already settled. A decision that depends on an answer still open this round belongs to a later round.
4. Ask the whole frontier in one round, 2 to 4 questions, through the interactive question tool. Each question carries your recommended option first, and each option states its consequence, not just its name.
5. Recompute the tree from the answers. Answers reshape it: a settled decision unblocks what hung off it and can prune whole branches. Ask the next round.
6. When the maintainer answers "as you recommend", that is authorization for the recommended option. Take it, and state in your reply which option you took and what it costs.
7. Stop when the frontier is empty. Restate every settled decision as a numbered list and wait for confirmation before editing a file.
8. Record the outcome where it belongs: the decisions and their reasons go in the Duty Watch entry's decisions field, and an architectural one also gets an ADR.

## Boundaries

- Reading, running checks, and scouting are allowed during a grilling. Edits are not.
- One round per reply. Do not ask, answer yourself, and proceed in the same turn.
- If the frontier is empty on the first pass, say so and skip the grilling. A task with one honest reading does not need an interview.

## Output

Return the decision tree, what you settled by looking it up, the round you are asking, and - once the frontier empties - the numbered list of settled decisions awaiting confirmation.
