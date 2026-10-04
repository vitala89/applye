# Applye Web Product Strategy

- **Status**: Proposal / candidate product plan
- **Scope**: Applye web product only
- **Decision level**: Strategic direction, not a committed delivery roadmap
- **Last reviewed**: 2026-10-04

---

## 1. Purpose

This document describes one possible product direction for the Applye web experience.

It is intentionally separate from the desktop product contract. Applye Desktop remains the
privacy-first, local-first product that can be useful without an Applye account or Applye-hosted
infrastructure. The web product may evolve into an account-backed Career Intelligence platform with
server-side capabilities, shared/public knowledge, optional community features, and paid hosted
services.

This plan is not a commitment to ship every capability listed here. Individual areas must still pass
product validation, privacy/security review, architecture review, cost analysis, and prioritization
before implementation.

The goal is to define a coherent north star so future features reinforce one product instead of
becoming unrelated career utilities.

---

## 2. Product thesis

Applye should not become a collection of isolated AI tools.

The stronger product is a **Career Intelligence OS** that helps a person understand their real career
evidence, discover suitable opportunities, plan a search, build professional relationships, prepare
for interviews, learn from outcomes, and make the next decision with better context.

The core loop is:

```text
Career evidence
      ↓
Target roles and companies
      ↓
Opportunity discovery and fit
      ↓
Positioning and application
      ↓
Network and referrals
      ↓
Interview preparation
      ↓
Interview outcome
      ↓
Learning and updated strategy
      └──────────────→ repeat
```

Applye strengthens the user at every stage. It does not replace the user, auto-submit applications,
invent experience, or turn career decisions over to an opaque scoring system.

---

## 3. Product surfaces

Applye has two complementary surfaces with different trust and business models.

### 3.1 Desktop: free, local-first core

Desktop remains the private personal workspace.

Expected characteristics:

- local SQLite source of truth;
- useful without an Applye account;
- BYOK and supported CLI-bridge AI modes;
- user-controlled AI calls;
- no mandatory cloud sync;
- private profile and career evidence;
- CV and document workflows;
- local application pipeline;
- private company/contact/interview notes;
- local interview preparation;
- local analytics where practical;
- MIT-licensed core.

The desktop product is not a crippled trial for the web product. It should remain genuinely useful on
its own.

### 3.2 Web: account-backed intelligence and hosted services

The web product can use authenticated accounts and server-side persistence for capabilities whose
value depends on cloud infrastructure, shared knowledge, cross-device access, managed integrations,
or ongoing computation.

Potential web value includes:

- account-backed career workspace;
- cross-device access;
- public and private Company Intelligence;
- job and opportunity discovery;
- aggregated fit and skill-pattern analysis;
- Career Path planning;
- Network / relationship CRM;
- Interview Intelligence;
- learning and practice;
- community knowledge;
- referrals and trusted introductions;
- managed AI;
- alerts and monitoring;
- hosted integrations;
- optional desktop↔web synchronization.

Desktop-local data must never silently become web data. Any sync or sharing boundary is explicit and
requires its own architecture/privacy decision.

The accepted web-backend platform decision is documented in
`docs/product/decisions/ADR-0007-web-backend-platform.md`: Cloudflare Workers + TypeScript + Hono,
with D1 as the initial relational store and R2 for object storage. This is infrastructure, not a
reason to couple domain rules to Cloudflare.

---

## 4. Target user

Primary users are serious job seekers who need more than a job board or a one-off CV checker.

Typical characteristics:

- searching across many roles or companies;
- maintaining multiple CV variants;
- preparing for several interview processes at once;
- trying to understand recurring skill gaps;
- building recruiter, employee, and referral relationships;
- comparing companies, compensation, location, language, visa, remote/hybrid, and role constraints;
- learning from rejections and interview outcomes;
- willing to use AI as an advisor but not as an autonomous decision maker.

Initial product assumptions can remain strongest for Germany and the wider EU while keeping domain
models extensible to other markets.

---

## 5. Core product pillars

### 5.1 Career Profile and Evidence

The product should model what the user can actually prove, not only what appears in one CV.

Potential data:

- roles and employment history;
- projects;
- responsibilities;
- achievements;
- skills and technologies;
- leadership examples;
- product/business context;
- domain expertise;
- education and certifications;
- interview stories;
- evidence sources and confidence.

This becomes the source for matching, CV tailoring, interview preparation, positioning, and career
planning.

A key rule is **evidence before keywords**. Applye should never recommend adding a skill to a CV merely
because it appears in a job description when the user has no defensible experience with it.

### 5.2 Opportunity Intelligence

An Opportunity is more than a saved URL.

Potential capabilities:

- job capture/import;
- structured requirements;
- company and role context;
- recruiter/ATS fit;
- career-evidence fit;
- explicit gaps;
- constraints and risks;
- user-defined priorities;
- expected application effort;
- opportunity status and history;
- related contacts and referrals.

