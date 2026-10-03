# PRODUCT.md - Applye

Strategic design context for Applye. The product is desktop-first historically, but now has two
planned surfaces: a local-first desktop application and an evolving web platform. Every impeccable
command reads this before doing design work.

## Register

**product** - design serves the task. Applye is an app UI (desktop tool), not a
marketing surface. The interface should disappear into the job-search workflow;
earned familiarity beats novelty.

## Platform

**desktop** - Tauri 2 rendering an Angular frontend in a webview. Desktop remains local-first.

**web** - `apps/web` evolves from marketing/docs into a full web product for account-backed
workflows, public/company intelligence, learning and optional community knowledge. Web UX may have
responsive/browser concerns that do not apply to the Tauri shell.

## Users

German / EU job seekers running a serious, often stressful job search. They
track many applications, paste job descriptions for AI-assisted HR/scam checks
and resume tailoring, and prepare for interviews. Privacy-conscious by
selection - they chose a local-first tool over a cloud platform. Mixed technical
literacy; the app must stay legible to a non-developer while rewarding fluency.

## Purpose

Help a job seeker understand and present their real career evidence, research companies and
opportunities, build professional relationships, track applications, prepare for interviews, learn
from real interview outcomes, and improve the next attempt.

Desktop keeps private/local workflows offline-first. Web may store account-backed data server-side
for web-only workflows and public/community intelligence. Any private-to-community sharing is
explicit and reviewable.

## Positioning

A Career Intelligence OS that combines private local desktop workflows with an optional web and
community layer. The differentiator is not autonomous applying; it is evidence-based career
understanding, company/network intelligence, interview preparation and learning from real outcomes.
Desktop data never leaves the device without explicit intent.

## Brand personality

**Calm, precise, tool-like.** A quiet professional instrument that gets out of
the way. Trust is earned through restraint, legibility, and visible privacy - not
through decoration or persuasion. Dark-first, mono-accented: the monospace
labels and single accent read as a considered instrument, not a startup landing.
Confidence through clarity, never through shouting.

## Anti-references

Deliberately NOT these:

- **Generic SaaS / cream slop** - warm-neutral cream backgrounds, gradient text
  or accents, hero-metric cards, endless identical icon+heading+text card grids,
  an eyebrow kicker above every section. The default AI/SaaS look.
- **Playful consumer app** - bright, bouncy, emoji-heavy, illustration-driven,
  gamified. Too casual for a serious job search under real stress.
- (Implied) engagement-maximizing cloud dashboards and dated enterprise-ATS
  grey-on-grey are also off-brand, though less likely traps than the two above.

## Strategic design principles

- **The tool disappears.** Consistent component vocabulary screen to screen;
  standard affordances, no reinvented controls. Delight lives in moments, not
  pages.
- **Restraint is the floor.** Tinted-neutral surfaces + one accent for primary
  actions, selection, and state - never decoration. Semantic color
  (danger/warning/success + tints) carries meaning, not mood.
- **Privacy is visible.** Local-first and token-frugal are product values;
  surface them (e.g. "cached · 0 tokens"), never hide the data boundary.
- **Legible under stress.** High-contrast body text, honest labels, real empty
  and loading states that teach the interface. Motion conveys state (150-250ms),
  never choreography; always with a reduced-motion fallback.
- **Every interactive element ships all its states** - default, hover, focus,
  active, disabled, loading, error.
