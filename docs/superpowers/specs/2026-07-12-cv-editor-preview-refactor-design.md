# CV Editor / Preview Refactor — Design

**Date:** 2026-07-12
**Status:** Proposed
**Branch (target):** `feat/cv-editor-preview-refactor` (phased; each phase may be its own branch)

## Problem

The CV builder has grown into a single overloaded surface. `cv-detail.component`
fuses ~10 concerns into one class (1139 TS / 1254 HTML / 877 SCSS): metadata,
six section-type editors, document + per-section styling, theme selection, photo
crop, live pagination/preview, AI regeneration, template save, and PDF export.

Three consequences:

1. **AI can't cleanly target the CV.** Content, style, and theme are edited in the
   same place; the AI contract for "fill a CV from the profile" is not crisply
   content-only.
2. **The edit screen overwhelms users.** Structure and fine-grained visual controls
   (per-section font/size/colour/weight/line-height popovers) sit side by side.
3. **Exports drift from the preview.** There are three renderers — Angular preview
   (theme-accurate), Rust DOCX/`printpdf` (theme-blind, only reads seeded
   font/size/accent), and dead LaTeX. Aurora's rules/uppercase/italic-roles/industry
   silently vanish in DOCX and Rust-PDF.

## Goals

- Content model is the clean, content-only target the AI writes.
- Edit mode owns **structure + theme + global style defaults** only.
- Preview becomes a **live visual editor**: inline text edits + colour/font/spacing
  controls that write to the existing per-instance style-override layer.
- One coherent rendering story: preview and PDF are pixel-WYSIWYG; DOCX is
  **ATS-safe structural** but honours the same theme tokens so it reads as a sibling.
- Remove LaTeX export.

## Non-goals

- No fresh content schema / no data migration (decision: **incremental**). Keep
  `CvContent` / `CvStyle` / `CvThemeDescriptor` shapes; saved CVs stay valid.
- DOCX is **not** pixel-matched to the preview (decision: **ATS-safe wins**).
  Single column, semantic headings, standard fonts. It honours theme _tokens_
  (font family, size, colour, weight, uppercase headers, rule-under-heading, italic
  role) but not layout tricks.
- No marketplace / theme-upload work (the `validate_theme` seam stays as-is).
- Cover-letter parity is out of scope for this effort (tracked as follow-up; the
  same seams apply later).

## Current architecture (as-is)

| Layer                   | Where                                                                                                                         | Notes                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Content                 | `libs/core/.../document.model.ts` → `CvContent` (discriminated union of 7 section types)                                      | Already content-only. Good.                                                                   |
| Style                   | same file → `CvStyle` (doc default + `sectionStyles` overrides + `titleStyle`/`titleBorder`/`page`)                           | The per-instance override layer already exists.                                               |
| Theme                   | `libs/core/.../cv-theme.model.ts` → `CvThemeDescriptor` (Classic id 1, Aurora id 2)                                           | `themeStyleSeed()` seeds `CvStyle`; `themeCssVars()` drives preview CSS. Stored as `themeId`. |
| Content↔style helpers   | `apps/desktop/.../documents/cv-content.util.ts` (642 lines)                                                                   | `orderedVisibleSections`, `effectiveSectionStyle`, `cvContentToMd`, AI-response parsing, etc. |
| Editor + inline preview | `cv-detail.component.*` (god component)                                                                                       | Preview is markup inside the same component, reactive to editor signals.                      |
| Export (Rust)           | `tailoring.rs` (block model + DOCX + `printpdf`), `documents.rs` (`cv_content_to_blocks`, TeX, dispatch `cv_document_export`) | Block model: `BlockLevel` → `StyledBlock` → `RenderBlock` → `InlineRun`.                      |
| PDF (WYSIWYG)           | `exportPdfWysiwyg()` in the Angular component (`window.print()`)                                                              | Theme-accurate. Independent of Rust.                                                          |

## Target architecture

One canonical model, three consumers, no forked styling logic:

```
   CvContent   (content — AI writes THIS, style-free)
 + CvStyle     (global defaults + per-section overrides — live editor writes THIS)
 + CvThemeDescriptor (named preset — seeds CvStyle + supplies tokens)
        │  same data, no fork
   ┌────┼─────────────────┐
   ▼    ▼                 ▼
 HTML preview   PDF = print(preview)   DOCX (Rust)
 (Angular,      WYSIWYG, pixel-exact   ATS-safe structural,
  live editor)                         honours theme tokens
```

### Responsibility split (UI)

- **Edit mode** (`/documents/cv/:id` edit route): section add/remove/reorder,
  entries/bullets add/remove, personal-details fields, photo include+crop, theme
  picker, **global** style defaults (font/size/weight/accent, page size/margins).
  No per-section style popovers here.
- **Preview mode** (same route, preview toggle / or `/preview` sub-route): the live
  visual editor. Inline-editable text; a floating/side control panel for colour,
  font, size, spacing, and text, writing to `CvStyle` per-section overrides + content.

Both modes render through **one presentational `CvPreviewComponent`**; the preview
mode simply enables its interactive affordances.

## Component decomposition

Extract from the god component into `apps/desktop/.../documents/cv-detail/`:

- `cv-preview/cv-preview.component.*` — **presentational render** of `CvContent` +
  resolved `CvStyle` + `CvThemeDescriptor`. `@Input()` content/style/theme/interactive;
  `@Output()` contentChange / styleChange. Owns the `.cvpreview__*` markup, the atom
  `<ng-template>` pagination fragments, and `themeVars()`. This is the seam for the
  live editor and the single source of on-screen truth.
