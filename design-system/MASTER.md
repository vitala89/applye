# Applye Design System - MASTER

Global source of truth for how Applye UI must look and behave. Read this before
building or changing any screen, component, or style. Page-specific deviations go
in `design-system/pages/<page>.md` and only record what differs from this file.

> This document is the _contract_. The machine-readable values live in
> [`libs/ui/tokens.css`](../libs/ui/tokens.css) - never hardcode a color, size,
> radius, shadow, or duration; always use a `--token`. This file exists to capture
> the rules that CSS variables cannot encode (when to use what, component anatomy,
> voice) - the parts an agent tends to skip.

## Canonical sources (do not duplicate, reference)

| Concern                                                  | Source of truth                   |
| -------------------------------------------------------- | --------------------------------- |
| Color / type / spacing / radius / shadow / motion tokens | `libs/ui/tokens.css`              |
| Global element + utility styles                          | `libs/ui/src/styles/global.scss`  |
| Shared components                                        | `libs/ui/src/lib/**`              |
| User-facing strings                                      | `libs/i18n` (never hardcode copy) |

If a value you need is not a token, that is a signal - add a token to `tokens.css`
first, then use it. Do not introduce raw hex, px, or ad-hoc rgba in components.

## Brand identity (non-negotiable)

- **"A terminal made beautiful."** Monochrome graphite canvas + exactly one accent (indigo).
- **Dark is the default/brand canvas; light is first-class.** Every component must be
  built and checked in both themes via `data-theme`.
- **Two typefaces, two jobs.** `--font-mono` (JetBrains Mono) = brand voice: logo,
  headings, numbers, metrics, labels, badges, statuses, scores, code-like UI.
  `--font-sans` (Inter) = long-form reading: job descriptions, AI analysis, answers, docs.
- **Indigo accent appears ONLY on:** primary actions, active/selected states, focus
  rings, scores, AI status, and brand marks. Never as decoration. When in doubt, graphite.

## Component contracts

These are the rules most often dropped. Match them exactly.

### Buttons (the recurring miss)

- Radius: `--radius-card` (8px). Never `--radius-full` for text buttons.
- Font: `--font-mono`, `--weight-medium`; label tracking `--tracking-wide` if uppercase.
- Transitions: `--dur-instant` (hover/press) with `--ease-standard`.
- Focus-visible: `--shadow-ring` (accent). Required on every button. No exceptions.
- Variants:
  - **Primary**: `--accent` bg, `--accent-fg` text, `--accent-hover` / `--accent-pressed`. One primary per view.
  - **Secondary**: `--surface-2` bg, `--border-default`, `--text-primary`.
  - **Ghost / tertiary**: transparent bg, `--text-secondary`, hover `--surface-hover`.
  - **Danger**: only for destructive intent; `--danger` family.
- Disabled: `--text-disabled`, no shadow, no hover.

### Inputs / selects

- Radius `--radius-input` (6px), bg `--surface-sunken`, border `--border-default`,
  focus ring `--shadow-ring`. Font `--font-sans` for free text, `--font-mono` for codes/numbers.

### Cards / panels

- Radius `--radius-card`, bg `--surface-1`, border `--border-subtle`, elevation via
  surface+border on dark and `--shadow-sm/md` on light. Padding on the 8px grid (`--space-*`).

### Badges / chips / scores

- Radius `--radius-badge` (4px), `--font-mono`, `--text-2xs`/`--text-xs`, `--tracking-wider`
  if uppercase. Status tints: `--success-tint` / `--warning-tint` / `--danger-tint`.

## Layout rules

- Strict 8px grid: only `--space-*` tokens for margin/padding/gap.
- Layout primitives: `--sidebar-width`, `--content-max`, `--topbar-height`, `--app-header-h`.
- No motion bounce. Enter `--ease-out`, exit `--ease-in`, default `--ease-standard`.

## Enforcement workflow (how the agent must use this)

1. **Before building/changing UI:** read this file + the relevant `pages/<page>.md`.
   Restate which button variant, tokens, and typeface the change uses.
2. **While building:** use tokens only. No raw hex/px/rgba. Route copy through i18n.
3. **After building, before finishing the branch:** run the drift check
   `npx impeccable detect <changed-path>` (on-demand, no install) and reconcile the
   output against this contract. Verify both `data-theme="dark"` and `light`.
4. If a design reference (link/mock) is provided, treat it as an override for that
   screen and record the deltas in `design-system/pages/<page>.md`.
