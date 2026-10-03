# Career, Company, Network and Interview Intelligence

## Status

**Planned product direction.** This is a target-state brief for phased desktop + web development, not
a request to implement every capability in one release.

## Product thesis

Applye evolves from an application tracker with AI assistance into a **Career Intelligence OS**:

```text
Understand Me
    -> Understand Companies
    -> Build Network
    -> Find Opportunity
    -> Apply
    -> Research & Prepare
    -> Practice & Simulate
    -> Real Interview
    -> Debrief
    -> Learn
    -> Optional Community Contribution
    -> Better Next Attempt
```

## 1. Career Intelligence

Career Profile becomes the reusable source of truth, not a single CV.

Inputs may include CVs, career-history files, projects and an AI-led Career Discovery interview.
AI extracts proposed evidence and asks follow-up questions about ownership, decisions, trade-offs,
collaboration, measurable outcomes and lessons.

Proposed concepts:
- Career Evidence;
- Experience;
- Project;
- Achievement;
- Skill Evidence;
- Career Story;
- Education;
- Career Goal;
- Communication Profile.

AI-derived facts remain proposals until the user confirms/edits/rejects them.

Career Intelligence can explain adjacent-role opportunities using evidence and gaps, for example
Senior Product Engineer, without pretending role fit is mathematically certain.

## 2. Company Intelligence Hub

Company is first-class and can relate to multiple jobs, applications, contacts and interviews.

Suggested tabs:
- Overview;
- Jobs;
- Technology;
- People;
- Network;
- Reviews;
- Interviews;
- My Fit;
- Prepare;
- Activity.

Research may collect legally/publicly available:
- business description, products, markets and locations;
- official revenue/funding facts or labelled third-party estimates;
- recent company signals/news;
- open/historical jobs;
- engineering articles and technology evidence;
- publicly discoverable recruiting/engineering people;
- employee/candidate reviews;
- reported interview processes and questions.

Each material claim should expose source/date/confidence/freshness.

"Prepare for this company" can exist before an interview and generate business, technology,
positioning and knowledge-gap preparation.

## 3. Network Intelligence

Provider-neutral job-search CRM.

Core concepts:
- Person/discovered person;
- Contact;
- Relationship;
- Interaction;
- Outreach;
- Follow-up;
- Referral;
- Channel.

Channels include LinkedIn, email, phone, interview, meeting, event and referral.

The system tracks:
- who was contacted;
- where and when;
- what was promised;
- follow-up date;
- referral path;
- relationship to a company/opportunity;
- complete interaction timeline.

Publicly discovered people must be manually verifiable. A user can mark a result correct or incorrect
with reasons such as changed company, changed role, broken link, wrong person, duplicate or outdated.

## 4. LinkedIn and Professional Brand

LinkedIn is a Network channel, subject to current official API permissions and policy.

Potential capabilities:
- profile review for headline, About, experience, skills, Featured and Open-to-Work positioning;
- professional-brand plan based on Career Evidence and target roles;
- technical/product post ideas grounded in real experience;
- post/article/comment drafts for user review;
- content calendar;
- explicit user-approved publishing through official APIs where permitted.

Do not build scraping, mass messaging, connection automation or engagement spam.

## 5. Evidence & Freshness

Use a common evidence model:

```text
Source -> Observation -> Claim -> Verification
                         |          |
                    Confidence   Freshness
```

Verification:
- verified;
- user_verified;
- supported;
- unverified.

Freshness:
- fresh;
- aging;
- stale;
- unknown.

This applies to company facts, people, tech stacks, revenue estimates, reviews, interview processes
and reported questions.

## 6. Interview Intelligence

### Research

Inputs:
- saved Job Description;
- Career Evidence;
- Company Intelligence;
- interview stage;
- previous stages;
- public sources;
- Applye community reports.

User-defined/custom stages remain supported.

### Preparation Plan

Generate a structured curriculum rather than one long chat.

Adapt to available time:
- crash course;
- multi-day plan;
- full preparation.

Possible modules:
- technical topics;
- frontend/backend/cloud stack;
- architecture;
- testing;
- behavioral;
- ownership/product;
- company/business;
- role-specific gaps.

### Practice

