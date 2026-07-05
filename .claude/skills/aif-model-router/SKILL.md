---
description: Route Applye tasks to the lightest reliable model tier, using Claude Sonnet as the default.
---

# AIF Model Router

Use when task complexity, risk, or ambiguity may change model choice.

## Steps

1. Start with Claude Sonnet.
2. Use `fast` for simple docs or formatting.
3. Use `standard` for normal code, tests, docs, and review.
4. Use `deep` for architecture, security, privacy, hard debugging, or broad impact.
5. Escalate for repeated failures after context has been checked.

## Output

Return the chosen tier and one sentence explaining why.
