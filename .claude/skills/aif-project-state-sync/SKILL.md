---
name: aif-project-state-sync
description: Sync and manage product/feature state, templates, ideas, ADRs, and canonical project documents.
---

# AIF Project State Sync

Use this skill when dealing with planning, next steps, ideas, roadmap updates, feature prioritization, architecture direction, or after completing a feature.

## Steps

1. **Classify Request**: Classify the request into one of: `idea`, `feature`, `architecture decision`, `docs sync`, `release note`, or `next action`.
2. **Determine Read List**: Determine which documents to read according to [AIF Project State Policy](docs/ai/project-state-policy.md):
   - For operational/daily state: [CURRENT_STATE.md](docs/product/CURRENT_STATE.md)
   - For feature work: corresponding brief in `docs/product/feature-briefs/`
   - For ideas: [IDEAS.md](docs/product/IDEAS.md)
   - For strategy: [ROADMAP.md](ROADMAP.md)
   - For execution steps: [STEP_BY_STEP_PLAN.md](STEP_BY_STEP_PLAN.md)
3. **Determine Write List**: Identify which documents require updates. Prevent unnecessary modifications to root canonical files (`ROADMAP.md`, `INSTRUCTIONS.md`, `STEP_BY_STEP_PLAN.md`, `CHANGELOG.md`) for minor/non-strategic changes.
4. **Create or Update Feature Brief**: If a feature is accepted, ensure a feature brief exists under `docs/product/feature-briefs/` using [FEATURE_BRIEF_TEMPLATE.md](docs/product/feature-briefs/FEATURE_BRIEF_TEMPLATE.md).
5. **Update Indices**: Update [CURRENT_STATE.md](docs/product/CURRENT_STATE.md) and [FEATURE_INDEX.md](docs/product/FEATURE_INDEX.md) when feature states or focus branches change.
6. **Changelog Rules**: Only add `CHANGELOG.md` `[Unreleased]` entries for actual code/docs/product changes. Do not include raw ideas or draft proposals in the changelog.
7. **Recommend Action**: Formulate the next operational action recommendation clearly.

## Output

Return a concise summary detailing:

- Classification of request
- Files read & files written
- Summary of state updates (e.g. new idea logged, feature brief created, state synced)
- Recommended next step
