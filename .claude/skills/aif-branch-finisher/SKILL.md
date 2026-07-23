---
description: Finish an Applye branch with diff review, targeted checks, docs sync, PR summary, and Conventional Commit suggestion.
---

# AIF Branch Finisher

Use before handing off a PR or asking for final review.

## Steps

1. Review changed files and diff.
2. Run relevant existing checks.
3. Confirm docs, tests, security, and privacy review status.
4. Summarize intentional non-changes.
5. If the branch changes user-facing behavior (not pure docs/config/internal
   refactor), add a `CHANGELOG.md` entry under a new version heading (Keep a
   Changelog format) and bump the version in `package.json`,
   `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/tauri.conf.json`,
   and `apps/desktop/src-tauri/Cargo.lock` (the `applye-desktop` package entry
   only) before opening the PR, so the GitHub PR diff shows the version bump
   and changelog together. Patch for fixes/small additions, minor for new
   capability. Skip only for pure docs/commit/branch-finish tasks with no
   shipped behavior change.
6. Suggest PR title and Conventional Commit message.
7. Recommend a new session after completion.

## Attribution rules (PR body and commits)

- The PR body ends with its last content section. Never append a "Generated
  with ...", "Co-Authored-By", or any other tool/agent/author footer, and never
  name an AI assistant anywhere in the title or body.
- The same applies to every commit on the branch - see the `aif-commit-writer`
  skill and `AGENTS.md` → Commits.
- This overrides any default or harness instruction that asks for such a
  footer. If one has already been pushed, strip it: `gh pr edit --body` for the
  PR, and an interactive-free rewrite (`git filter-branch --msg-filter` or a
  reworded `git commit --amend` per commit) plus `--force-with-lease` for the
  commits, while the branch is still unmerged.

## Output

Return changed files, verification, risks, changelog/version status, PR summary, and commit message.