The output should be explainable. A useful assessment says why an opportunity is strong, weak, risky,
or worth a referral rather than returning an unexplained percentage.

### 5.3 Company Intelligence

A company page can become a durable research object rather than a temporary note.

Potential information:

- company summary and business model;
- target-role relevance;
- technology signals;
- hiring patterns;
- offices and remote policy;
- language expectations;
- compensation data where legally and reliably available;
- interview process;
- user contacts;
- related opportunities;
- user notes;
- community reports;
- public sources with provenance and freshness.

Public facts, community-supplied information, and private user notes must remain distinguishable.

### 5.4 Career Path

Career Path should be an adaptive plan, not a static article or generic checklist.

Example flow:

```text
Career goal
   ↓
Positioning
   ↓
Career evidence
   ↓
Target roles
   ↓
Target companies
   ↓
Skill-gap analysis
   ↓
CV / profile readiness
   ↓
Network and referrals
   ↓
Applications
   ↓
Interview preparation
   ↓
Outcome and learning
```

The plan can change when the user adds opportunities, receives interview feedback, learns a skill,
changes location constraints, or changes the target role.

The user owns the goal. Applye advises on the route.

### 5.5 Skill Pattern Analysis

A single job description often creates noisy advice. The web product can become more useful by
looking across a target market or the user's saved opportunities.

Example:

```text
Target: Senior Product Engineer
Sample: 47 relevant opportunities

TypeScript        87%
React             76%
DDD               62%
Backend APIs      58%
Observability     39%
Python            27%
```

The product can then compare market patterns with the user's evidence:

- strong and well-proven;
- present but weakly evidenced;
- missing and high-value;
- optional;
- irrelevant to the current goal.

This can feed a learning plan without turning the product into a generic course marketplace.

### 5.6 CV, Positioning and ATS Analysis

Web CV tooling should go beyond keyword matching.

Possible analysis dimensions:

- evidence coverage;
- role relevance;
- ATS parseability;
- requirement coverage;
- recruiter readability;
- unsupported claims;
- missing high-value evidence;
- seniority positioning;
- CV version fit;
- likely interview risk areas.

The product must distinguish between:

1. a missing keyword that the user genuinely knows and can evidence;
2. a missing capability worth learning;
3. a requirement that is optional or low-value;
4. a skill the user should **not** claim.

### 5.7 Network and Referral CRM

Job search is partly relationship management.

Potential model:

```text
Person
 ├─ company
 ├─ role
 ├─ relationship
 ├─ source
 ├─ interactions
 ├─ related opportunities
 ├─ referral potential
 ├─ follow-up date
 └─ private notes
```

Applye may prepare outreach drafts, remind the user about a relevant contact, or suggest whom to
contact. The user remains responsible for reviewing and sending messages.

No unsolicited autonomous messaging.

### 5.8 Interview Intelligence

Interview preparation should connect company, role, opportunity, user evidence, and previous outcomes.

Private layer:

- interview stages;
- questions received;
- topics tested;
- answers/notes;
- feedback;
- result;
- lessons learned;
- follow-up actions.

Shared/public layer, if later validated:

- anonymized interview reports;
- commonly reported stages;
- topic frequency;
- role/company patterns;
- candidate-supplied questions;
- freshness and confidence indicators.

Community information must be presented as user-contributed evidence, not guaranteed company policy.

### 5.9 Learning and Practice

Learning is useful when connected to an actual career gap.

Potential capabilities:

- gap-driven learning plans;
- interview flashcards;
- targeted technical refreshers;
- mock interview scenarios;
- question practice;
- progress tracking;
- links between learning evidence and target opportunities.

The product should avoid creating artificial engagement loops. Learning exists to improve a real
career outcome.

### 5.10 Community Knowledge

Community should be structured around useful career entities rather than becoming only a chat feed.

Potential structure:

```text
Company
 ├─ interview reports
 ├─ hiring process
 ├─ role insights
 ├─ compensation reports
 └─ discussions

Role / discipline
 ├─ common requirements
 ├─ interview patterns
 ├─ career paths
 └─ learning resources
```

Possible community capabilities:

- interview experiences;
- referrals;
- hiring signals;
- role/market discussions;
- local/country knowledge;
- moderated question and answer;
- trusted contributors.

A separate chat/community service may complement this later, but durable knowledge should live in
structured product entities where possible.

---

## 6. Free and paid product boundary

The preferred monetization principle is:

> **Do not paywall ownership of local career data. Charge for hosted infrastructure, managed services,
> network value, and expensive recurring computation.**

This preserves the open/local desktop proposition while allowing Applye to become a sustainable
hosted product.

### 6.1 Candidate product matrix

This is a planning hypothesis, not final packaging.

