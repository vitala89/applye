# Page & Photo Layout Settings — Design

**Date:** 2026-07-09
**Status:** Approved (design), pending implementation plan
**Branch:** `feat/page-photo-layout`
**Builds on:** PR #64 (`feat/export-style-parity`) — shared section-tagged block model, DOCX/PDF style parity, PDF wrapping, DOCX spacing.

## Goal

Let the user control the **page** (size, margins) and the **CV photo position** from the editor, see it in the live preview, and have DOCX and PDF export render it identically.

## Scope

In scope:

- **Page settings** — size (A4 / Letter) + margin preset (Narrow / Normal / Wide), **portrait only**. Applies to **CV and cover letter**.
- **Photo placement** — 4 discrete slots. Applies to **CV only** (cover letter has no photo).
- Editor controls, live preview reflection, identical DOCX + PDF export.

Explicitly out of scope (deliberate, for cross-format fidelity and YAGNI):

- Free pixel drag of the photo.
- Text wrapping around the photo (`printpdf` cannot do it; docx floating anchors are unreliable).
- Landscape orientation.
- Per-side numeric margins (presets only).

## Photo slots

Four discrete placements:

| Slot           | Layout                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------- |
| `above_left`   | Photo box at top, left-aligned; name/contact flow below. (default)                        |
| `above_center` | Photo box at top, centered; name/contact flow below.                                      |
| `left`         | Two-column header: photo left, name + contact right.                                      |
| `right`        | Two-column header: name + contact left, photo right. (the layout the user originally had) |

The two-column slots (`left` / `right`) affect only the header region (photo + `personal_details`). Everything from the first section heading down renders full-width below the header.

## Data model

`libs/core/src/lib/models/document.model.ts` (and the Rust mirrors in `commands/documents.rs`):

```ts
export type PageSize = 'a4' | 'letter';
export type PageMargin = 'narrow' | 'normal' | 'wide';

export interface PageSettings {
  size: PageSize; // default 'a4'
  margin: PageMargin; // default 'normal'
}
```

- Add `page?: PageSettings` to **`CvStyle`** and **`CoverLetterStyle`** (both live in `style_json`). Absent → default `{ size: 'a4', margin: 'normal' }`, so every existing document keeps working.
- Add `placement?: 'above_left' | 'above_center' | 'left' | 'right'` to **`CvPhotoSection`** (in `contentJson`). Absent → `above_left`.

Rust: extend the `CvStyle` struct with `#[serde(default)] page: PageSettings` (new `PageSettings` struct with serde defaults, same pattern as the existing `default_font_*` helpers). Photo placement is read from the photo section JSON in the export core (same place the photo bytes are already extracted).

### Preset values (mm)

Margins are equal on all four sides:

| Preset   | mm   |
| -------- | ---- |
| `narrow` | 12.7 |
| `normal` | 20.0 |
| `wide`   | 30.0 |

Page sizes (portrait, mm): A4 = 210 × 297; Letter = 215.9 × 279.4.

A single Rust helper resolves `PageSettings` → `(page_w_mm, page_h_mm, margin_mm)`; a matching TS helper resolves it for the preview. Both are the single source of truth for their side.

## Editor (Angular)

Both editors (`cv-detail`, `cover-letter-detail`):

- New **"Page"** group in the style panel: a size select (A4 / Letter) and a margin segmented control (Narrow / Normal / Wide). Writes `style.page`.
- All labels through `libs/i18n` (EN + DE).

CV photo card only:

- Four **placement chips** (above-left / above-center / left / right) writing `photoSection.placement`.
- In the preview, the four slots are click-targets: clicking a slot selects that placement (highlight on hover). This is the "reposition in the preview" interaction — **click-to-place**, not free drag.

## Preview

- The preview page container derives its **aspect ratio** from `page.size` and its **inner padding** from `page.margin` (via the TS resolver → CSS). The user sees the real proportions and margins.
- The photo renders in the chosen slot; `left`/`right` switch the header to a two-column flex row.

## Export (Rust, shared renderers)

Thread a resolved `PageConfig { page_w_mm, page_h_mm, margin_mm }` and the photo `Placement` into `render_blocks_docx` / `render_blocks_pdf` (currently hardcode A4 + 18 mm).

- **PDF:** use `page_w_mm`/`page_h_mm` for every `add_page`; use `margin_mm` for the left/right margins and the wrap width (`avail = page_w - 2*margin`); top start = `page_h - margin`.
- **DOCX:** set the section `PageSize` and `PageMargin` (docx-rs) from the config.
- **Photo slots:**
  - `above_left` / `above_center`: current top box, aligned left or centered.
  - `left` / `right`: two-column header. **DOCX** = a borderless 1×2 table (photo cell + name/contact cell). **PDF** = render the photo in one column and the name/contact block in the other at a fixed column split, then resume full-width below the taller of the two.

The header (photo + `personal_details`) is rendered by a small dedicated helper so the slot logic lives in one place; the block loop below it is unchanged.

## Testing

Rust unit tests:

- `PageSettings` → `(w, h, margin)` resolution for every size × preset combination.
- Export smoke per photo slot (non-empty bytes for `above_left` / `above_center` / `left` / `right`).
- DOCX carries the expected page size/margin; PDF page dims match the resolved size.

Editor:

- Preview reflects size (aspect), margin (padding), and slot; placement chip + preview click both update `placement`.

## Sequencing

One branch (`feat/page-photo-layout`), two implementation phases:

1. **Page settings** — model + resolvers, editor controls, preview, DOCX/PDF export, both CV and cover letter.
2. **Photo slots** — model, editor chips + preview click, DOCX/PDF header rendering, CV only.

## Non-goals recap

Free drag, text wrap, landscape, numeric margins — all excluded. If the user later wants finer control, numeric margins and snap-drag are natural follow-ups on top of this model.