- `section-editors/` — one child per section type (`personal-details`, `summary`,
  `experience`, `education`, `skills`, `languages`), replacing the six `@switch`
  arms. Each `@Input()` its section slice, `@Output()` a section change.
- `cv-style-panel/` — global style defaults (stays in edit mode) vs the live
  per-instance controls (move to preview). Split the current `docedit-style-*` +
  `cvdetail__style-pop` markup accordingly.
- `cv-detail.component` shrinks to an **orchestrator**: load/save, wiring children,
  theme pick, template save, export dispatch, profile pull.

Keep `cv-content.util.ts` as the shared pure logic these children call.

## Rendering unification

### PDF — collapse to one path

PDF from the CV detail view is **always** the WYSIWYG `window.print()` path (already
theme-accurate). Retire the Rust `printpdf` path for structured CV export
(`cv_document_export` `"pdf"` arm). This removes divergent-pipeline problem #2.
(The `printpdf` renderer may remain for the legacy journal/tailored-markdown path if
still used there — audit during the phase; do not delete blindly.)

### DOCX — feed theme tokens into the block model (ATS-safe)

Extend the Rust block resolution to accept the active `CvThemeDescriptor` tokens (or a
resolved token payload passed from TS), so `resolve_blocks` / `render_blocks_docx`
emit, per theme:

- section-header casing (uppercase for Aurora) via text transform,
- rule-under-heading via a paragraph bottom border (`docx-rs` supports it),
- italic role runs, industry line, bullet marker,
- font family / size / weight / accent already flow through the seed.

Result: Aurora reads as Aurora in Word, still single-column and parser-friendly.

### Styling-cascade duplication (problem #4) — deferred debt

The style cascade is implemented twice (TS `effStyle/effectiveSectionStyle`, Rust
`effective_cv/resolve_blocks`). Fully collapsing it (TS resolves, Rust consumes a flat
payload) is out of scope here; note it as debt. This phase only _feeds theme tokens_
into the existing Rust cascade.

## LaTeX removal (isolated, do first)

Delete, in order:

- `documents.rs`: `tex_escape` / `tex_inline` / `cv_content_to_tex` (~lines 528–760)
  and the `"tex"` arm in `cv_document_export` (~line 1228).
- `db.service.ts:285`: drop `'tex'` from the export format union.
- Angular: remove the "Export as .tex" action + `cv_export_tex_action` i18n keys
  (`translations.ts` ~597 / ~1585, EN + DE).
- Rust + TS tests referencing tex.

## Phasing (each phase ships independently)

| Phase                               | Scope                                                                                                                                                                           | Risk    | Depends |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------- |
| **A. Remove LaTeX**                 | delete TeX surface end-to-end                                                                                                                                                   | low     | —       |
| **B. Lock the AI content contract** | document + guard content-only AI import/generate; `normalizeCvContent` validation; confirm `cv-import` / `cv-generate-baseline` skills emit `CvContent` only, never style/theme | low–med | —       |
| **C. Decompose + split UI**         | extract `CvPreviewComponent` + section editors + style-panel split; edit=structure+theme+global, per-section visual controls move out                                           | med     | B       |
| **D. Live preview editor**          | inline text edit + floating colour/font/spacing controls writing to `CvStyle` overrides                                                                                         | high    | C       |
| **E. Unify export**                 | PDF→single WYSIWYG path; feed theme tokens into Rust DOCX                                                                                                                       | high    | A, C    |

Recommended order: **A → B → C → E → D** (E before D: lock export correctness on the
clean components before layering interactive editing on top).

## Testing

- **A:** build green after deletion; no `tex`/`cv_content_to_tex` references remain
  (grep gate); export dropdown no longer offers `.tex`.
- **B:** unit tests that AI-shaped JSON parses to `CvContent` with style untouched;
  `normalizeCvContent` rejects/strips style keys from content payloads.
- **C:** each extracted child has focused specs (render + change emit); god-component
  line count drops materially; existing preview snapshot/pagination behaviour
  unchanged (regression).
- **D:** inline edit emits a content change; a colour/font/spacing control writes the
  expected `CvSectionStyle` override; edit and preview stay in sync.
- **E:** golden test that Aurora DOCX contains uppercase headers + heading bottom
  border + italic role; PDF export path invoked is the WYSIWYG one; ATS smoke check
  (single column, standard heading structure).

## Open questions

Resolved for Phase D:

- **Preview mode surface:** reuse the existing in-page preview toggle. A dedicated
  `/preview` sub-route adds route/session ownership before deep-linking is a proven
  need; the current route keeps one unsaved local draft and one save/export owner.
- **Live editor control chrome:** use a fixed contextual side panel. It is stable
  across page reflow, does not cover the paper, and is keyboard/screen-reader
  accessible. A floating quick-action toolbar may be reconsidered later, but is not
  the formatting authority in Phase D.
- **Inline editing:** swap one visible text leaf to a native input/textarea, keep a
  local draft, and emit one immutable section change on commit. This avoids raw
  `contenteditable` DOM mutation and prevents per-keystroke repagination from
  destroying the caret.
- **Spacing contract:** add optional, body-only, unitless
  `CvSectionStyle.lineHeight`. Inherit/missing emits no inline override so existing
  per-element layout and pagination remain unchanged; the explicit Normal option is
  1.45. Phase D applies/persists it in the Angular preview/WYSIWYG PDF; Rust
  DOCX/list-PDF tolerance is sufficient until Phase E.

[Phase D implementation plan](../plans/2026-07-12-cv-refactor-phase-d-live-preview-editor.md)