| Capability | Desktop Core | Web Free | Hosted / Pro candidate |
| --- | --- | --- | --- |
| Local career profile | Yes | — | — |
| Local application pipeline | Yes | — | — |
| BYOK / CLI AI | Yes | — | — |
| CV editing / tailoring | Yes | Basic/limited | Advanced hosted analysis |
| ATS / recruiter check | Yes | Limited | Advanced / batch / history |
| Account-backed workspace | — | Yes | Extended limits |
| Career Path | Local/basic | Basic | Adaptive advanced plan |
| Opportunity tracking | Yes | Yes | Advanced intelligence |
| Job discovery | Limited/manual | Basic | Personalized discovery / alerts |
| Skill pattern analysis | Local data | Limited | Large-set / market intelligence |
| Company Intelligence | Private notes | Preview/basic | Advanced hosted intelligence |
| Network CRM | Local | Basic | Advanced reminders / intelligence |
| Interview Intelligence | Private/local | Preview/basic | Cross-history/community intelligence |
| Community knowledge | — | Read/basic | Advanced participation/features |
| Cross-device sync | — | — | Candidate paid service |
| Managed AI | — | Limited trial if viable | Paid service |
| Premium models / quota | — | — | Paid service |
| Hosted integrations | — | Limited | Paid service |
| Alerts / monitoring | — | Limited | Paid service |

No local-only capability should be artificially locked behind a client-side Pro boolean. This follows
the server-anchored entitlement direction in ADR-0002.

---

## 7. Monetization principles

Exact prices and packaging are intentionally out of scope until value and operating costs are tested.

Possible revenue layers:

### Web Free

Purpose:

- onboarding;
- product discovery;
- account creation;
- lightweight career planning;
- previews of intelligence;
- contribution to network effects;
- conversion to hosted capabilities.

### Applye Pro / Hosted

Potential reasons to pay:

- managed AI without API-key setup;
- higher AI quota or premium models;
- advanced opportunity matching;
- cross-opportunity skill analysis;
- richer company/interview intelligence;
- cross-device data;
- advanced alerts;
- hosted integrations;
- server-side reports/history;
- higher usage limits.

### Community / Network layer

Some community capabilities may be included in free or Pro plans. The important distinction is not
"community must be paid"; it is that moderation, trust, structured knowledge, and network value have
ongoing operating cost and can contribute to the paid value proposition.

### Optional services

Future human services, partner services, or specialist coaching can exist beside the software, but
they are not required for the core product strategy and should not distort product priorities.

---

## 8. Domain model direction

Web development should reuse Applye's ubiquitous language rather than introducing SaaS-specific
generic names.

Candidate high-level domains / bounded contexts:

- **Career Profile**: person, evidence, skill, achievement, preference, target;
- **Opportunities**: opportunity, requirement, fit assessment, application intent;
- **Applications**: application, stage, event, outcome;
- **Companies**: company, research fact, source, target company;
- **Network**: person/contact, relationship, interaction, referral;
- **Interviews**: interview process, stage, question, preparation, feedback, outcome;
- **Career Planning**: career goal, gap, action, milestone, learning plan;
- **Community Intelligence**: contribution, report, moderation state, confidence, provenance;
- **Entitlements**: account, plan, capability, quota;
- **Identity**: account/session/consent, kept outside core career rules where practical.

Do not force every domain into textbook DDD ceremony. Aggregates, repositories, domain events, or
value objects should exist only where they protect meaningful business rules or boundaries.

Shared domain rules may live in Nx libraries when both desktop and web genuinely use the same
language and behavior. Storage, authentication, network access, billing, and hosted integrations
remain infrastructure-specific adapters.

---

## 9. Data and privacy boundaries

The web product changes the privacy model and must be explicit about that.

### Desktop data

Default:

- stays on the user's machine;
- is not automatically uploaded;
- does not require a web account.

### Web data

May include:

- account profile;
- explicitly created/imported web career data;
- saved web opportunities;
- hosted analysis history;
- community contributions;
- subscription/entitlement data.

Requirements before shipping sensitive web workflows:

- clear data ownership;
- retention policy;
- deletion/export path;
- GDPR basis and privacy disclosure;
- encryption in transit and at rest where applicable;
- secret management;
- auditability for sensitive administrative actions;
- explicit separation of private and community-visible data.

### Desktop ↔ web sync

Sync is **not implied** by this strategy.

It needs a dedicated ADR covering:

- identity;
- which side is authoritative;
- opt-in behavior;
- conflict resolution;
- encryption;
- deletion semantics;
- offline behavior;
- account loss/recovery;
- migration and export;
- privacy disclosure.

---

## 10. Product integrity rules

Any web capability should satisfy these rules.

1. **Augmentation, not automation.**
   The product can prepare, analyze, recommend, and remind. It does not auto-apply or impersonate the
   user.

