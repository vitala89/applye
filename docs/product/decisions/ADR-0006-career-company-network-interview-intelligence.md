# Architecture Decision Record: Career, Company, Network and Interview Intelligence

- **Status**: `accepted`
- **Date**: 2026-10-03

---

## Context

Applye was originally documented as a desktop-only, local-first product. That remains the correct
trust model for the Tauri desktop application, but it was never intended to prohibit a later web
product. The next product phase needs a connected intelligence model spanning desktop and web:

- structured Career Intelligence based on user-confirmed evidence;
- Company Intelligence covering business, technology, jobs, people, reviews and source freshness;
- Network Intelligence for contacts, outreach, referrals and follow-ups;
- Interview Intelligence for research, preparation, adaptive learning, simulation and debrief;
- optional community sharing of anonymised interview experience;
- a common evidence/provenance model so web research and AI inference are not silently treated as facts.

## Decision

### Desktop and web are distinct product boundaries

The desktop app remains privacy-first and local-first. Its private workflows must continue to work
without an Applye account.

The web app may be account-backed and use server-side persistence for web workflows, public company
intelligence, community knowledge, learning and networking features.

Desktop data is not automatically synced to the web. Sync, if built, requires a separate ADR.

### Shared domain, separate infrastructure

Desktop and web share ubiquitous language, pure domain rules and application use cases where useful.
They do not share persistence assumptions.

```text
apps/desktop                 apps/web
    |                           |
    +-----------+---------------+
                |
         libs/application
                |
             libs/core
          /             \
 local/Tauri adapters   web/cloud adapters
```

This is a logical direction, not an instruction to create one library per bounded context.

### Logical bounded contexts

- **Career Intelligence**: Career Profile, Experience, Project, Skill Evidence, Achievement, Career
  Story, Education, Career Goal and Communication Profile.
- **Company Intelligence**: Company, Job Opportunity, business/technology evidence, reviews, people
  discovery, company preparation and relationship history.
- **Network Intelligence**: Contact, Relationship, Interaction, Outreach, Follow-up, Referral and
  channel adapters such as LinkedIn or email.
- **Interview Intelligence**: Interview, Interview Stage, Research, Preparation Plan, Learning,
  Practice, Mock Interview, Debrief, Interview Experience and personal Question Bank.
- **Community Intelligence**: explicit reviewed contributions, moderation, published interview
  reports, aggregate company interview patterns and public question intelligence.
- **Evidence & Provenance**: Source, Observation, Claim, Verification, Confidence and Freshness.

Existing Job Discovery, Application Tracking, Documents and AI Assistance continue to exist and
integrate with these areas.

### Company becomes first-class

A Company may have many Job Opportunities, Applications, Contacts, Interview Experiences and
community reports. Company history must not be owned by one Application.

### Discovered people are not automatically Contacts

A publicly discovered person remains a research result until the user intentionally adds them to
their network. Public data must show its source and may be marked stale or incorrect by the user.

### External intelligence is claim-based

Material external or AI-derived statements carry provenance where practical:

```text
Source -> Observation -> Claim -> Verification
                         |          |
                    Confidence   Freshness
```

Confidence and freshness are independent.

Recommended verification classes:
- verified;
- user_verified;
- supported;
- unverified.

Recommended freshness:
- fresh;
- aging;
- stale;
- unknown.

A correction such as "person changed company" or "broken link" becomes new evidence rather than
being silently discarded.

### AI is proposal-first

AI may extract and propose Career Evidence, interview questions, company facts, role mappings and
community payloads, but user-owned facts require review when inference is material.

Examples:
- transcript-extracted questions are Draft until confirmed;
- Career Evidence extracted from an interview/import is proposed until confirmed;
- community sharing always has a separate review and consent step.

### Interview preparation is adaptive and evidence-based

Preparation may combine:

```text
Career Evidence
+ Job Description
+ Company Intelligence
+ Interview Stage
+ public/community reports
+ previous practice/debrief
= Preparation Plan
```

Question provenance is explicit:
- user-confirmed real question;
- community-reported;
- externally reported;
- AI-generated.

### Truthful positioning is invariant

Applye helps the user present real experience strongly but never invents production experience.

Relevant evidence levels may include:
- production ownership;
- production experience;
- adjacent/collaborative exposure;
- personal-project experience;
- theoretical knowledge;
- missing knowledge.

Missing knowledge creates a learning gap, not a fabricated story.

### Communication personalisation does not change facts

Communication Profile and Delivery Coach may adapt vocabulary, answer length, natural phrasing,
pauses, emphasis and speaking notes. Content and delivery stay separate:

```text
Evidence -> Answer Strategy -> Personal Expression -> Delivery Guidance
```

Speech analysis is limited to observable delivery properties and must not infer protected traits,
personality, intelligence or fitness.

### LinkedIn is an integration channel

LinkedIn is not a bounded context. It sits under Network Intelligence. Applye may use official,
permitted APIs for user-approved profile/content/publishing workflows where available.

Do not make the product depend on scraping, automated connection requests, mass messaging or
automated engagement.

### No pseudo-precise hiring probability

Applye may explain strengths, transferable evidence, gaps, readiness and differentiators. It should
not invent a percentage probability of receiving an offer.

## Consequences

- Root product docs must stop describing "no cloud/account" as a whole-product invariant.
- Desktop keeps its local-first trust promise.
- Web can evolve into a full product with server persistence.
- Company and Contact relationships can be introduced without collapsing them into Application.
- Community features require consent, redaction, moderation and takedown paths.
- Implementation is phased; this ADR does not authorize a big-bang rewrite.

## Privacy / Security Impact

- Desktop private data remains local by default.
- Web private data is account-scoped and governed by web privacy/security controls.
- Community sharing is off by default and reviewable before publication.
- Never publish interviewer personal data, private notes, confidential take-home answers,
  proprietary code or NDA material.
- Web AI provider secrets must remain server-side.
- Sync requires a dedicated future ADR.

## Reversibility

These are logical boundaries and product rules. Physical library/schema splits happen only when
implementation needs them, so the direction is reversible without a repository-wide refactor.

## References

- `ROADMAP.md`
- `PRODUCT.md`
- `docs/domain-architecture.md`
- `docs/product/feature-briefs/career-company-network-interview-intelligence.md`
