# PRODUCT.md — Applye

Strategic design context for the Applye desktop app. Every impeccable command
reads this before doing design work.

## Register

**product** — design serves the task. Applye is an app UI (desktop tool), not a
marketing surface. The interface should disappear into the job-search workflow;
earned familiarity beats novelty.

## Platform

**web** — Tauri 2 desktop app rendering an Angular frontend in a webview. No
iOS/Android native targets (HIG/Material 3 do not apply). Responsive behavior is
about window resizing on desktop, not mobile breakpoints.

## Users

German / EU job seekers running a serious, often stressful job search. They
track many applications, paste job descriptions for AI-assisted HR/scam checks
and resume tailoring, and prepare for interviews. Privacy-conscious by
selection — they chose a local-first tool over a cloud platform. Mixed technical
literacy; the app must stay legible to a non-developer while rewarding fluency.

## Purpose

Help a job seeker run their whole search from one private, offline-first place:
capture and vet jobs, tailor a CV + cover letter per role, track the pipeline
through to offer, and prep for interviews. AI features are opt-in and
token-frugal; core workflows run offline. The user's resumes, notes, contacts
and history stay on their machine.

## Positioning

The privacy-first, local-first alternative to cloud job-search SaaS and ATS
portals. Open-source. Your data never leaves the device without explicit intent.
Calm and precise where competitors are noisy and engagement-hungry.

## Brand personality

**Calm, precise, tool-like.** A quiet professional instrument that gets out of
the way. Trust is earned through restraint, legibility, and visible privacy — not
through decoration or persuasion. Dark-first, mono-accented: the monospace
labels and single accent read as a considered instrument, not a startup landing.
Confidence through clarity, never through shouting.

## Anti-references

Deliberately NOT these:

- **Generic SaaS / cream slop** — warm-neutral cream backgrounds, gradient text
  or accents, hero-metric cards, endless identical icon+heading+text card grids,
  an eyebrow kicker above every section. The default AI/SaaS look.
- **Playful consumer app** — bright, bouncy, emoji-heavy, illustration-driven,
  gamified. Too casual for a serious job search under real stress.
- (Implied) engagement-maximizing cloud dashboards and dated enterprise-ATS
  grey-on-grey are also off-brand, though less likely traps than the two above.

## Strategic design principles

- **The tool disappears.** Consistent component vocabulary screen to screen;
  standard affordances, no reinvented controls. Delight lives in moments, not
  pages.
- **Restraint is the floor.** Tinted-neutral surfaces + one accent for primary
  actions, selection, and state — never decoration. Semantic color
  (danger/warning/success + tints) carries meaning, not mood.
- **Privacy is visible.** Local-first and token-frugal are product values;
  surface them (e.g. "cached · 0 tokens"), never hide the data boundary.
- **Legible under stress.** High-contrast body text, honest labels, real empty
  and loading states that teach the interface. Motion conveys state (150–250ms),
  never choreography; always with a reduced-motion fallback.
- **Every interactive element ships all its states** — default, hover, focus,
  active, disabled, loading, error.
