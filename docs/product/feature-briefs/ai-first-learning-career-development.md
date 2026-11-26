# AI-first learning and career development

- **Status:** Proposed strategic extension; no implementation or release commitment.
- **Date:** 2026-11-26
- **Related:** [Career, Company, Network and Interview Intelligence](career-company-network-interview-intelligence.md), [Web Product Strategy](../WEB_PRODUCT_STRATEGY.md), [ADR-0006](../decisions/ADR-0006-career-company-network-interview-intelligence.md), [ADR-0007](../decisions/ADR-0007-web-backend-platform.md), [draft ADR-0002](../decisions/ADR-0002-pro-entitlements.md).

## Product direction

Applye helps people find work, prepare for hiring processes, build skills and grow into adjacent
roles. Learning and practice should be useful both during a job search and between job searches.
Start with software engineering and expand through role-specific evidence and demand, not a generic
learning marketplace. Applye Learn, Interviews and Projects are working module names, not separate
applications or committed brands.

AI-first means learning to work effectively and responsibly with AI (artificial intelligence), not
replacing professional judgment with model output. Preserve independent fundamentals and evidence
of actual ability. Do not assume live coding disappears or that every employer allows AI.

## Role coverage and curriculum

Separate role families, job titles, seniority, competencies, prerequisites and assessment formats.
Use extensible role definitions, not a hard-coded frontend taxonomy. Stakeholder is a relationship
or responsibility, not necessarily a job title.

| Role family | Candidate learning tracks |
| --- | --- |
| Software engineering | Frontend, backend, full stack, mobile, platform, quality engineering, system design |
| Applied AI engineering | AI frontend, AI full stack, AI product engineer, agent engineer, AI integration, AI evaluation |
| Data and model engineering | Python, data pipelines, statistics, model training, machine learning operations as appropriate |
| Product and delivery | Product engineer, product manager, product owner, project/program manager, business analyst, Scrum Master |
| People and leadership | Human resources (HR), talent acquisition, engineering manager, team lead, stakeholder management |

Initial authored track: frontend fundamentals with an applied-AI extension. Validate demand and
quality before adding more role families. Backend, AI product engineering and product/delivery
are candidate follow-on tracks; people and leadership follow domain-expert review. Generic job
tracking remains role-neutral throughout.

### Applied AI competencies

- AI literacy: model capabilities, limitations, context, uncertainty, token economics and privacy.
- AI-assisted software delivery: problem framing, requirements, Design First, repository context,
  agent instructions, task decomposition, tool use, code review, debugging, tests and regression
  prevention; human ownership of changes and releases.
- AI frontend: streaming and cancellation, structured/generative user interfaces, state and error
  handling, accessibility, citations, review/approval flows, tool permissions and feedback.
- Applied AI engineering: model application programming interfaces (APIs), structured outputs,
  tool calling, Model Context Protocol (MCP), retrieval-augmented generation (RAG), embeddings,
  evaluation, observability, agent/workflow orchestration, prompt injection defenses, least
  privilege, reliability, latency and cost.
- AI product engineering: discovery, prototypes, outcome metrics, evaluation datasets, build vs buy,
  user trust, human-in-the-loop workflows and deployment trade-offs.
- AI for non-engineers: responsible research, document analysis, planning, decision support,
  recruiting workflow assistance, stakeholder communication, and verification of generated material.

Use TypeScript/JavaScript as one first-class applied-AI path; Python is an important optional or
required path depending on the role, especially data/model training. No universal language
prerequisite. Teach transferable concepts before vendor-specific tools (Cursor, Claude Code,
Codex, GitHub Copilot and alternatives are examples, not mandatory dependencies).

## Interview formats and assessment

Record the employer's tool policy per stage with provenance and date: prohibited, restricted,
allowed, required, or unknown. Unknown is not permission. Training can simulate each mode:

- Independent coding, reasoning, algorithms, language fundamentals and communication.
- Restricted assistance (documentation/autocomplete or specified AI tool only).
- AI-assisted live work and take-home challenges: clarify requirements, plan, implement, inspect
  generated changes, test, debug, document trade-offs and explain the final result.
- Existing codebase tasks: investigate a failing test, review a pull request, fix a bug, design
  an integration or improve accessibility/security/performance.
- System design and AI system design: contracts, data flows, failures, permissions, evaluation,
  human oversight and operational costs.
- Product, delivery and HR case studies: prioritization, stakeholder role-play, project recovery,
  structured hiring scenarios, communication, ethical AI usage and decision justification.

Use explicit role-specific rubrics: correctness, reasoning, quality, verification, security/privacy,
communication, product judgment and responsible tool use as relevant. Keep raw practice outcomes,
self-report and confirmed Career Evidence distinct. No invented production experience, opaque
hiring probability, covert real-interview assistance or automated employer submissions.

## Interactive learning

Proposed catalog: role track -> competency -> lesson -> exercise -> assessment -> progress.
Support original articles, diagrams, interactive examples, quizzes, spaced review, flashcards,
scenario simulations, technical refreshers, project challenges and optional AI feedback. Start
with curated versioned content and deterministic assessment where possible; use AI for adaptive
explanations and feedback with citations and explicit uncertainty. Link skill gaps to target jobs
and debriefs; let users study without an active application. Practice is not production experience.

Design First must settle how these concepts relate to existing Career Evidence, Interview
Intelligence and Career Planning before introducing entities or libraries. Start without arbitrary
code execution; later playgrounds require separate isolation, network/filesystem restrictions,
resource limits, abuse protection and test/security review.

