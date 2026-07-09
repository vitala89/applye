# Discrete Page Cards in CV / Cover-Letter Preview — Design

**Date:** 2026-07-09
**Branch:** `feat/preview-page-cards`
**Status:** Design approved, awaiting spec review → plan → implementation.
**Supersedes:** Step 1b + Step 1 in `2026-07-09-photo-placement-NEXT-STEPS.md`.

## Goal

Replace the current single continuous preview sheet (with a dashed
`repeating-linear-gradient` break-guide) with **real, discrete page cards**:
each page rendered as its own white paper card with a caption underneath —
**"Page 1 of N", "Page 2 of N", …** — so page 2 shows how content actually
continues. Folds in the "always-white sheet" decision (Step 1): cards render
as white paper regardless of app theme, so screen == printed PDF.

Applies to both `cv-detail` and `cover-letter-detail` previews.

## What exists today (baseline)

- One `.cvpreview` / `.letter-sheet` element, `min-height: var(--page-h)`,
  content blocks rendered inline.
- Page geometry as CSS vars (`--page-w/--page-h/--mt/--mr/--mb/--ml`),
  `PX_PER_MM = 96/25.4`, from `resolvePageSettings()`.
- Break guides painted via `repeating-linear-gradient` at each page-h boundary.
- `recomputePages()` reads `el.scrollHeight`, sets `pageCount = ceil(contentH / usableH)`
  and `blockOverflow` (any direct child taller than one usable page).
- A single `.cvpreview__pagebar` row below the sheet + overflow warning banner.
- Print: global `styles.scss` `@media print` pins the sheet to light-paper
  tokens, `@page` supplies margins, `visibility` toggle shows only the sheet.

Key files: `apps/desktop/src/app/pages/documents/{cv-detail,cover-letter-detail}/*.{ts,html,scss}`,
`cv-content.util.ts` (`resolvePageSettings`), `apps/desktop/src/styles.scss`.

## Locked decisions

| #   | Decision                      | Choice                                                                                            |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | Content splitting granularity | **Entry-level atoms** — flatten to ordered atoms; section may continue on next card               |
| 2   | Screen ↔ print fidelity       | **Approximate, same rules** — native browser pagination + `break-inside: avoid` on the same atoms |
| 3   | Code shape                    | **Shared paginator in `libs/ui`** — both previews project their atoms into it                     |

## Architecture — measure → bucket → render

```
content blocks ─▶ flatten to ordered atoms ─▶ hidden measure pass
                                                    │ offsetHeight per atom
                                                    ▼
        render N .page-card ◀─ greedy pack into pages by usableH
```

1. **Flatten** the CV / letter into an ordered list of _flow atoms_.
2. **Measure pass:** render atoms once into a hidden, page-width, single-flow
   container styled identically to a card's inner content (same font, same
   `--page-w` minus margins). Read each atom's `offsetHeight`. Replaces the
   current `el.scrollHeight` read.
3. **Pack (pure fn):** `paginate(atomHeights, usableH) → number[][]` — greedy:
   walk atoms, accumulate into the current page until the next atom would
   exceed `usableH = (heightMm − mt − mb)·PX_PER_MM`; overflowing atom starts a
   new page. An atom is never split.
4. **Render** one `.page-card` per bucket; atoms projected in order; caption
   "Page i of N" under each; `var(--space-6)` gap between cards.
5. **Recompute** on the same triggers as today's effect — content change,
   `pageVars()` (geometry/margins), preview-mode enter — via effect +
   `ResizeObserver` on the measure container.

## Atom model (entry-level granularity)

| Atom kind                                               | Keep-together rule                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `header` (name / title / contact / photo)               | whole                                                                   |
| `summary`                                               | whole block                                                             |
| `skills`                                                | whole block                                                             |
| `section-title`                                         | glued to the **first following entry** (no orphan title at page bottom) |
| `entry` (each Experience / Education row + its bullets) | whole                                                                   |
| `languages`                                             | whole block                                                             |

When a section spills across a card boundary, its title reprints atop the
continuation as **"Experience (cont.)"** — localized, EN + DE, via `libs/i18n`.
DE-CV convention. The continuation marker is a rendered decoration on the
continuation card, not a separate packed atom.

### Oversized-atom edge case

One atom taller than a full usable page (e.g. a single 12-bullet entry, or a
large skills block) cannot be packed cleanly. It is placed alone on its own
card and allowed to visibly overflow the card bottom, and a **soft warning
banner** is shown ("Block too tall to fit one page — shorten it"). This
repurposes today's `blockOverflow` signal rather than deleting it. Rare; an
honest signal beats silent clipping.

