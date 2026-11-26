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

Instead of mandatory exact hour estimates or story points, we prioritize and estimate tasks using four lightweight dimensions. For material work, supplement sizing with a conditional time range and dependencies as described below.

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

## Project management before implementation

Use this section as the planning companion to [Design First](../governance/DESIGN_FIRST.md) and
[Task Triage](../ai/model-policy.md). Keep the existing Personal Kanban, priority, effort, risk
and impact dimensions. Model-routing score, business priority and delivery effort are separate
decisions. Do not introduce Scrum ceremonies, mandatory time tracking or speculative team roles.

For each non-trivial task, record the desired outcome, scope/non-goals, priority, impact, effort,
dependencies, responsible role, approval owner, verification owner and next decision in the
existing feature brief/design/plan. Do not create a new planning file if the existing artifact
can hold this information. For substantial work a linked planning appendix is acceptable.

### SWOT analysis (strategic or material decisions)

SWOT means Strengths, Weaknesses, Opportunities and Threats. Use it for a new product direction,
substantial feature, major architectural alternative, external integration, commercial decision
or material change in security, privacy, accessibility or delivery risk. A small isolated change
needs only a proportionate trade-off/risk note; no full matrix for a typo or routine fix.

| Dimension | Question |
| --- | --- |
| Strengths (internal) | What existing assets, expertise, architecture or capabilities support this option? |
| Weaknesses (internal) | What gaps, technical debt, skills, capacity or cost constraints limit it? |
| Opportunities (external) | What market, user need, ecosystem or technology development could make it valuable? |
| Threats (external) | What competition, dependency, market, regulatory or operational change could undermine it? |

Ground observations in available evidence; label assumptions, unknowns and evidence gaps. Compare
meaningful alternatives (including defer/do nothing when relevant), not artificial options. Connect
material findings to a concrete decision, validation step, mitigation or opportunity to pursue.
A SWOT table is not a substitute for a technical threat model, accessibility review or risk register.

### Responsibility and execution ownership

Use lightweight responsibility assignment for all non-trivial tasks, and a RACI matrix for
cross-functional or multi-stage work where ownership could be unclear.

RACI = Responsible (does the work), Accountable (owns the outcome/decision), Consulted (provides
expert advice), Informed (receives relevant status). Assign exactly one accountable role per
decision/deliverable, with at least one responsible role. Use actual people only if assigned;
otherwise name a role and mark the assignment proposed/unassigned. A solo maintainer may hold
multiple roles. Do not invent staff, expertise, availability or stakeholder approval.

Typical roles (not a staffing commitment): product/maintainer, architect, frontend/backend
engineer, designer, quality assurance (QA), accessibility/security/privacy reviewer, release
owner and AI coding agent. The maintainer retains design approval, merge and release authority.
An AI agent may execute or support an assigned task; it is not the accountable product owner,
and cannot approve its own implementation as independent review. Identify who can perform manual
native or assistive-technology checks. Reuse the canonical task-triage model and tool routing;
recommend an environment/model only when known or verified. Delegation remains opt-in.

### Time, capacity and dependency planning

Preserve XS/S/M/L/XL sizing. Split XL work into independently reviewable slices. For material
tasks, record an indicative effort range (human active effort separately from agent execution
and elapsed calendar time when relevant), confidence and assumptions. Use available capacity,
known constraints and actual evidence; if unknown, label the estimate provisional. Do not
promise an exact duration, date, cost or delivery schedule without the maintainer's agreement.

Break the plan into work packages with deliverables, dependencies, responsible role, estimate,
acceptance/exit criteria and milestones. Include discovery, design, approval, implementation,
testing, accessibility/security review where applicable, independent PR review, merge, main
verification and release validation. Include waiting for owner approval, reviews, external
services, test environments and foreseeable rework in calendar planning; these are not active
engineering effort. Identify critical dependencies and safe parallel work without automatically
spawning agents. Use a timebox or a simple dependency timeline when useful; three-point
optimistic/most-likely/pessimistic estimates or a critical-path diagram are optional for genuinely
complex work. Respect agreed budgets and stop conditions. Update remaining estimates after
discovery, scope changes, failed checks or blockers. Never compress required quality gates to
meet an estimate.

### Actionable risk and decision tracking

For material risks, record cause/event/impact, likelihood and impact (qualitative is sufficient),
mitigation or contingency, responsible role, trigger and status. Distinguish a future risk from
an existing blocker, assumption or dependency; use an existing RAID log (Risks, Assumptions,
Issues, Dependencies) if present, otherwise a short table in the current design/plan. Escalate
unresolved security, privacy, accessibility, data-integrity or release blockers; do not mark
them resolved without evidence. Record the chosen option, rationale, decision owner and remaining
uncertainty. Review planning evidence at Design First approval and implementation handoff;
re-plan material changes before proceeding.

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
