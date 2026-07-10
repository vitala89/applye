# Photo Placement Slots — Design (Phase D)

**Date:** 2026-07-10
**Branch:** `feat/photo-placement`
**Supersedes:** `2026-07-09-page-photo-layout-design.md` (photo-slot portion) and Step 2 of `2026-07-09-photo-placement-NEXT-STEPS.md`.

## Goal

Let the user place the CV photo in one of three header slots — top-left, top-center, top-right — from the editor, see it live in the paginated preview, and have PDF and DOCX export render it identically. CV only (the cover letter has no photo).

## Scope

- **Slots:** `above_left` / `above_center` / `above_right`, all within the header band. No sidebar, no column layout.
- **Layout semantics (float-beside):**
  - `above_left` — photo floats top-left; name/contact flow to its right.
  - `above_right` — photo floats top-right; name/contact flow to its left (classic DE Bewerbungsfoto).
  - `above_center` — photo centered as a block; name/contact below it.
- **Back-compat default:** `above_left` — matches today's inline top box, so every existing CV renders unchanged with no migration.
- **Three surfaces:**
  - Preview — CSS float inside the existing header atom.
  - PDF — free: export is WYSIWYG `window.print()` of the same preview DOM, so the float carries over automatically.
  - DOCX — explicit: 2-cell borderless table for left/right, centered paragraph for center.
- LaTeX already omits the photo by design — unchanged.

## Why this is contained

The photo already lives **inside the first paginated atom** — the `#headerTpl` fragment that also holds name + contact, measured as one unit by `PaginatedSheetComponent`. Float-beside is a change _within that atom_: the atom reports its own natural (float-contained) height, so:

- `paginate()` needs **no change** — pagination stays correct.
- **PDF is automatic** — it prints the same sheet DOM.

Only DOCX needs real export work.

## Data model (TS + Rust parity)

`libs/core/src/lib/models/document.model.ts`:

```ts
export type PhotoPlacement = 'above_left' | 'above_center' | 'above_right';

export interface CvPhotoSection extends CvSectionBase {
  key: 'photo';
  /** Cropped photo as a JPEG data URI. */
  dataUri: string;
  placement?: PhotoPlacement; // absent → 'above_left'
}
```

Rust (`commands/documents.rs`, the photo section read in the export core):

```rust
#[derive(Serialize, Deserialize, Clone, Copy, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PhotoPlacement {
    #[default]
    AboveLeft,
    AboveCenter,
    AboveRight,
}
```

- Field is optional both sides. Documents without a `placement` key deserialize to `above_left`. No doc-schema version bump, no data migration.

## Editor (Angular)

CV photo card only (`cv-detail.component.html`, the `@case ('photo')` block). Below the thumbnail / upload controls, a 3-chip segmented control:

- Chips: Left / Center / Right, writing `photoSection.placement`, persisted through the existing photo-edit save path.
- Reuse the existing per-section style-chip markup/SCSS pattern for visual consistency.
- Visible only when "Include photo" is on and a photo exists (same guard as the thumbnail).
- New i18n keys (EN + DE):
  - `documents.cv_photo_placement` — label. DE: "Foto-Position".
  - `documents.cv_photo_placement_left` / `_center` / `_right`. DE: "Links" / "Zentriert" / "Rechts".

## Preview + PDF (CSS float)

`#headerTpl` already wraps `cvpreview__photo` (img) + name/contact in one measured atom. Drive layout with a placement class on the header container, bound from `photoSection.placement`:

```scss
.cvpreview__header {
  &--left .cvpreview__photo {
    float: left;
    margin: 0 12px 8px 0;
  }
  &--right .cvpreview__photo {
    float: right;
    margin: 0 0 8px 12px;
  }
  &--center {
    text-align: center;
    .cvpreview__photo {
      float: none;
      margin: 0 auto 8px;
      display: block;
    }
  }
  &::after {
    content: '';
    display: block;
    clear: both;
  } // contain float → correct atom height
}
```

Correctness:

- The `clear: both` pseudo-element keeps the float inside the measured atom → pagination height stays correct.
- PDF inherits this automatically (WYSIWYG print of this DOM). No new print CSS. Verify the print-pinned light-paper block only pins color tokens and does not override float (it does not).
- Photo dimensions unchanged (existing fixed 3:4 box).
- Print rules stay in the global stylesheet (per the PR #67 lesson — never per-component).

## DOCX export

Thread `placement` from the photo section through `cv_document_export_bytes_core` into `render_blocks_docx(resolved, photo_bytes, placement, page)` (`commands/tailoring.rs`).

- `above_center` → centered photo paragraph (`AlignmentType::Center`); personal-details blocks flow below (as today).
- `above_left` / `above_right` → borderless 2-cell `Table`: one cell holds the photo, the other holds the resolved `personal_details` block group; cell order sets the side. Remaining blocks (summary, experience, …) flow normally below the table.
- The renderer must separate the `personal_details` block group from the rest. Blocks are already section-tagged (`section_key`), so the group is identifiable.

Rust `render_blocks_pdf` is no longer user-exposed for library CVs (library PDF is WYSIWYG-print). Apply matching `AlignmentType` for `above_center`; leave `above_left` / `above_right` as today (no table). Documented limitation — dead path for library CVs.

## Testing

- **TS unit:** placement defaults to `above_left` when absent; header class binding maps placement → correct class. Existing cv-detail specs stay green.
- **Rust unit:** serde round-trip — missing `placement` → `AboveLeft`; each variant serializes snake_case. DOCX render smoke per placement: center → aligned paragraph present; left/right → table with 2 cells present.
- **Manual desktop-build gate:** pick each slot; verify preview float, Export PDF matches screen, DOCX opens with the photo positioned correctly. Confirm no per-component print CSS was added.

## Sequencing

Single branch `feat/photo-placement`, ordered:

1. Model (TS + Rust parity) + i18n keys.
2. Editor chips.
3. Preview CSS float + header class binding.
4. DOCX table/alignment + thread placement through the export core.
5. Tests + manual gate.

## Non-goals (YAGNI)

- True sidebar / two-column body layout.
- Drag-to-place / click-in-preview placement.
- Per-slot photo sizing.
- Placement on the cover letter.
- LaTeX photo.
- PDF-via-Rust left/right table (dead path).

## Working rules

- Feature work on `feat/photo-placement`, never on `main`.
- Conventional Commits, lowercase subject (commitlint).
- Shared types → `libs/core`; strings → `libs/i18n`; TS↔Rust parity for exported shapes.
- Core offline; user data local + sensitive.