## Card visual + always-white sheet (Step 1 fold-in)

- `.page-card`: `width: var(--page-w)`, `height: var(--page-h)` (fixed — a real
  page, not `min-height`), padding = the four margin vars, `overflow: hidden`
  (except the oversized edge case, which may overflow).
- **Always white in both themes.** Lift the light-paper token block currently
  in `styles.scss` `@media print` (`--surface-*`, `--text-*`, `--border-*`,
  accent tokens, `#fff` / `#16161a`) to the **base** `.page-card` rule so
  screen matches print. Dedupe into a single SCSS placeholder `%paper-light`
  applied in both the base card rule and the print block (print keeps its
  `padding:0` + `background-image:none`).
- Accent colour (`accentColorHex`, name/titles) stays inline — a real colour,
  correct on white.
- Caption: `.page-card__caption` below each card — muted, centered, uses
  **app-theme** text colour (it is chrome around the paper, not paper).
- Viewport keeps the app-theme grey "desk" around the white cards.
- **Removed:** `repeating-linear-gradient` guides; the single `.cvpreview__pagebar`
  page-count row (page count is now the per-card caption). The `blockOverflow`
  warning banner stays for the oversized edge case.

## Print sync (approximate, same rules)

- Print keeps **native browser pagination**. Because on-screen cards are packed
  from the same `usableH` and the same `break-inside: avoid` atoms, the on-screen
  card boundaries and the printed `@page` breaks fall at the same atom
  boundaries (approximate — a one-line drift at an edge is possible).
- `@media print`: cards are screen chrome. Hide the `.page-card` framing +
  captions and let the atoms reflow into native `@page` (atoms carry
  `break-inside: avoid`, so the browser breaks at the same atom boundaries).
  `.page-card__caption { display: none }`.
- **All cross-component print rules stay in global `apps/desktop/src/styles.scss`.**
  (Lesson from PR #67: Angular Emulated encapsulation scopes component-SCSS
  `body.printing-cv *` to that component's own elements and cannot hide the app
  shell — print rules that hide/show across components MUST be global.)

## Shared paginator — `libs/ui` boundary

```
PaginatedSheetComponent (libs/ui)
  inputs:  pageVars (w/h + 4 margins), ordered atom list (host-projected templates)
  outputs: pageCount, blockOverflow
  owns:    measure pass, packing, .page-card render, "Page i of N" caption, %paper-light
  NOT owns: what an atom looks like — CV and letter project their own content
```

- The host (`cv-detail` / `cover-letter-detail`) builds the ordered atom list
  from its own model and supplies each atom's template; the component measures,
  buckets, frames, and captions. Interface: host = "what content", component =
  "how it paginates".
- Packing/measuring split so the packing decision is a **pure util**
  (`paginate(atomHeights, usableH) → number[][]`), unit-testable without DOM.
- Continuation-title reprint ("… (cont.)") is host-aware (the host knows which
  atom is a `section-title` and its label), surfaced via atom metadata the
  component reads when a section's atoms span two cards.

## Testing

- **Pure `paginate()` util** (Jest, no DOM): greedy packing; oversized atom →
  its own bucket; `section-title` glued to first following entry (no orphan);
  empty input → one empty page; exact-fit boundary.
- **Component specs:** N cards rendered for a given set of atom heights; caption
  text "Page i of N"; oversized atom → `blockOverflow` emitted.
- **Host specs:** existing `cv-detail` / `cover-letter-detail` specs updated —
  guides + `pagebar` gone, cards present, continuation label localized.
- **Manual gate:** dark theme → cards render white; printed PDF page breaks
  match on-screen card boundaries (approximate); "… (cont.)" appears on a
  spilled section.

## Risks

- **Atom-boundary match to native print** depends on the measure container
  being styled identically to a card's inner content. Mitigation: the measure
  container reuses the exact `.page-card` inner content class and the same
  loaded fonts.
- **Measure-then-render reflow / flicker** (double render). Mitigation: hidden measure
  container is `visibility:hidden`/off-screen; cards render once packing is
  computed; recompute is signal-driven and debounced by `ResizeObserver`.

## Out of scope

- Phase D photo-placement slots (separate spec, next feature).
- Any change to margins model, `resolvePageSettings`, DOCX/tex export, or the
  Rust page resolver — all unchanged.
