# CV Photo Upload — Design

- **Date**: 2026-07-09
- **Branch**: `feat/cv-photo-upload`
- **Task**: Documents / CV — photo upload (step 2, spawned task `task_c11978c7`)
- **Status**: Approved design, ready for implementation plan

## Goal

Let a user add a personal photo to a CV document: pick a local image, crop/fit it
to a fixed CV-photo aspect ratio, store it locally inside the CV document, render
it in the live preview when "Include photo" is on, and embed it in DOCX and PDF
exports.

## Context (existing foundation)

The data model already anticipates this feature; most plumbing is absent:

- `libs/core/src/lib/models/document.model.ts`
  - `CvSectionKey` already includes `'photo'`.
  - `CvPhotoSection` exists: `{ key: 'photo'; filePath?: string }` + base
    `order/visible/sourceHash`.
  - `CvTemplate.includePhoto: boolean` exists; DE-traditional template defaults on.
- `apps/desktop/src/.../cv-detail/cv-detail.component.ts`
  - `includePhoto` signal (~L136), seeded from the photo section `visible` on load,
    written back to `visible` on save. `filePath`/photo bytes never touched.
  - `previewSections` overlays the live toggle onto the photo section.
- `cv-detail.component.html`
  - "Include photo" toggle chip (~L87).
  - Editor `@case('photo')` is a stub that only renders a hint (~L571).
  - Preview `@for` has **no** `@case('photo')` block (~L645).
- Export: `cv_document_export_bytes_core` (documents.rs ~L771) →
  `cv_content_to_markdown` (~L225, docx/pdf) / `cv_content_to_tex` (~L387).
  Photo section currently falls through the `_ => {}` catch-all in both
  (md ~L359, tex ~L556) — intentionally skipped.
- No image/photo/avatar/base64 handling exists anywhere. File picker pattern
  (Tauri dialog plugin) exists in `cv-list.component.ts` (~L199).
- Migrations: latest `0013_cv_templates_personal_details.sql`. CV content stored as
  JSON TEXT (`document_library.content_json`), not blob.
- No `image` or `base64` crate in `apps/desktop/src-tauri/Cargo.toml`. `docx-rs 0.4`
  and `printpdf 0.7` present; both export renderers currently take only `&str`
  markdown and hand-roll a line-by-line conversion (no markdown parser crate).

## Decisions (all confirmed with user)

1. **Storage**: base64 JPEG data URI embedded in the CV document
   (`CvPhotoSection`), inside the existing `content_json`. No new DB column, no
   migration, no new filesystem writes. Privacy-simplest: bytes live in local
   SQLite and travel with the document.
2. **Export**: photo included in **DOCX and PDF**. LaTeX (`.tex`) skipped.
3. **Crop UX**: pick image → fixed-ratio crop frame with drag-to-reposition and a
   zoom slider → render visible region to a canvas → store JPEG. No new frontend
   dependency (native canvas + pointer events).
4. **Aspect ratio**: fixed portrait **3:4** (German Bewerbungsfoto standard).
5. **New Rust deps approved**: `base64` (decode data URI) and `image` (decode
   pixels for printpdf).
6. **LaTeX**: keep the existing no-op; add a code comment + doc note that `.tex`
   omits the photo (the `.tex` is never compiled by the app and has no
   companion-asset mechanism).

## Architecture

### Data model — `libs/core`

- Extend `CvPhotoSection`:
  ```ts
  interface CvPhotoSection extends CvSectionBase {
    key: 'photo';
    /** Cropped photo as a JPEG data URI: `data:image/jpeg;base64,...`. */
    dataUri?: string;
    /** Legacy/unused; retained for back-compat. */
    filePath?: string;
  }
  ```
- No Rust-typed mirror needed — export walks `content_json` as untyped JSON and
  will read the `dataUri` field via a string getter.

### Upload + crop — frontend (`cv-detail`, no new deps)

1. Replace the editor `@case('photo')` stub (html ~L571) with:
   - empty state (no photo) → "Upload photo" button;
   - populated state → 3:4 thumbnail + "Replace" / "Remove" buttons.
2. Upload → `@tauri-apps/plugin-dialog` `open()` with filters
   `jpg,jpeg,png,webp` (reuse `cv-list` pattern) → returns a path.
3. A small Rust command reads the picked file bytes and returns them (base64) so
   the webview can load the source image without an fs/asset-protocol capability.
   (Reuses the existing "Rust reads the picked path" pattern; no new capability.)
4. Crop modal:
   - fixed **3:4** frame;
   - source image draggable to reposition, zoom via slider (pointer events);
   - Confirm → draw the visible region to an offscreen `<canvas>` sized
     **360×480**, `canvas.toDataURL('image/jpeg', 0.85)` (~30–70 KB base64);
   - store the result in the photo section `dataUri`; Cancel discards.
5. `dataUri` is serialized with the rest of `{ sections }` on save (existing save
   path). Remove → clear `dataUri`.

### Preview render — `cv-detail.component.html`

- Add a `@case('photo')` block in the preview `@for` (missing today).
- Render `<img [src]="photo.dataUri">` in a 3:4 slot positioned top-right of the
  Personal Details header (DE convention).
- Show only when `includePhoto()` is on **and** `dataUri` is present.

### Export — `documents.rs` + `tailoring.rs`

- Add crates: `base64`, `image` (pinned).
- In `cv_document_export_bytes_core` (has `content_json` in scope): parse the
  photo section, and when `includePhoto`/`visible` and `dataUri` are set, decode
  the data URI to bytes once.
- Extend renderer signatures to accept optional image bytes:
  - `md_to_docx_bytes(content_md, photo: Option<&[u8]>)` → embed via docx-rs
    image API (verify exact `add_image`/`Pic` surface for 0.4 before coding).
  - `md_to_pdf_bytes(content_md, photo: Option<&[u8]>)` → decode pixels with the
    `image` crate, embed via printpdf `Image`/`ImageXObject` (verify 0.7 API).
  - Photo placed at the top of the document.
- `cv_content_to_tex`: leave the no-op; add a comment noting `.tex` omits the
  photo. Update docs accordingly.

### i18n — `libs/i18n`

- Reuse existing `documents.cv_toggle_photo`, `documents.cv_photo_hint`,
  `documents.cv_section_photo`.
- Add EN + DE keys for: upload / replace / remove actions and crop-modal strings
  (title, zoom label, confirm, cancel).

## Testing

- `npm run desktop:build` and affected Jest tests.
- Preview flow: upload → crop → confirm → photo appears in preview; toggle off
  hides it while retaining bytes; remove clears it.
- Export: produce one DOCX and one PDF, open both, confirm the photo renders.
- Model: `CvPhotoSection` (de)serialization round-trips `dataUri`.

## Privacy review notes

- Photo bytes stay in the local SQLite `content_json`; no new filesystem writes
  beyond the user-chosen export path.
- No external/network calls; no AI involvement.
- Picker reads only a user-selected file; the Rust read command must be scoped to
  the picked path only (no arbitrary path traversal).

## Out of scope

- Photo in LaTeX export.
- Multiple photos / photo per section other than the dedicated photo section.
- Server or cloud storage of photos.
- Rich photo editing (rotate, filters, free aspect).

## Risks / verify-before-coding

- Exact docx-rs 0.4 image API and printpdf 0.7 image-embedding API — confirm from
  crate docs before writing the calls.
- `content_json` size growth — bounded by the 360×480 JPEG q0.85 output.
