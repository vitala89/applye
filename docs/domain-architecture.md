# Domain architecture

Applye uses **pragmatic Domain-Driven Design (DDD)** together with the repository's existing Clean Architecture boundaries. DDD here is a tool for keeping the software aligned with the job-search domain. It is not a requirement to reproduce every tactical pattern from the literature.

The goal is simple: a business concept should have one stable meaning and one recognisable name across product discussion, TypeScript, Rust, tests, documentation, IPC, and persistence boundaries.

## Principles

1. **Domain language before technical language.** Prefer names that describe the job-search workflow over generic names such as `Item`, `Record`, `Manager`, `Handler`, or `Processor`.
2. **One concept, one meaning.** Do not use two business terms for the same concept unless the distinction is intentional and documented.
3. **Boundaries follow responsibilities.** Domain rules, application orchestration, infrastructure, and presentation remain separate.
4. **DDD patterns earn their place.** Do not introduce an Aggregate, Entity, Value Object, Repository, Domain Event, Factory, or separate Nx library only because DDD has a pattern with that name.
5. **Existing architecture wins over ceremony.** A new domain model must fit the dependency rules in `docs/architecture.md`, `AGENTS.md`, and the relevant ADRs.
6. **Privacy and security are domain constraints.** Career data, applications, contacts, documents, imported job content, and credentials remain sensitive by default.

## Ubiquitous language

These are the preferred business terms for the current product. The vocabulary is deliberately small. Extend it when the product gains a genuinely new concept, not when code needs another implementation detail.

| Term | Meaning | Avoid using as a synonym |
| --- | --- | --- |
| **Job** | A job opportunity or posting Applye knows about. | item, record, vacancy entity |
| **Job Source** | A source from which jobs are discovered or imported. | provider when the code means a job source |
| **Job Identity** | The company/title identity resolved for a job. | metadata blob |
| **Job Score** | The evaluation of a job against the candidate profile. | result when the specific score is meant |
| **Candidate Profile / Profile** | The user's reusable career profile and preferences. | user data, candidate record |
| **Career Evidence** | A user-confirmed or explicitly sourced fact supporting a skill, achievement, project or career claim. | AI guess, generated claim |
| **Career Story** | A reusable evidence-backed story for interviews and professional positioning. | STAR blob |
| **Communication Profile** | User-controlled preferences and observed speaking/writing patterns used to personalise delivery without changing facts. | personality profile |
| **Application** | The user's tracked application to a job. | submission when no submission occurred |
| **Pipeline** | The tracked progression of applications through job-search stages. | board when the domain concept, rather than the UI, is meant |
| **Pipeline Stage** | A business stage in the application pipeline. | column when the domain concept is meant |
| **Interview** | An interview associated with an application. | event when the interview itself is meant |
| **Follow-up** | A follow-up action or draft associated with the application workflow. | message when the broader workflow action is meant |
| **CV** | A curriculum vitae/resume document managed by Applye. UI copy may use the market-appropriate word. | file when the document concept is meant |
| **Cover Letter** | A cover-letter document managed by Applye. | document blob |
| **Draft** | A not-yet-final document or generated proposal that remains under user control. | temp record |
| **Tailoring** | Adapting a CV or cover letter to a particular job. | processing, transformation |
| **Scoring** | Evaluating job/profile fit. | processing, analysis when the specific workflow is meant |
| **Company** | An employer/organisation that may have many jobs, applications, people, interviews and reports. | company string on an application |
| **Job Opportunity** | A role/posting at a Company; it may exist without an Application. | application |
| **Contact** | A person the user has intentionally added to their professional network. | every discovered person |
| **Interaction** | A recorded touchpoint with a Contact, such as LinkedIn, email, call, interview or referral. | message when the broader touchpoint is meant |
| **Interview Preparation** | Preparation material and workflow for an interview. | prep data |
| **Preparation Plan** | A structured, adaptive curriculum for a company/role/stage. | generated chat |
| **Interview Experience** | User-reviewed record of what happened in a real interview stage. | raw transcript |
| **Community Contribution** | An explicit, reviewed payload a user chooses to share beyond private data. | automatic upload |
| **Claim** | A statement derived from a source or inference that carries provenance and verification state. | fact without source |
| **Freshness** | How current a claim is, independently of confidence. | confidence |
| **AI Proposal** | AI-produced output presented for user review or acceptance. | decision, action |

