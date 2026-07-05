# Applye Product State System

This directory represents the **operational planning layer** for Applye. It functions as the living memory for daily product planning, architecture decisions, feature designs, and raw ideas.

To preserve stability and avoid unnecessary noise in root level repositories, the project separates **canonical strategic files** from **daily operational files**.

## Document Mapping

### Root Canonical Files

These documents reside at the repository root and act as the high-level canonical truth of the project:

- **[ROADMAP.md](file:///Users/eugenekasap/WebstormProjects/applye/ROADMAP.md)**: Strategic product vision, scope, priorities, and what to build.
- **[INSTRUCTIONS.md](file:///Users/eugenekasap/WebstormProjects/applye/INSTRUCTIONS.md)**: Constitutional / working agreement and how to build (engineering principles, constraints, architectures).
- **[STEP_BY_STEP_PLAN.md](file:///Users/eugenekasap/WebstormProjects/applye/STEP_BY_STEP_PLAN.md)**: Execution checklist and phased step-by-step milestones.
- **[CHANGELOG.md](file:///Users/eugenekasap/WebstormProjects/applye/CHANGELOG.md)**: Historical release record of shipped changes.

### Operational Planning Layer (`docs/product/`)

These documents reside here and are updated frequently by developers and AI agents during execution:

- **[CURRENT_STATE.md](file:///Users/eugenekasap/WebstormProjects/applye/docs/product/CURRENT_STATE.md)**: Daily operational status, current branch focus, recently completed items, active feature briefs, and open questions.
- **[FEATURE_INDEX.md](file:///Users/eugenekasap/WebstormProjects/applye/docs/product/FEATURE_INDEX.md)**: Feature tracking list mapping features to their status, roadmap, and step-by-step plan sections.
- **[IDEAS.md](file:///Users/eugenekasap/WebstormProjects/applye/docs/product/IDEAS.md)**: Raw inbox for new ideas and concepts.
- **`feature-briefs/`**: Accepted feature briefs that describe the target state, scope, and technical plan for a specific feature.
- **`decisions/`**: Architecture Decision Records (ADRs) tracking options considered, outcomes, and technical rationale.
