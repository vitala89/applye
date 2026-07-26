# Claude Code Applye Notes

Start every non-trivial task at `docs/internal/AGENT_START_HERE.md`.

Read, in order:

1. `AGENTS.md`
2. `docs/internal/PROJECT_CONTEXT.md`
3. `docs/product/CURRENT_STATE.md`
4. the latest entry in `docs/internal/DUTY_WATCH.md`
5. `docs/governance/VALIDATION_MATRIX.md`

Run the Plan Check from `AGENTS.md` before implementation or before proposing what to work on next. State where the task sits, what is already shipped, whether current state is stale, which checks apply, and whether the work is privacy-sensitive or security-sensitive.

The main Claude Code session remains the conductor. Skills and subagents are specialists, not independent broad implementers.

## Duty Watch handoff

Before ending a completed, partial, blocked, or rolled-back non-trivial session:

- review the final diff;
- run and report the relevant checks;
- update `docs/product/CURRENT_STATE.md` if project status changed;
- append a truthful entry to `docs/internal/DUTY_WATCH.md`;
- update changelog, roadmap, ADRs, specifications, migrations, privacy, security, and design docs when applicable;
- record the concrete next first action.

Never claim a check passed unless it was actually run and observed.

## Commits and pull requests

Commit messages and PR descriptions must not include `Co-authored-by`, `Signed-off-by`, generated-by text, model names, or agent attribution. Commits are authored solely by the repository Git user.

Before commit, run the relevant validation matrix entries, `npm run format:check`, and `git diff --check` when available. Do not open a PR with a known failing gate unless the PR explicitly documents a blocked state.

## Token and context rules

- Keep logs and summaries short.
- Prefer diffs, symbols, and targeted snippets over full-file dumps.
- Do not scan the entire repository.
- Do not read more than 8 files without explaining why.
- Do not read generated folders, dependency folders, logs, or `.git`.
- Use Claude Sonnet as the default model and escalate only for risk or ambiguity.

After a large completed task, recommend starting a new session so the next watch begins with clean context.
