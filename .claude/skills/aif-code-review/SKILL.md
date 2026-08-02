---
description: Review Applye diffs for correctness, regressions, maintainability, and missing tests.
---

# AIF Code Review

Use before finalizing meaningful code changes or when asked for review.

## Steps

1. Review the diff, not memory.
2. Review along two axes, separately, and report them separately. Merging them lets a diff that satisfies every written rule pass while being the wrong shape.
   - **Standards**: what this repository has written down. `docs/governance/CODE_QUALITY.md`, the size budgets, the validation matrix, attribution, the dash ban, i18n key parity, and the commit rules.
   - **Design**: whether the change is the right shape. Does it deepen the module or widen its surface, is the seam where the behavior actually lives, is the test at the level the bug lives at, and would the next change in this area be easier or harder.
3. Prioritize bugs, regressions, data loss, and missing tests.
4. Check alignment with Applye architecture and privacy principles.
5. Ask of every new test: does it fail without the fix? A test that passes against the unfixed code is a finding, not coverage.
6. Keep findings concrete with file and line references.
7. Separate required fixes from optional improvements.

## Output

Return findings by severity under each axis, test gaps, and a brief summary.
