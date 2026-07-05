# AIF Workflow

## Standard Flow

1. Classify the task.
2. Read `AGENTS.md`, `CLAUDE.md`, and `PROJECT_CONTEXT.md` when needed.
3. Use `aif-orchestrator` for non-trivial work.
4. Use `aif-context-gate` before broad context gathering.
5. Use focused skills or read-only subagents for specialist input.
6. Make scoped changes.
7. Run relevant existing checks.
8. Review the diff and update docs.
9. Summarize changes, verification, risks, and next steps.

## Required Specialist Reviews

- Security review: auth, secrets, MCP, shell commands, dependencies, browser automation, or external tools.
- Privacy review: user data, storage, sync, notifications, external job sources, plugins, or MCP.
- Testing strategy: new behavior, bug fixes, or changed contracts.
- Docs sync: behavior, workflow, setup, privacy, or security changes.

## Branch Finish

Before opening or handing off a PR, run the branch finisher workflow: diff review, targeted checks, docs sync, risk notes, and Conventional Commit suggestion.
