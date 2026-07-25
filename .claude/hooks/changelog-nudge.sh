#!/bin/sh
# Stop hook: soft reminder to update CHANGELOG.md (and CURRENT_STATE.md) when
# source files changed but the docs the Plan Check rule requires weren't touched.
# Non-blocking by design - the agent can consciously skip a trivial fix.
set -eu
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$root" || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

base_branch=$(git symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')
[ -z "$base_branch" ] && base_branch=main
merge_base=$(git merge-base HEAD "origin/$base_branch" 2>/dev/null || git merge-base HEAD "$base_branch" 2>/dev/null || echo "")

committed=""
[ -n "$merge_base" ] && committed=$(git diff --name-only "$merge_base"...HEAD 2>/dev/null || true)
working=$(git status --porcelain --untracked-files=no 2>/dev/null | cut -c4-)
all=$(printf '%s\n%s\n' "$committed" "$working" | sed '/^$/d' | sort -u)

echo "$all" | grep -qE '^(apps|libs)/' || exit 0
echo "$all" | grep -qx 'CHANGELOG.md' && exit 0

marker="$root/.claude/.changelog-nudge-state"
hash=$(echo "$all" | shasum | cut -d' ' -f1)
[ -f "$marker" ] && [ "$(cat "$marker")" = "$hash" ] && exit 0
echo "$hash" > "$marker"

extra=""
echo "$all" | grep -qx 'docs/product/CURRENT_STATE.md' || extra=" and docs/product/CURRENT_STATE.md"

jq -n --arg msg "Source changed under apps/ or libs/ but CHANGELOG.md${extra} haven't been touched. Per AGENTS.md's After Coding step: add an [Unreleased] entry (and sync CURRENT_STATE.md) once this task is actually done - skip consciously for trivial/non-user-facing changes, don't skip by default." \
  '{systemMessage: $msg, hookSpecificOutput: {hookEventName: "Stop", additionalContext: $msg}}'
