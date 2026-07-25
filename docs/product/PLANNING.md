# Applye Planning Workflow

This document defines the lightweight planning and prioritization system for Applye.

Applye is designed for solo development by Vitalii and is structured to scale to external contributors over time without introducing unnecessary management overhead.

---

## Planning Philosophy

Applye uses a **lightweight Personal Kanban** system combined with structured **feature briefs** instead of full Scrum.

### No-Scrum Rule

Applye does not use full Scrum by default:

- **No sprint velocity** tracking or calculations.
- **No story points** (we use rough T-shirt sizing instead).
- **No burndown charts** or complex agile tracking metrics.
- **No Scrum roles** (Scrum Master, Product Owner).
- **No daily ceremonies** or meeting/process bureaucracy for ceremony's sake.

---

## Task & Idea Statuses

Every task, feature, or idea must be classified into one of the following states:

- **Idea**: Raw idea or backlog item, not yet reviewed or detailed.
- **Needs analysis**: Needs architectural layout, security check, privacy verification, or further scoping before execution.
- **Ready**: Scoped, estimated, and ready for implementation.
- **In progress**: Active work currently being executed on a feature branch.
- **Review**: Feature complete, undergoing tests, security/privacy review, or code check.
- **Done**: Merged, verified, and logged in the CHANGELOG.md unreleased draft section.
- **Blocked**: Active blocker exists (external API issue, platform restriction, etc.).
- **Later**: Deferred to a subsequent roadmap phase.
- **Rejected**: Decided against implementing. Archived or deleted.

---

## Estimation & Prioritization Metrics

Instead of exact hour estimates or story points, we prioritize and estimate tasks using four lightweight dimensions:

### 1. Priority

- **P0**: Blocking issue, hotfix, or critical must-do-now.
- **P1**: Next important milestone feature.
- **P2**: Useful soon, enhances experience.
- **P3**: Nice-to-have or future idea.

### 2. Effort (T-shirt sizing)

- **XS**: Very small, less than half a day.
- **S**: Small, about 1 day.
- **M**: Medium, 2-3 days.
- **L**: Large, about 1 week.
- **XL**: Too large. **Must be split** into smaller features or tasks before implementation starts.

### 3. Risk

- **Low**: Docs updates, copy changes, simple styling, or small isolated UI tweaks.
- **Medium**: Multi-file features, local state changes, i18n translations, or testing setup.
- **High**: SQLite database migrations, file storage, sync mechanisms, authentication, user privacy handling, external APIs, MCP server integrations, or complex shell scripts. Requires architecture, security, or privacy review first.

### 4. Impact

- **Low**: Minor polish, style improvements, or edge case optimization.
- **Medium**: Improves workflow efficiency, developer experience, or app performance.
- **High**: Core user value, major new capabilities, or unlocks subsequent critical milestones.

---

## Ownership Mode

- **Vitalii**: Primary owner and maintainer.
- **AI-assisted**: Collaborative mode where an AI agent plans, executes, or reviews tasks.
- **Contributor-friendly**: Clearly documented tasks with explicit acceptance criteria, expected file paths, and minimal context requirements.
- **Needs specialist review**: High-risk tasks requiring deep security, privacy, or database review before merging.

---

## Next-Action Rule

When deciding what to work on next, prioritize tasks that align with the following criteria in order:

1. **Dogfooding Need**: Resolves an immediate workflow friction for the primary developer.
2. **User Value**: Directly improves core value for the end user.
3. **Unblock Value**: Unlocks other dependent P1 tasks or subsequent roadmap milestones.
4. **Low/Medium Effort**: Quick wins (XS/S/M effort) to maintain high momentum.
5. **Manageable Risk**: Prioritize Low/Medium risk tasks, or schedule High risk tasks with explicit research phases.

---

## Lightweight Weekly Review (Optional)

An optional, lightweight ritual to prevent document drift and realign focus. It consists of checking:

- **Completed**: Have all finished tasks been moved to `Done` status and logged in `CHANGELOG.md`?
- **Blocked**: What is blocking active tasks, and how can they be unblocked?
- **Next**: What are the next 2-3 prioritized tasks to move into `Ready` or `In progress`?
- **Ideas to triage**: Review new entries in [IDEAS.md](IDEAS.md) and classify or archive them.
- **Docs to sync**: Ensure [CURRENT_STATE.md](CURRENT_STATE.md) and [FEATURE_INDEX.md](FEATURE_INDEX.md) match actual branch statuses.
