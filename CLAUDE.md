# Claude Code Applye Notes

**Triage first, on every task.** Invoke the `task-triage` skill before any other skill, tool call, or
answer, and print its verdict: a 0-10 score with its five axes, the model, the reasoning effort, the
subagents, the context plan and the token budget. `docs/ai/model-policy.md` is the canon it reads - it
wins on thresholds, named specialists and gates, and it is **tool-independent**, because this repository
is also worked on from Codex, Cursor, Copilot and Antigravity. Only Claude Code's model names are
verified there; the other tools' rows say so. Triage from the request text alone; do not read files to
produce an estimate. Never spawn a subagent unless the maintainer asked for it.

Start every non-trivial task at `docs/internal/AGENT_START_HERE.md`.

Read, in order:

1. `AGENTS.md`
2. `docs/internal/PROJECT_CONTEXT.md`
3. `docs/product/CURRENT_STATE.md`
4. the latest entry in `docs/internal/DUTY_WATCH.md`
5. `docs/governance/CODE_QUALITY.md`
6. `docs/governance/VALIDATION_MATRIX.md`
7. the relevant stack skill and the smallest relevant code files

Then run the Grilling gate from `AGENTS.md`: when a decision changes a `libs/` public API, a database
schema, or the privacy or security posture, or when the task has two readings that lead to different
work, invoke the `aif-grilling` skill instead of choosing for the maintainer. Which skill owns what,
and how the AIF set divides from the installed `superpowers` pack, is in
`docs/internal/AGENT_SKILL_MAP.md`.

Run the Plan Check from `AGENTS.md` before implementation or before proposing what to work on next. State where the task sits, what is already shipped, whether current state is stale, which checks apply, whether the work is privacy-sensitive or security-sensitive, and which touched files are near or above their size budgets.

The main Claude Code session remains the conductor. Skills and subagents are specialists, not independent broad implementers.

## Architecture, non-negotiable

Applye is layered, and the direction of every dependency is enforced by
`@nx/enforce-module-boundaries` in `eslint.config.mjs`, not by convention:

```
apps/desktop  ->  libs/application  ->  libs/data  ->  libs/core
                  libs/ui, libs/i18n                   (pure domain, no Angular, no Tauri)
```

**A page component renders and delegates. It does not hold the state of its own screen, and it does
not inject `DbService`.** Screen state - what is loaded, what is in flight, what the user selected -
belongs in a **signal store in `libs/application`**, budget **250 lines**. Plain `signal()` and
`computed()`, never NgRx: `jobs.store.ts` records why, and the reason has not changed.

This is `ADR-0005`, and it was measured rather than assumed. Page classes that are view, state and
orchestration at once reach 700 to 1000 lines, and extracting pure helpers does not bring them back -
Profile stopped at 445/400 by decision, Discover shrank only while pure logic remained.

Three things a new session must know before writing code:

1. **The rule binds new code now.** An existing page migrates when it is touched for another reason -
   the same trigger as the file-size budgets, and one stream of work with them.
2. **Lint enforces it now, for components.** A `*.component.ts` file that injects `DbService` fails the
   build unless it is named in `COMPONENTS_STILL_USING_THE_GATEWAY` in `eslint.config.mjs` - a list of
   16 that only ever shrinks. Never add an entry; delete yours when you migrate a page. `type:data`
   stays in `type:app`'s allowlist and leaves only when the app's `shared/*` services have moved too,
   which is a separate and larger job (ADR-0005, amendment four).
3. **Changing the shape of the layer goes through the `aif-grilling` skill**, like any other `libs/`
   public API.

`docs/governance/CODE_QUALITY.md` holds the full table and the reasoning.

## Code quality before implementation

- Read `docs/governance/CODE_QUALITY.md` before every code change.
- Check file size and responsibility before adding code.
- Existing oversized files may not grow. Extract a focused responsibility before adding behavior.
- Apply SOLID pragmatically, keep domain logic pure where practical, and keep I/O at explicit boundaries.
- Identify the test seam first. Bug fixes require regression tests.
- Use the `applye-angular` or `applye-rust` skill for stack-specific work.
- Use the read-only Angular CLI MCP for Angular guidance and Context7 only for minimal versioned documentation queries. Never send source code, secrets, personal data, CV/job content, credentials, or private prompts to an MCP.
- Community runtime automation MCPs, including Tauri bridge servers that can execute JavaScript or IPC, require explicit maintainer approval and a separate security review.

## Duty Watch handoff

Before ending a completed, partial, blocked, or rolled-back non-trivial session:

- review the final diff;
- run and report the relevant checks;
- run `npm run quality:file-size` and `npm run quality:attribution`;
- update `docs/product/CURRENT_STATE.md` if project status changed;
- append a truthful entry to `docs/internal/DUTY_WATCH.md`;
- update changelog, roadmap, ADRs, specifications, migrations, privacy, security, and design docs when applicable;
- record before/after sizes for touched files near or above budget and the concrete next first action.

Never claim a check passed unless it was actually run and observed.

## Commits and pull requests

Commit messages and PR descriptions must not include `Co-authored-by`, `Signed-off-by`, generated-by text, assisted-by text, model names, or agent attribution. Commits are authored solely by the repository Git user. Never add the maintainer or Claude as a co-author.

Before commit, run the relevant validation matrix entries, `npm run quality:file-size`, `npm run quality:attribution`, `npm run format:check`, and `git diff --check` when available. Do not open a PR with a known failing gate unless the PR explicitly documents a blocked state.

## Token and context rules

- Keep logs and summaries short.
- Prefer diffs, symbols, and targeted snippets over full-file dumps.
- Do not scan the entire repository.
- Do not read more than 8 files without explaining why.
- Do not read generated folders, dependency folders, logs, or `.git`.
- Use Claude Sonnet as the default model and escalate only for risk or ambiguity.

After a large completed task, recommend starting a new session so the next watch begins with clean context.
