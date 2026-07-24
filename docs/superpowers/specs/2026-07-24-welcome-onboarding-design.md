# Welcome screen, button cleanup, footer spacing, design QA - Design

Date: 2026-07-24
Branch: `feat/onboarding-welcome` (from `main`)

## Goal

Polish the desktop app's first-run experience and overall design consistency:

1. Turn the plain first-launch screen into a warm, animated welcome moment.
2. Clean up button styling (remove duplicate/superfluous rules, unify on the design system).
3. Fix the "bottom padding disappears when scrolled to the very bottom" problem.
4. Run a full-project design QA pass and fix regressions.

Scope is the Tauri desktop app: `apps/desktop/` and shared primitives in `libs/ui/`.

## Context (what already exists - do NOT rebuild)

- `apps/desktop/src/app/app.ts` already gates three states: `<app-first-launch>` →
  `<app-onboarding>` → normal `<app-shell-layout>`.
- `core/first-launch.component.ts` - current first-launch screen (title/subtitle + health
  check). Shown when `!settings.healthCheckSeen`.
- `core/onboarding/` - full onboarding wizard. Gate `shouldAutoOpenOnboarding = !onboardingSeen`.
  Empty-profile nudge banner `onboarding-banner.component.ts`.
- Buttons: DS directive `libs/ui/src/lib/button/button.directive.ts` (`[appButton]`,
  variants primary/secondary/ghost/danger) with CSS in `libs/ui/src/styles/global.scss`.
  Topbar has bespoke `.btn-primary` / `.btn-theme` in `shell-layout.component.scss` (duplicates).
- Tokens: `libs/ui/tokens.css` (color/typography/spacing/radius/motion). Motion tokens:
  `--dur-fast`, `--ease-standard`.
- Scroll container `.content` (`shell-layout.component.scss`) has uniform `padding: var(--space-8)`
  but no `scroll-padding-bottom` / bottom safety.

## 1. Welcome screen (enhance `first-launch.component`)

**Trigger:** unchanged - shown once on the true first launch (`!settings.healthCheckSeen`). The
animated welcome is a one-time celebratory moment; onboarding stays a separate, skippable step; the
empty-profile banner keeps nudging afterward. This reuses existing infra and never blocks the user.

**Layout (centered, single column):**

- Animated Applye logo reveal (scale + fade in).
- Greeting: "Вас приветствует Applye" + one-line subtitle about what the app does (privacy-first
  job search).
- Two actions:
  - Primary: **"Пройти онбординг"** → marks health-check seen and opens onboarding.
  - Ghost/secondary: **"Пропустить, заполню сам"** → marks health-check seen, goes to normal shell.
- Small helper line under buttons: "Рекомендуем пройти онбординг - займёт пару минут."
- Existing health-check logic is preserved (kept, possibly folded below or into onboarding), so no
  functional regression to the health gate.

**Animation:** sequential reveal (logo → text → buttons) using CSS transitions/keyframes driven by
`--dur-*` / `--ease-standard`. Must fully respect `prefers-reduced-motion: reduce` (instant, no
motion). No external animation libraries - CSS only.

**i18n:** copy goes through the existing translation mechanism if the app has one; otherwise inline
strings matching current first-launch component conventions.

## 2. Button cleanup

- Migrate topbar "Paste Job" and theme toggle to the DS button system (`[appButton]`), adding an
  `icon` size/variant if needed for the square icon button, instead of bespoke `.btn-primary` /
  `.btn-theme`.
- Remove the now-dead `.btn-primary` / `.btn-theme` rules from `shell-layout.component.scss`.
- Audit `.btn*` in `global.scss` for redundant/overlapping declarations; align padding, radius
  (`--radius-card`), font weight, hover/active/focus-ring to tokens. One consistent button language.
- No behavior change - same click handlers, same accessible labels.

## 3. Footer / bottom spacing fix

- Add reliable bottom breathing room to the main scroll area: `scroll-padding-block-end` and a
  guaranteed `padding-bottom` on `.content` (via token, e.g. `--space-8`/`--space-10`), so the last
  element never sticks to the viewport edge at max scroll.
- Check pages whose last block is full-bleed or has collapsing margins (Profile "AI TOOLS" section,
  Discover, Settings) and normalize.
- If a page relies on its own container, ensure it inherits the same bottom spacing rule rather than
  overriding it to 0.

## 4. Full design QA pass

- Sweep every route (Dashboard, Discover, Profile, Jobs, Pipeline, Interview Prep, Tracker,
  Documents, Analytics, Settings) for: hard-coded values that should be tokens, inconsistent
  spacing/radius/font sizes, broken light/dark theme, misaligned or overflowing elements.
- Fix regressions found. Verify in `tauri dev` via the browser/preview tooling where observable.
- Use the impeccable design skill for judgement and a read-only code-review agent to catch misses.

## Non-goals

- No new onboarding steps or wizard redesign (only the entry welcome screen).
- No route/navigation restructure.
- No backend/DB changes beyond reading existing settings flags.
- No new dependencies.

## Verification

- `tauri dev` launches; first-launch welcome animates and both buttons route correctly;
  `prefers-reduced-motion` disables motion.
- Buttons look identical-or-better and behave the same; no dead CSS left.
- Scroll every long page to the bottom - consistent gap under the last element.
- Light and dark themes both pass the QA sweep.
- Frontend gate (lint + tests + build) is green.
