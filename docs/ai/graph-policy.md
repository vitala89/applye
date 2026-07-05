# Graph Policy

Graph tooling is optional and not configured in this foundation PR.

## Current State

- Do not install or configure Graphify, CodeGraph, Context Mode, Headroom, Token Optimizer, or related tools.
- If a repository already has `.codegraph/`, use CodeGraph before grep, find, or manual file walks for code understanding.
- If no graph index exists, use targeted file and symbol reads.

## Future Use

Graph tooling may be added in a later PR to support symbol lookup, dependency maps, call paths, and context budgets. That PR must include security and privacy review before enabling automation.
