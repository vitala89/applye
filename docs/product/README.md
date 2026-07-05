# Applye Product State System

This directory represents the **operational planning layer** for Applye. It functions as the living memory for daily product planning, architecture decisions, feature designs, and raw ideas.

To preserve stability and avoid unnecessary noise in root level repositories, the project separates **canonical strategic files** from **daily operational files**.

## Document Mapping

### Root Canonical Files

These documents reside at the repository root and act as the high-level canonical truth of the project:

- **[ROADMAP.md](../../ROADMAP.md)**: Strategic product vision, scope, priorities, and what to build.
- **[INSTRUCTIONS.md](../../INSTRUCTIONS.md)**: Constitutional / working agreement and how to build (engineering principles, constraints, architectures).
- **[STEP_BY_STEP_PLAN.md](../../STEP_BY_STEP_PLAN.md)**: Execution checklist and phased step-by-step milestones.
- **[CHANGELOG.md](../../CHANGELOG.md)**: Historical release record of shipped changes.

### Operational Planning Layer (`docs/product/`)

These documents reside here and are updated frequently by developers and AI agents during execution:

- **[PLANNING.md](PLANNING.md)**: The lightweight planning model based on Personal Kanban, feature briefs, and rough estimation metrics (Priority, Effort, Risk, Impact).
- **[CURRENT_STATE.md](CURRENT_STATE.md)**: Daily operational status, current branch focus, recently completed items, active feature briefs, and open questions.
- **[FEATURE_INDEX.md](FEATURE_INDEX.md)**: Feature tracking list mapping features to their status, roadmap, and step-by-step plan sections.
- **[IDEAS.md](IDEAS.md)**: Raw inbox for new ideas and concepts.
- **`feature-briefs/`**: Accepted feature briefs that describe the target state, scope, and technical plan for a specific feature.
- **`decisions/`**: Architecture Decision Records (ADRs) tracking options considered, outcomes, and technical rationale.
