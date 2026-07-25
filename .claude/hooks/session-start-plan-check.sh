#!/bin/sh
# SessionStart hook: surface AGENTS.md's Plan Check section + the live
# docs/product/CURRENT_STATE.md so every fresh session opens with them already
# in context, instead of relying on the agent to remember to read them.
set -eu
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$root" || exit 0

plan_check=$(awk '/^## Plan Check/{f=1} /^## Before Coding/{exit} f{print}' AGENTS.md 2>/dev/null || true)
current_state=$(cat docs/product/CURRENT_STATE.md 2>/dev/null || true)
[ -z "$plan_check" ] && [ -z "$current_state" ] && exit 0

jq -n --arg pc "$plan_check" --arg cs "$current_state" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: ("Plan Check (from AGENTS.md) - do this before starting or proposing work:\n\n" + $pc + "\n\n---\n\ndocs/product/CURRENT_STATE.md (current version):\n\n" + $cs)
  }
}'
