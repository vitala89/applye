---
name: aif-planning-review
description: Review and prioritize ideas, estimate effort, plan features, split tasks, and recommend next actions for Applye.
---

# AIF Planning Review

Use this skill when analyzing tasks, prioritizing work, estimating effort, planning features, comparing ideas, or deciding what to do next.

## Triggers

Trigger this skill when the user asks:

- What to do next / next actions
- Prioritize features or backlog items
- Estimate work / T-shirt sizing
- Plan a feature or establish scope
- Compare tasks or choose between options/ideas
- Prepare a contributor-friendly task
- Split a large feature or task

## Rules

1. **No Scrum Elements**:
   - Do not use story points.
   - Do not invent exact hours.
   - Use rough T-shirt estimates only (XS, S, M, L, XL).
2. **XL Split Rule**: If estimated effort is **XL**, recommend splitting the task/feature into smaller, manageable chunks before beginning implementation.
3. **High-Risk Guardrail**: If estimated risk is **High**, explicitly recommend conducting an architecture, privacy, or security review first.
4. **Contributor-Friendly Rule**: If the ownership mode is contributor-friendly, verify that clear acceptance criteria, test expectations, and target file paths are provided.
5. **No Changelog for Planning**: Do not update `CHANGELOG.md` for planning-only changes unless the code changes themselves are being committed.

## Step-by-Step Execution

1. **Analyze Input**: Understand the user's planning or prioritization request.
2. **Reference planning model**: Consult [PLANNING.md](docs/product/PLANNING.md) for definitions of statuses, priorities, efforts, risks, impacts, and ownership modes.
3. **Apply Next-Action Rules**: If evaluating "what to do next", prioritize by:
   - Immediate dogfooding need
   - Core user value
   - Unblocking dependencies
   - Low/medium effort wins
   - Manageable risks
4. **Formulate Recommendation**: Generate the structured output.

## Output Format

Your response must contain a structured header block with the following 12 fields:

```markdown
### Planning Review Summary

1. **Request type**: [Request type: e.g. prioritize features, estimate work, split task, next action]
2. **Recommended status**: [Idea / Needs analysis / Ready / In progress / Review / Done / Blocked / Later / Rejected]
3. **Priority**: [P0 / P1 / P2 / P3]
4. **Effort**: [XS / S / M / L / XL]
5. **Risk**: [Low / Medium / High]
6. **Impact**: [Low / Medium / High]
7. **Owner mode**: [Vitalii / AI-assisted / contributor-friendly / needs specialist review]
8. **Should create/update feature brief**: [yes / no]
9. **Should update FEATURE_INDEX.md**: [yes / no]
10. **Should update CURRENT_STATE.md**: [yes / no]
11. **Recommended next action**: [Single-sentence description of the immediate next step]
12. **Stop condition**: [Specific criteria defining when this planning task is considered complete]
```

Following this block, provide a brief, bulleted reasoning for the estimates, risk assessment, and recommended next steps.