`Application` is not synonymous with `Job`. A job may exist without an application. Likewise, generating or tailoring documents does not mean an application has been submitted. Names and state transitions must preserve those distinctions.

When a term becomes ambiguous, update this table or record the distinction in an ADR before creating competing vocabulary in code.

## Logical bounded contexts

Applye currently has the following **logical** domain areas:

- **Job Discovery**: job sources, intake, identity, discovery, deduplication, scoring inputs.
- **Application Tracking**: applications, pipeline stages, status history, follow-ups.
- **Career Intelligence**: Candidate Profile, Career Evidence, Experience, Projects, Skills, Achievements, Career Stories, Education, Career Goals and Communication Profile.
- **Documents**: CVs, cover letters, drafts, export, tailoring and document lifecycle.
- **Company Intelligence**: companies, job opportunities, business/technology claims, reviews, people discovery, company preparation and relationship history.
- **Network Intelligence**: contacts, relationships, interactions, outreach, follow-ups, referrals and provider-neutral communication channels.
- **Interview Intelligence**: interviews, stages, research, Preparation Plans, learning/practice, mock interviews, debriefs, Interview Experiences and personal question banks.
- **Community Intelligence**: explicit reviewed contributions, moderation, published interview reports, company interview patterns and public question intelligence.
- **Evidence & Provenance**: sources, observations, claims, verification, confidence and freshness used across company, network and interview intelligence.
- **AI Assistance**: opt-in proposals that assist another domain workflow without owning the user's decision.
- **System and Settings**: application configuration and cross-cutting local system concerns. This is supporting infrastructure, not a place to dump business concepts that lack an owner.

These are conceptual boundaries, **not instructions to create one Nx library per bounded context**. Split a physical module or library only when doing so improves cohesion, dependency direction, independent evolution, testability, or a real public boundary. Do not create empty architectural scaffolding in anticipation of possible future complexity.

A concept can participate in another context through an explicit contract. Avoid sharing mutable implementation details merely because two contexts currently need similar data.

## Layer ownership

The existing repository layers remain canonical:

```text
apps/desktop (presentation/composition)
        |
        v
libs/application (use cases, orchestration, screen/application state)
        |
        v
libs/data (infrastructure gateways, Tauri IPC access)
        |
        v
libs/core (framework-agnostic domain model and pure domain rules)
```

The exact allowed dependency graph is defined and enforced by `docs/architecture.md` and Nx module-boundary rules. This diagram describes responsibility, not permission to add a dependency that Nx forbids.

### `libs/core`: domain

Put framework-agnostic business concepts, invariants, typed contracts, and pure domain rules here when they are shared or deserve an independent domain seam.

Domain code must not depend on Angular, Tauri, SQLite, network clients, filesystem APIs, or presentation concerns.

Prefer behaviour-oriented names such as `scoreJob`, `resolveJobIdentity`, or `canMoveApplicationToStage` over generic verbs such as `process`, `handle`, or `execute` when the business action is known.

### `libs/application`: application layer

Application services and signal stores coordinate use cases, screen/application state, domain rules, and infrastructure gateways. They do not redefine the domain vocabulary.

Examples include job intake, document tailoring orchestration, application workflow state, and page stores. `ADR-0005` remains authoritative for page-state ownership.

### `libs/data`: infrastructure and ports to Tauri

Data access stays behind focused gateways such as `JobsGateway`, `DraftsGateway`, and `ProfileSettingsGateway`.

Applye deliberately uses **Gateway** rather than mechanically introducing `IJobRepository` / `JobRepositoryImpl`. A gateway can represent IPC and persistence capabilities without pretending that every infrastructure boundary is a DDD Repository.

Introduce a Repository abstraction only if aggregate persistence semantics actually require one and the distinction makes the model clearer than the existing gateway vocabulary.