2. **Evidence over inflation.**
   Never invent experience or encourage unsupported claims.

3. **Explain important judgments.**
   Fit, gap, risk, and recommendation outputs should expose useful reasons.

4. **Private by default.**
   Sharing private career data to community/public contexts requires explicit action and preview.

5. **Source-aware intelligence.**
   Distinguish public facts, inferred data, user notes, and community reports.

6. **Freshness matters.**
   Company, market, salary, hiring, and interview-process information should carry freshness/provenance
   where practical.

7. **No dark-pattern upgrade pressure.**
   The free desktop product remains useful. Web upsell should communicate added hosted value rather
   than deliberately degrade existing local workflows.

8. **Human-controlled communication.**
   Drafting and reminders are acceptable. Autonomous outreach is not.

---

## 11. Candidate rollout sequence

This is a dependency-oriented sequence, not committed dates.

### Phase A: Web foundation

- identity/account model;
- privacy and deletion model;
- server-side persistence;
- entitlement foundation;
- clear desktop/web data boundary;
- web domain/application architecture.

### Phase B: Personal web workspace

- Career Profile;
- Opportunities;
- Companies;
- Applications;
- basic Network CRM;
- basic Career Path.

Goal: prove that the account-backed web workspace is useful before building broad community or
market-data systems.

### Phase C: Intelligence

- explainable opportunity matching;
- cross-opportunity requirement patterns;
- skill-gap analysis;
- advanced CV/ATS analysis;
- Company Intelligence;
- interview preparation tied to opportunity/company context.

### Phase D: Hosted services

- managed AI;
- quotas and plan enforcement;
- advanced server-backed reports;
- alerts/monitoring;
- selected integrations;
- optional cross-device capabilities.

### Phase E: Interview and community intelligence

Only after the private product has enough value and the moderation/privacy model is ready:

- structured interview reports;
- shared company/role knowledge;
- contribution/reputation model;
- moderation;
- community discovery;
- referrals where trust and abuse controls are adequate.

### Phase F: Optional desktop ↔ web sync

Build only after a separate sync ADR and only if user demand justifies the security and complexity
cost.

---

## 12. What not to build yet

This strategy deliberately does not commit Applye to:

- automatic job applications;
- autonomous recruiter outreach;
- scraping closed/private job boards;
- a generic social network;
- a full LMS/course marketplace;
- a large chat community before useful structured knowledge exists;
- client-side paywalls for offline MIT features;
- forced desktop cloud accounts;
- automatic desktop data upload;
- opaque "AI score" systems without reasons;
- final subscription prices before cost/value validation.

---

## 13. Success signals

Before expanding each layer, validate behavior rather than vanity metrics.

Candidate signals:

### Personal workspace

- users return to manage multiple opportunities;
- saved opportunities gain structured context rather than becoming dead bookmarks;
- users maintain Career Profile evidence over time;
- users use company/contact/interview links across workflows.

### Intelligence

- recommendations change real user decisions;
- users can explain why a role is or is not a fit;
- users identify recurring gaps across multiple target jobs;
- generated CV/interview guidance requires less manual correction over time.

### Network

- contacts are associated with real opportunities/companies;
- reminders lead to useful human follow-ups;
- referral workflows remain intentional and non-spammy.

### Community

- contributions remain structured and reusable;
- company/interview information is refreshed;
- moderation load stays manageable;
- users trust provenance and distinguish reports from facts.

### Monetization

- paid conversion correlates with hosted value;
- managed AI/infrastructure has sustainable unit economics;
- paid services do not reduce trust in the free desktop core.

---

## 14. Decision gates

A capability moves from this strategy into the actual roadmap only after answering:

1. What user problem does it solve?
2. Is web/cloud materially necessary for the value?
3. Which bounded context owns the capability?
4. Which data becomes server-side?
5. Is any information public/community-visible?
6. What are the GDPR, security, moderation, and abuse implications?
7. Does it preserve the desktop local-first contract?
8. Is it free, paid, or usage-limited, and why?
9. What is the ongoing infrastructure/AI cost?
10. What measurable behavior would prove the feature is useful?
11. Does it strengthen the user's capability rather than replace their agency?

---

## 15. Relationship to canonical roadmap

This document is a **candidate web product strategy**.

- `ROADMAP.md` remains the canonical source for committed strategic direction and sequencing.
- `ADR-0007-web-backend-platform.md` is authoritative for the planned web runtime/backend choice.
- `PRODUCT.md` remains the shared high-level product/design context.
- Accepted individual web capabilities should receive feature briefs before implementation.
- Architectural choices with durable consequences require ADRs.
- The feature index/current state should only be updated when work is actually accepted into the
  execution pipeline.

The purpose of this document is to keep future web decisions coherent without prematurely treating
every idea as committed scope.
