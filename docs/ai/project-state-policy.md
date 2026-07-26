# AIF Project State Policy

This document defines how AI agents and developers interact with strategic and operational project documents in the Applye workspace.

---

## Canonical Document Roles

The workspace uses a tiered document model to avoid codebase pollution and manage token contexts efficiently.

### Strategic Root Documents (Canonical)

- **[ROADMAP.md](../../ROADMAP.md)**: Product strategy, long-term vision, core principles, and what to build.
- **[INSTRUCTIONS.md](../internal/INSTRUCTIONS.md)**: Working agreement, coding rules, engineering standards, and definition of done.
- **[CHANGELOG.md](../../CHANGELOG.md)**: Historical record of shipped changes.

### Operational Planning Documents (`docs/product/`)

- **[PLANNING.md](../product/PLANNING.md)**: The lightweight planning model based on Personal Kanban, feature briefs, and rough estimation metrics (Priority, Effort, Risk, Impact).
- **[CURRENT_STATE.md](../product/CURRENT_STATE.md)**: Daily operational status, current focus, and next actions.
- **[FEATURE_INDEX.md](../product/FEATURE_INDEX.md)**: Master tracker for features, statuses, and cross-references.
- **[IDEAS.md](../product/IDEAS.md)**: Raw idea inbox.
- **`docs/product/feature-briefs/*.md`**: Feature-specific design, scope, and implementation details.
- **`docs/product/decisions/*.md`**: Architecture Decision Records (ADRs) tracking options, outcomes, and rationale.

---

## Read Policy

To keep token usage low and focus context, obey the following rules:

1. **Daily Kickoff**: For any non-trivial task, read [PROJECT_CONTEXT.md](../internal/PROJECT_CONTEXT.md) and [CURRENT_STATE.md](../product/CURRENT_STATE.md) first to understand the current scope and branch focus.
2. **Feature Implementation**: For any specific feature work, read the corresponding feature brief in `docs/product/feature-briefs/` if it exists.
3. **Product Vision Changes**: For strategic direction changes, read [ROADMAP.md](../../ROADMAP.md).
4. **Engineering Constraints**: For coding, architecture, migration, and build rules, read [INSTRUCTIONS.md](../internal/INSTRUCTIONS.md).
5. **Phased Execution**: For checking next steps or verifying milestones, read [CURRENT_STATE.md](../product/CURRENT_STATE.md) and [ROADMAP.md](../../ROADMAP.md).
6. **Release History**: For what has already been built or how versions progressed, read [CHANGELOG.md](../../CHANGELOG.md).
7. **Context Limitation**: Do not read entire large files by default. Read only the specific sections required for the immediate task.
8. **Planning and Estimation**: When prioritizing features, planning next actions, splitting tasks, or estimating effort, refer to [PLANNING.md](../product/PLANNING.md) and invoke the `aif-planning-review` skill.

---

## Write Policy

Keep updates focused and clean. Avoid unnecessary churn on root canonical files:

1. **New Raw Idea**: Update **[IDEAS.md](../product/IDEAS.md)** only. Do not add raw ideas to [ROADMAP.md](../../ROADMAP.md).
2. **Accepted Feature**: Create or update the feature brief in `docs/product/feature-briefs/` and update **[FEATURE_INDEX.md](../product/FEATURE_INDEX.md)**.
3. **Active/In-Progress Work**: Update **[CURRENT_STATE.md](../product/CURRENT_STATE.md)** to indicate what is currently being worked on.
4. **Completed Feature**: Update the feature brief status to `done`, update **[FEATURE_INDEX.md](../product/FEATURE_INDEX.md)**, update **[CURRENT_STATE.md](../product/CURRENT_STATE.md)**, and add a release entry in **[CHANGELOG.md](../../CHANGELOG.md)** under the `[Unreleased]` header.
5. **Completed Milestone Phase**: Update **[ROADMAP.md](../../ROADMAP.md)** only when a specific milestone or step is fully completed.
6. **Strategic Changes**: Update **[ROADMAP.md](../../ROADMAP.md)** only when vision, scope, or product principles change.
7. **Engineering Agreement Changes**: Update **[INSTRUCTIONS.md](../internal/INSTRUCTIONS.md)** only when build rules, lint rules, core architecture patterns, translations rules, privacy defaults, or definitions of done are modified.
8. **Architecture Decisions**: Create a new ADR file in `docs/product/decisions/` using the template.
9. **Planning Sync**: Use `aif-planning-review` outputs to update task statuses, priorities, or efforts in [FEATURE_INDEX.md](../product/FEATURE_INDEX.md) and [CURRENT_STATE.md](../product/CURRENT_STATE.md).

> [!WARNING]
> Do not use [CHANGELOG.md](../../CHANGELOG.md) as a feature backlog. Do not modify root canonical docs for every small feature update.
