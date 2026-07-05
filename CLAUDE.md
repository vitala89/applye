# Claude Code AIF Notes

Read `AGENTS.md` and `PROJECT_CONTEXT.md` before non-trivial work.

Use the `aif-orchestrator` skill before non-trivial feature, architecture, debug, test, security, privacy, docs, commit, or branch-finish work. The main Claude Code session remains the conductor; subagents are specialists.

Applye is an Nx monorepo for a privacy-first Tauri 2 + Angular job-search app. Keep project-specific facts in `PROJECT_CONTEXT.md`; do not duplicate large context here.

## Token Rules

- Keep logs and summaries short.
- Prefer diffs, symbols, and targeted snippets over full-file dumps.
- Do not scan the whole repository.
- Do not read more than 8 files without explaining why.
- Do not read generated folders, dependency folders, logs, or `.git`.
- Use Claude Sonnet as the default model.

After a large completed task, recommend starting a new session so the next task begins with clean context.
