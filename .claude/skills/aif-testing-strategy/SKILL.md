---
description: Choose focused tests for Applye changes based on risk, contracts, and user workflows.
---

# AIF Testing Strategy

Use for new behavior, bug fixes, changed contracts, or uncertain coverage.

## Steps

1. Identify the behavior under test.
2. Prefer existing test patterns.
3. Cover the highest-risk path first.
4. Add regression tests for fixed bugs.
5. Avoid brittle tests tied to implementation details.
6. Run relevant existing commands only.

## Output

Return test plan, commands, coverage gaps, and skipped checks.
