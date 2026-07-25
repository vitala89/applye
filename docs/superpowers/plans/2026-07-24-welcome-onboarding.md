# Welcome screen, button cleanup, footer spacing, design QA - Implementation Plan

> For agentic workers: implement task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add an animated first-launch welcome, unify topbar buttons onto the design
system, guarantee bottom scroll spacing, and QA-sweep the whole app.

**Architecture:** Enhance the existing `first-launch.component` (reuse `app.ts` gate).
Extend the `[appButton]` directive with an `icon` size and migrate topbar buttons to it.
Add bottom spacing to the `.content` scroll container. Verify in `tauri dev`.

**Tech Stack:** Angular standalone components, SCSS, design tokens (`libs/ui/tokens.css`),
i18n (`@applye/i18n` `translations.ts`), Tauri desktop.

## Global Constraints

- No em/en dashes anywhere (code, comments, copy). Plain hyphen only.
- No new dependencies. CSS-only animation.
- Token-driven styling; no hardcoded colors/sizes without a token fallback matching siblings.
- Respect `prefers-reduced-motion: reduce`.
- Commit messages: Conventional Commits, no attribution trailers.

---

### Task 1: Extend button directive with `icon` size + `.btn--icon` CSS

**Files:**

- Modify: `libs/ui/src/lib/button/button.directive.ts`
- Modify: `libs/ui/src/styles/global.scss` (after `.btn--md`)

Steps:

- [ ] Add `'icon'` to `ButtonSize` type.
- [ ] Add `.btn--icon { padding: var(--space-3); line-height: 1; }` square icon button.
- [ ] Build lib passes.

### Task 2: Migrate topbar buttons to `[appButton]`, delete dead classes

**Files:**

- Modify: `apps/desktop/src/app/layout/shell-layout.component.ts` (import `ButtonDirective` from `@applye/ui`)
- Modify: `apps/desktop/src/app/layout/shell-layout.component.html` (lines 130-145)
- Modify: `apps/desktop/src/app/layout/shell-layout.component.scss` (delete `.btn-primary`, `.btn-theme` blocks lines 224-260)

Steps:

- [ ] Theme toggle `<button class="btn-theme">` -> `<button appButton variant="secondary" size="icon">` (keep click + aria-label).
- [ ] Paste Job `<button class="btn-primary">` -> `<button appButton variant="primary" size="md">` (keep click).
- [ ] Import `ButtonDirective` into shell component imports array.
- [ ] Remove `.btn-primary` and `.btn-theme` SCSS blocks.
- [ ] App builds; topbar buttons look and behave the same.

### Task 3: Footer / bottom scroll spacing

**Files:**

- Modify: `apps/desktop/src/app/layout/shell-layout.component.scss` (`.content` ~line 263)

Steps:

- [ ] `.content` bottom padding -> `var(--space-10)` and add `scroll-padding-block-end: var(--space-10)`.
- [ ] Verify in `tauri dev`: scroll Profile (AI TOOLS), Discover, Settings to bottom; consistent gap.

### Task 4: Welcome screen redesign (`first-launch.component`)

**Files:**

- Modify: `apps/desktop/src/app/core/first-launch.component.ts`
- Modify: `apps/desktop/src/app/app.ts` (handle dismissed intent)
- Modify: `libs/i18n/src/lib/translations/translations.ts` (health block, en + de)

Behavior:

- `dismissed` output carries `{ startOnboarding: boolean }`.
- Primary "Пройти онбординг" -> `finish(true)`: set `healthCheckSeen`, emit `{startOnboarding:true}`.
- Ghost "Пропустить, заполню сам" -> `finish(false)`: set `healthCheckSeen` + `onboardingSeen`,
  emit `{startOnboarding:false}` (auto-onboarding suppressed; empty-profile banner still nudges).
- `app.ts onFirstLaunchDismissed(intent)`: open onboarding only when `intent.startOnboarding`.

Visual:

- Animated logo reveal (reuse sidebar SVG mark), greeting title + subtitle, two buttons
  (`appButton` primary + ghost), helper line. Sequential fade/scale-in with delays.
- `@media (prefers-reduced-motion: reduce)`: no animation, full opacity.
- Keep `<app-health-check-panel [showContinue]="false">` below a divider (diagnostics preserved,
  non-blocking).

i18n keys to add under `health`: `cta_onboarding`, `cta_skip`, `recommend_onboarding`.

Steps:

- [ ] Add i18n keys (en + de).
- [ ] Rewrite component template + styles with animation + two CTAs + health panel (no continue).
- [ ] Update `app.ts` dismissed handler for intent.
- [ ] Verify in `tauri dev` with a fresh DB (or force `healthCheckSeen=false`): animation plays,
      both buttons route correctly, reduced-motion respected.

### Task 5: Full design QA sweep

Steps:

- [ ] Dispatch read-only review agent over all routes for token/spacing/font/theme regressions.
- [ ] Walk each page in `tauri dev` (light + dark), fix findings.
- [ ] Frontend gate green (lint + test + build).

## Self-review

- Spec coverage: welcome (T4), buttons (T1-2), footer (T3), QA (T5) all mapped.
- No placeholders. Types: `ButtonSize` adds `'icon'` used in T2; `dismissed` payload type used in T4/app.ts.