- question bank by provenance;
- quizzes;
- technical Q&A;
- system-design prompts;
- later coding exercises;
- answer feedback;
- mastery tracking;
- adaptive next plan.

### Truthful Positioning

Prepare strong but honest answers from evidence.

Evidence levels:
- production ownership;
- production experience;
- adjacent/collaborative exposure;
- personal-project experience;
- theoretical knowledge;
- missing knowledge.

If a gap matters, create a learning plan rather than inventing experience.

### Mock Interview

Modes:
- Coach: hints/corrections allowed;
- Real Interview: no hints until completion.

Styles:
- supportive;
- neutral;
- challenging.

Follow-up questions respond to the user's previous answer rather than following a static list.

### Communication Intelligence / Delivery Coach

Separate answer content from delivery.

Capabilities:
- "Make it sound like me";
- full answer vs speaking notes;
- natural-professional vocabulary matching actual language level;
- optional delivery guidance for emphasis, short/long pauses, pace and intonation;
- per-language Communication Profile;
- voice-practice feedback on observable features such as pace, filler repetition, answer length and
  whether the main point appears too late.

Do not optimise for robotic perfection.

## 7. Real Interview Debrief

After each real stage the user can:
- paste/write notes;
- upload transcript/TXT/PDF/DOCX;
- narrate what happened;
- add questions manually.

AI creates a **Draft Interview Report**:
- detected interviewer questions;
- candidate answers;
- follow-ups;
- topics;
- uncertain extraction.

Before durable save, the user can confirm/edit/remove/add questions.

Confirmed real questions preserve where possible:
- original wording;
- normalized wording;
- topic/skill;
- company;
- role;
- stage;
- date;
- provenance.

Answer review distinguishes:
- technical correctness for factual questions;
- evidence/trade-offs/clarity for open-ended architecture/behavioral questions;
- content feedback from delivery feedback.

Debrief updates the next Preparation Plan.

## 8. Personal Question Bank

Real confirmed interview questions become reusable personal knowledge.

Filters may include:
- company;
- role;
- stage;
- topic;
- technology;
- date;
- struggled-with;
- mastered.

Question variants can normalize to the same tested concept while retaining original wording.

## 9. Community Intelligence

Private by default.

Sharing flow:

```text
Private Interview Experience
    -> Review what will be shared
    -> PII/confidentiality checks
    -> Moderation
    -> Published Community Contribution
```

Shareable examples:
- company;
- role/seniority/region where safe;
- stage;
- approximate date;
- confirmed questions;
- non-identifying process notes.

Do not publish by default:
- candidate answers;
- interviewer identity/email;
- private notes;
- confidential take-home solutions;
- proprietary code;
- NDA material.

Public insights must be evidence-aware, e.g. "reported by 6 candidates during 2025-2026", not
"Company X always asks Y".

## 10. Desktop and Web

### Desktop

Keep:
- local SQLite;
- private Career Profile;
- jobs/applications/pipeline;
- Company Hub;
- Network CRM;
- Interview Intelligence;
- personal question bank;
- BYOK/CLI AI;
- private notes/analytics.

### Web

Evolve into a full application:
- authenticated accounts;
- server-side user database;
- Career/Profile workflows;
- Companies;
- Network;
- Applications;
- Preparation/Practice;
- public company/interview intelligence;
- community contributions;
- public guides/learning/company pages.

Desktop↔web sync is explicitly deferred to a separate architecture decision.

## 11. Phased roadmap

1. Career Intelligence Profile + user-confirmed Career Evidence.
2. Company Hub + evidence/freshness model.
3. Network CRM + interactions/referrals/follow-ups.
4. Interview Research + structured Preparation Plan.
5. Learn/Practice/Quiz.
6. Mock Interview + Communication/Delivery Coach.
7. Real Interview Debrief + transcript extraction + Personal Question Bank.
8. Community Contribution + moderation/redaction.
9. Public Company/Interview Intelligence on web.
10. Authenticated web workflows; evaluate sync separately.

## Non-goals for the first implementation waves

- no big-bang schema rewrite;
- no Neo4j requirement: graph relationships can live in relational storage until justified;
- no fake hiring-probability score;
- no fabricated candidate experience;
- no automatic public sharing;
- no LinkedIn scraping or engagement bot;
- no desktop data upload merely because a web account exists.