### `apps/desktop`: presentation and composition

Components render and delegate. They may translate domain state into view state and user-facing copy, but business rules do not move into a component merely because a button triggers them.

UI-specific words such as `dialog`, `card`, `column`, `tab`, and `panel` are appropriate for view concepts. Do not let them replace the corresponding domain term below the presentation boundary.

### Rust / Tauri

Tauri commands remain thin adapters. Rust validation, domain behaviour, persistence, parsing, and provider concerns should be separated where those responsibilities exist.

IPC naming should preserve the same business meaning used by TypeScript. Serialization conventions such as snake_case are transport details and do not create a second domain vocabulary.

## Tactical DDD policy

Use tactical DDD patterns selectively.

### Entity

Use entity semantics when identity and lifecycle matter independently of the current value of the object's fields. A database row is not automatically a rich Entity type.

### Value Object

Introduce a Value Object when a value has meaningful validation, equality, invariants, or domain behaviour that primitive types cannot express safely. Do not wrap every string or number.

### Aggregate

Introduce an Aggregate when a consistency boundary has invariants that must be protected together. Do not make every feature folder an aggregate and do not invent aggregate roots for simple CRUD-shaped data.

### Repository

Use a Repository when the domain needs collection-like persistence of aggregates. Existing `*Gateway` boundaries remain the default for Tauri/data access.

### Domain Event

Use a Domain Event when a meaningful domain fact must be observed by multiple decoupled behaviours or persisted/audited as a fact. Do not introduce an event bus for ordinary function calls or local UI state.

### Domain Service

Use a domain service for business behaviour that genuinely belongs to the domain but has no natural entity/value-object owner. Application orchestration is not a domain service.

## Naming use cases

Prefer business verbs and explicit outcomes:

```text
Good
  intakeJob
  scoreJob
  tailorCv
  createApplication
  moveApplicationToStage
  scheduleInterview
  draftFollowUp

Avoid when a domain verb is available
  processData
  handleItem
  updateRecord
  executeAction
  runManager
```

Names do not need to mimic English sentences mechanically. Clarity in the local context is more important than forcing `CreateXUseCase` or similar suffixes onto every operation.

## Cross-layer language check

When introducing or changing a business concept, trace it through the relevant layers:

```text
product / UI language
        |
application use case
        |
domain model
        |
gateway / IPC contract
        |
Rust domain or persistence boundary
```

Ask:

1. Is the same business concept recognisable at every relevant layer?
2. Does any layer accidentally use a different term with the same meaning?
3. Does one term represent two materially different concepts?
4. Is technical vocabulary leaking into product/domain naming?
5. Is a persistence or UI shape being mistaken for the domain model?

Transport and persistence names may differ when required by an external API, SQL schema, or serialization convention. Keep that translation at the boundary rather than spreading the external vocabulary through the domain.

## Rules for new work

Before adding a new model, workflow, gateway, command, or durable public API:

1. Identify the owning logical domain area.
2. Reuse the ubiquitous language above where the concept already exists.
3. If the concept is new, define its meaning before creating competing names across layers.
4. Put business invariants in the domain layer when they can be pure and framework-independent.
5. Put use-case orchestration and application state in `libs/application`.
6. Keep infrastructure behind `libs/data` gateways and thin Tauri commands.
7. Keep presentation concerns in the app/UI layer.
8. Add the smallest useful abstraction. Do not create DDD scaffolding speculatively.
9. Treat changes to domain boundaries, public library APIs, schemas, privacy, or security as architecture decisions and follow the repository's grilling/ADR rules.
10. Test business rules at the lowest layer that owns them; test adapters separately from the rule they invoke.

## What this document does not change

This document formalises the architecture Applye already uses. It does **not** authorize a repository-wide refactor, rename existing stable APIs merely for terminology purity, change database schemas, introduce a new state-management library, or replace existing gateways.

When this document conflicts with a specific accepted ADR about an existing boundary, the ADR wins for that decision. When the domain model itself changes, update this document together with the code or ADR so future agents do not learn a stale language.