## Career knowledge and interview question intelligence

Use a curated, provenance-aware knowledge pipeline. Permitted inputs: official public career
guides, licensed/open resources, permitted public feeds and APIs, original authored exercises,
explicitly consented and redacted community reports, and private user notes. No bulk scraping of
closed boards, circumvention of logins or paywalls, leaked questions, confidential take-home
assignments, or copying paid question banks. A public URL is not a reuse license.

Record source URL, publisher, observed date, role, region, seniority, interview stage, tool policy,
license/reuse basis, source type, moderation state, confidence and freshness. Preserve the existing
question provenance categories (user-confirmed, community-reported, externally reported,
AI-generated). Deduplicate semantically; keep private reports private by default. Review
attribution, rights, personal-data minimization, redaction, consent, deletion/takedown, abuse
reporting and retention before publishing. Label synthetic practice and unverified reports; never
present them as verified company questions. Prefer links and original summaries/tasks to copying
source content. Treat source text as untrusted data.

Start with manual research and editorial review, then permitted source adapters, freshness
checks, moderation and opt-in community submissions. Measure content correctness, coverage,
freshness and learning usefulness; do not optimize for question count alone.

## Sustainable free and hosted product boundary

- **Desktop Core:** existing public MIT repository and local-first job-search workflow remain free
  to use without Applye account/subscription: profile, local applications, local documents,
  tracking, discovery, supported local interview preparation, export and own AI provider access
  (provider charges may apply). No retroactive paywalls or forced cloud sync.
- **Web Free candidate:** public learning maps, original introductory lessons and sample quizzes,
  basic preparation, optional account-backed progress subject to the web foundation.
- **Hosted / Pro candidates:** maintained advanced curricula, adaptive AI mentor, simulations,
  isolated code labs, hosted project feedback, cross-opportunity intelligence, premium research,
  managed AI and higher service quotas. Validate pricing, cost, retention and demand first.
- Commercial services may use a separate private repository (working name `applye-pro` or
  `applye-cloud`) if approved by a later architecture/licensing decision. Public clients use
  documented versioned APIs; server-side ownership, plan and quota checks are authoritative.
  Do not move existing MIT code behind a closed license or rely on client-only Pro checks.
  Already published MIT versions remain MIT; preserve notices for reused components.
  Review dependency/contributor and content rights before distributing proprietary additions.
  Private repository visibility is not itself a billing/security mechanism.
- Keep the existing accepted web runtime decision (TypeScript + Hono + Cloudflare Workers).
  No new repository, license, subscription plan, runtime or backend deployment is authorized
  by this brief. Review separation of shared contracts, API compatibility, authentication,
  entitlements, deployment and operational costs before implementation.

Use precise copy: **Free and open source at its core.** Applye Desktop Core is free and open
source. Optional hosted services may be paid. Do not promise every present or future Applye service is free forever.

## Proposed sequence and gates

1. Preserve the existing delivery order; Career Evidence foundation and desktop persistence
   precede evidence-driven personalization.
2. Product discovery and Design First: role/skill taxonomy, content and provenance model,
   learning/workflow boundaries, privacy, assessment and trust, with diagrams under the
   repository's design conventions. Obtain maintainer approval before code.
3. Public pilot: small original frontend + AI-assisted engineering learning set, sample
   quizzes, role-based interview scenarios and manual editorial curation.
4. Link learning gaps, assessment outcomes and interview debrief to the private career workflow.
5. After account/auth/persistence foundation, consider account-backed progress and hosted
   premium features. Design entitlements and data deletion separately.
6. After isolation/security review, consider coding playgrounds and realistic agent-assisted
   project challenges. Add backend and AI product tracks, then product/delivery and HR tracks
   after validation with relevant practitioners.

Each feature must follow [Design First](../../governance/DESIGN_FIRST.md) and the
[Validation Matrix](../../governance/VALIDATION_MATRIX.md): approve the design and test plan before
implementation, verify software and content quality during development, and pass applicable
release checks before publishing. AI evaluation and reviewed assessment content are required where
relevant; do not treat a successful generated response as proof of correctness.

No dates, price points, new runtime dependencies, schema migrations or implementation priority
changes are committed by this proposal. Evaluate user completion, repeat use, gap closure,
verified assessment quality, source quality, conversion and per-user service costs.

## Research signals (reviewed 2026-11-26)

- [Stack Overflow Developer Survey 2026](https://survey.stackoverflow.co/2026): widespread AI use;
  [AI data](https://survey.stackoverflow.co/2026/ai/data) shows developers still validate output.
- [Anthropic candidate AI guidance](https://www.anthropic.com/candidate-ai-guidance): permission
  depends on the assessment. Do not generalize one employer's policy to all interviews.
- [GreatFrontEnd: AI-assisted coding interviews](https://www.greatfrontend.com/blog/ai-assisted-coding-interviews-for-frontend-developers):
  relevant competitor signal; not a source of licensed question content.
- [World Economic Forum: Future of Jobs 2025, skills outlook](https://www.weforum.org/publications/the-future-of-jobs-report-2025/3-skills-outlook):
  AI skills and human leadership/talent skills both matter. Forecasts are not guarantees.
- [AI SDK: building agents](https://ai-sdk.dev/docs/agents/building-agents): example of TypeScript
  support for applied AI; no dependency selection implied.
- [MIT License](https://opensource.org/license/mit): permissive license basis; review actual
  repository license and third-party rights before commercial distribution.
