# Photo Placement Slots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user place the CV photo in one of three header slots (top-left / top-center / top-right) from the editor, seen live in the paginated preview and rendered identically in PDF and DOCX export.

**Architecture:** A new `placement` field on the CV photo section (TS + Rust parity, optional, defaults to `above_left`). The preview drives a CSS float from a placement class on the header atom; PDF is the WYSIWYG print of that same DOM (free). DOCX renders a borderless 2-cell table for left/right and a centered paragraph for center. CV only.

**Tech Stack:** Angular 18 signals (standalone components), TypeScript, Rust (Tauri 2, `docx-rs` 0.4), Jest (`*.spec.ts`), `cargo test`.

## Global Constraints

- Feature branch `feat/photo-placement` (already created and checked out). Never commit to `main`.
- Conventional Commits, **lowercase** subject (commitlint enforced).
- Shared types → `libs/core`; UI strings → `libs/i18n` (EN + DE, keys must exist in both); TS↔Rust parity for any exported shape.
- Back-compat: `placement` is optional both sides; absent → `above_left`. No doc-schema version bump, no data migration.
- Print/float rules that cross components live in the GLOBAL stylesheet, never per-component SCSS (PR #67 lesson). This feature adds no new print CSS.
- Photo box dimensions are unchanged (existing 3:4 box; DOCX `972_000 x 1_296_000` EMU).

---

### Task 1: Model parity + i18n strings

**Files:**

- Modify: `libs/core/src/lib/models/document.model.ts` (near `CvPhotoSection`, ~line 32)
- Modify: `apps/desktop/src-tauri/src/commands/documents.rs` (add `PhotoPlacement` enum; used later in the export core)
- Modify: `libs/i18n/src/lib/translations/translations.ts` (EN block ~line 693, DE block ~line 1667)
- Test: `apps/desktop/src-tauri/src/commands/documents.rs` (inline `#[cfg(test)]`)
- Test: existing i18n parity test (whatever asserts EN/DE key sets match — run the i18n project's tests)

**Interfaces:**

- Produces (TS): `export type PhotoPlacement = 'above_left' | 'above_center' | 'above_right';` and `CvPhotoSection.placement?: PhotoPlacement`.
- Produces (Rust): `pub enum PhotoPlacement { AboveLeft, AboveCenter, AboveRight }` with serde snake_case + `Default = AboveLeft`.
- Produces (i18n): keys `documents.cv_photo_placement`, `documents.cv_photo_placement_left`, `documents.cv_photo_placement_center`, `documents.cv_photo_placement_right`.

- [ ] **Step 1: Add the TS type + field**

In `document.model.ts`, above `CvPhotoSection`:

```ts
export type PhotoPlacement = 'above_left' | 'above_center' | 'above_right';
```

Add the field to `CvPhotoSection`:

```ts
export interface CvPhotoSection extends CvSectionBase {
  key: 'photo';
  /** Cropped photo as a JPEG data URI: `data:image/jpeg;base64,...`. */
  dataUri?: string;
  /** Legacy/unused; retained for back-compat with older documents. */
  filePath?: string;
  /** Header slot for the photo. Absent → `above_left` (legacy inline top box). */
  placement?: PhotoPlacement;
}
```

- [ ] **Step 2: Write the failing Rust serde test**

In `documents.rs`, inside the existing `#[cfg(test)] mod tests` block (or add one), add:

```rust
#[test]
fn photo_placement_defaults_and_roundtrips() {
    use super::PhotoPlacement;
    // Missing field → default AboveLeft.
    #[derive(serde::Deserialize)]
    struct Holder {
        #[serde(default)]
        placement: PhotoPlacement,
    }
    let h: Holder = serde_json::from_str("{}").unwrap();
    assert_eq!(h.placement, PhotoPlacement::AboveLeft);
    // snake_case round-trip for each variant.
    for (v, s) in [
        (PhotoPlacement::AboveLeft, "\"above_left\""),
        (PhotoPlacement::AboveCenter, "\"above_center\""),
        (PhotoPlacement::AboveRight, "\"above_right\""),
    ] {
        assert_eq!(serde_json::to_string(&v).unwrap(), s);
        assert_eq!(serde_json::from_str::<PhotoPlacement>(s).unwrap(), v);
    }
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/desktop/src-tauri && cargo test photo_placement_defaults_and_roundtrips`
Expected: FAIL — `cannot find type PhotoPlacement`.

- [ ] **Step 4: Add the Rust enum**

In `documents.rs` (near the other exported document structs):

```rust
#[derive(serde::Serialize, serde::Deserialize, Clone, Copy, Default, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum PhotoPlacement {
    #[default]
    AboveLeft,
    AboveCenter,
    AboveRight,
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/desktop/src-tauri && cargo test photo_placement_defaults_and_roundtrips`
Expected: PASS.

- [ ] **Step 6: Add the i18n keys (EN + DE)**

In `translations.ts`, in the EN block after `cv_photo_hint` (~line 693):

```ts
    cv_photo_placement: 'Photo position',
    cv_photo_placement_left: 'Left',
    cv_photo_placement_center: 'Center',
    cv_photo_placement_right: 'Right',
```

In the DE block after `cv_photo_hint` (~line 1667):

```ts
    cv_photo_placement: 'Foto-Position',
    cv_photo_placement_left: 'Links',
    cv_photo_placement_center: 'Zentriert',
    cv_photo_placement_right: 'Rechts',
```

- [ ] **Step 7: Run the i18n + core tests**

Run: `npx nx test i18n && npx nx test core`
Expected: PASS (EN/DE key parity holds; core type-checks).

- [ ] **Step 8: Commit**

```bash
git add libs/core/src/lib/models/document.model.ts apps/desktop/src-tauri/src/commands/documents.rs libs/i18n/src/lib/translations/translations.ts
git commit -m "feat(documents): add photo placement model + i18n keys"
```

---

### Task 2: Editor placement chips

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts` (signal ~line 163; load-fold ~line 552; save-fold ~line 855)
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html` (photo `@case ('photo')` block, ~line 667)
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.scss` (chip styles if not already shared)
- Test: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.spec.ts`

**Interfaces:**

- Consumes: `PhotoPlacement` from `@applye/core` (Task 1).
- Produces: `photoPlacement` signal (`WritableSignal<PhotoPlacement>`), default `'above_left'`; persisted into the photo section on save; a `setPhotoPlacement(p: PhotoPlacement)` handler bound by the chips.

- [ ] **Step 1: Write the failing component test**

In `cv-detail.component.spec.ts`, add:

```ts
it('defaults photoPlacement to above_left and updates on chip select', () => {
  // component under test already created in the surrounding describe as `component`
  expect(component.photoPlacement()).toBe('above_left');
  component.setPhotoPlacement('above_right');
  expect(component.photoPlacement()).toBe('above_right');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx nx test desktop --test-file=cv-detail.component.spec.ts`
Expected: FAIL — `photoPlacement is not a function`.

- [ ] **Step 3: Add the signal, load-fold, save-fold, and handler**

In `cv-detail.component.ts`:

Import the type (add to the existing `@applye/core` import group with `CvContent`, ~line 38):

```ts
  PhotoPlacement,
```

Add the signal next to `photoDataUri` (~line 163):

```ts
  readonly photoPlacement = signal<PhotoPlacement>('above_left');
```

Add a setter method (near other handlers):

```ts
  setPhotoPlacement(placement: PhotoPlacement): void {
    this.photoPlacement.set(placement);
  }
```

In the load block, right after `this.photoDataUri.set(...)` (~line 552):

```ts
this.photoPlacement.set(photo?.placement ?? 'above_left');
```

In the save `sections.map(...)` (~line 855), add a `photo` branch alongside the `personal_details` branch:

```ts
if (s.key === 'photo') {
  return { ...s, placement: this.photoPlacement() };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx nx test desktop --test-file=cv-detail.component.spec.ts`
Expected: PASS.

- [ ] **Step 5: Add the chips to the template**

In `cv-detail.component.html`, inside the `@case ('photo')` block, after the upload/thumbnail controls and guarded the same way (photo present + include on), add:

```html
@if (photoDataUri()) {
<div class="cvdetail__photo-placement">
  <span class="cvdetail__photo-placement-label"> {{ t()('documents.cv_photo_placement') }} </span>
  <div class="cvdetail__chip-row" role="group">
    @for (opt of photoPlacementOptions; track opt.value) {
    <button
      type="button"
      class="cvdetail__chip"
      [class.cvdetail__chip--active]="photoPlacement() === opt.value"
      (click)="setPhotoPlacement(opt.value)"
    >
      {{ t()(opt.labelKey) }}
    </button>
    }
  </div>
</div>
}
```

Add the options array to the component class:

```ts
  readonly photoPlacementOptions: { value: PhotoPlacement; labelKey: string }[] = [
    { value: 'above_left', labelKey: 'documents.cv_photo_placement_left' },
    { value: 'above_center', labelKey: 'documents.cv_photo_placement_center' },
    { value: 'above_right', labelKey: 'documents.cv_photo_placement_right' },
  ];
```

- [ ] **Step 6: Add chip SCSS if not already present**

If `.cvdetail__chip` / `.cvdetail__chip--active` / `.cvdetail__chip-row` are not already defined in `cv-detail.component.scss` (they are used by per-section style chips — reuse them), add a minimal style; otherwise reuse and only add:

```scss
.cvdetail__photo-placement {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
```

- [ ] **Step 7: Run desktop unit tests**

Run: `npx nx test desktop --test-file=cv-detail.component.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.scss
git commit -m "feat(documents): photo placement chips in cv editor"
```

---

### Task 3: Preview CSS float + header class binding

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts` (`atoms` computed, ~line 277 — thread placement into the header atom ctx)
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html` (`#headerTpl`, ~line 772)
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.scss` (`.cvpreview__header` / `.cvpreview__photo`)
- Test: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.spec.ts`

**Interfaces:**

- Consumes: `photoPlacement` signal (Task 2).
- Produces: header atom ctx gains `placement`; `#headerTpl` wraps content in `.cvpreview__header` with a modifier class `--left` / `--center` / `--right`.

- [ ] **Step 1: Write the failing test**

Add a pure mapping helper so the class logic is unit-testable. In `cv-detail.component.spec.ts`:

```ts
it('maps placement to a header modifier class', () => {
  expect(component.headerPlacementClass('above_left')).toBe('cvpreview__header--left');
  expect(component.headerPlacementClass('above_center')).toBe('cvpreview__header--center');
  expect(component.headerPlacementClass('above_right')).toBe('cvpreview__header--right');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx nx test desktop --test-file=cv-detail.component.spec.ts`
Expected: FAIL — `headerPlacementClass is not a function`.

- [ ] **Step 3: Implement the helper + thread placement into the atom**

In `cv-detail.component.ts` add:

```ts
  headerPlacementClass(placement: PhotoPlacement): string {
    const suffix =
      placement === 'above_center' ? 'center' : placement === 'above_right' ? 'right' : 'left';
    return `cvpreview__header--${suffix}`;
  }
```

In the `atoms` computed, in the `personal_details` case, add `placement` to the ctx:

```ts
        case 'personal_details':
          out.push({
            id: 'header',
            tpl: this.headerTpl(),
            ctx: { $implicit: section, photoUri, placement: this.photoPlacement() },
          });
          break;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx nx test desktop --test-file=cv-detail.component.spec.ts`
Expected: PASS.

- [ ] **Step 5: Wrap the header template with the placement class**

In `cv-detail.component.html`, change the `#headerTpl` opening so it reads `placement` from ctx and applies both the section style and the header class. Replace the outer `<div [ngStyle]="sectionCss('personal_details')">` with a nested wrapper:

```html
<ng-template #headerTpl let-section let-photoUri="photoUri" let-placement="placement">
  <div
    [class]="'cvpreview__header ' + headerPlacementClass(placement)"
    [ngStyle]="sectionCss('personal_details')"
  >
    @if (photoUri) {
    <div class="cvpreview__photo">
      <img [src]="photoUri" alt="" />
    </div>
    }
    <h2 class="cvpreview__name" [style.color]="effStyle('personal_details').colorHex">
      {{ section.fullName || t()('documents.cv_untitled') }}
    </h2>
    @if (section.title) {
    <p class="cvpreview__title">{{ section.title }}</p>
    }
    <p class="cvpreview__contact">
      {{ buildContactLine(section, { includeBirthdate: includeBirthdate(), includeMaritalStatus:
      includeMaritalStatus(), }) }}
    </p>
  </div>
</ng-template>
```

(The `placement` fallback: `let-placement="placement"` is `undefined` in the measure pass only if the ctx omits it — the atom always sets it, and `headerPlacementClass(undefined)` returns `--left`, matching the default.)

- [ ] **Step 6: Add the float SCSS**

In `cv-detail.component.scss`:

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
  }
}
```

- [ ] **Step 7: Run desktop unit tests + build**

Run: `npx nx test desktop --test-file=cv-detail.component.spec.ts && npx nx build desktop`
Expected: PASS; build clean (watch for Angular budget — do not exceed existing SCSS budget).

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.scss
git commit -m "feat(documents): float cv photo per placement in preview"
```

---

### Task 4: DOCX export — table for left/right, center alignment

**Files:**

- Modify: `apps/desktop/src-tauri/src/commands/tailoring.rs` (`RenderBlock` struct ~line 287; `resolve_blocks` ~line 405–436; `render_blocks_docx` ~line 483)
- Modify: `apps/desktop/src-tauri/src/commands/documents.rs` (export core ~line 998–1044 — extract `placement`, pass to `render_blocks_docx`)
- Test: inline `#[cfg(test)]` in `tailoring.rs`

**Interfaces:**

- Consumes: `PhotoPlacement` from `commands::documents` (Task 1); `RenderBlock` (existing).
- Produces: `RenderBlock` gains `pub section_key: Option<String>`; `render_blocks_docx(blocks, photo, placement, page)` — new 3rd param `placement: PhotoPlacement`.

- [ ] **Step 1: Carry `section_key` on `RenderBlock`**

In `tailoring.rs`, add to the `RenderBlock` struct (~line 287):

```rust
    pub section_key: Option<String>,
```

In `resolve_blocks`, where each `RenderBlock` is constructed from an input block, set `section_key: b.section_key.clone()`. Where the synthetic/injected block is built (the branch currently setting `section_key: None` — that was on `StyledBlock`; ensure the `RenderBlock` there also gets a sensible `section_key`, `None` is fine).

- [ ] **Step 2: Write the failing DOCX render test**

Add to the `#[cfg(test)]` block in `tailoring.rs`:

```rust
#[test]
fn docx_photo_center_and_side_placements_render() {
    use super::{render_blocks_docx, resolve_blocks, PageConfig, StyledBlock, BlockLevel};
    use crate::commands::documents::PhotoPlacement;

    let style = crate::commands::tailoring::CvStyle::default();
    let blocks = vec![
        StyledBlock { level: BlockLevel::H1, section_key: Some("personal_details".into()), text: "Jane Doe".into(), bold: true },
        StyledBlock { level: BlockLevel::Body, section_key: Some("personal_details".into()), text: "jane@example.com".into(), bold: false },
        StyledBlock { level: BlockLevel::H2, section_key: Some("summary".into()), text: "Summary".into(), bold: true },
    ];
    let resolved = resolve_blocks(&style, &blocks, false);
    let page = PageConfig::default();
    let photo: &[u8] = include_bytes!("../../test-assets/1x1.png"); // tiny valid PNG

    // All three placements produce a non-empty valid .docx byte stream.
    for p in [PhotoPlacement::AboveLeft, PhotoPlacement::AboveCenter, PhotoPlacement::AboveRight] {
        let out = render_blocks_docx(&resolved, Some(photo), p, &page).unwrap();
        assert!(out.len() > 100, "docx bytes empty for {p:?}");
    }
}
```

If `test-assets/1x1.png` does not exist, create it (a 1x1 PNG). Generate with:

```bash
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\x0d\x0a-\xb4\x00\x00\x00\x00IEND\xaeB`\x82' > apps/desktop/src-tauri/test-assets/1x1.png
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/desktop/src-tauri && cargo test docx_photo_center_and_side_placements_render`
Expected: FAIL — `render_blocks_docx` takes 3 args, not 4 (arity/type mismatch).

- [ ] **Step 4: Implement placement in `render_blocks_docx`**

Change the signature (~line 483):

```rust
pub(crate) fn render_blocks_docx(
    blocks: &[RenderBlock],
    photo: Option<&[u8]>,
    placement: crate::commands::documents::PhotoPlacement,
    page: &PageConfig,
) -> Result<Vec<u8>, String> {
```

Replace the current photo paragraph block (~line 502–509) with placement-aware rendering. For `AboveCenter`, a centered photo paragraph then all blocks below. For side placements, split the leading `personal_details` blocks into a table cell beside the photo, then render the rest below:

```rust
    use docx_rs::*;

    let pic = photo.map(|bytes| Pic::new(bytes).size(972_000, 1_296_000));

    // Helper: build a styled paragraph from a RenderBlock (same logic as the main loop).
    fn block_paragraph(b: &RenderBlock) -> docx_rs::Paragraph {
        use docx_rs::*;
        let (r, g, bl) = b.rgb;
        let text = if b.level == BlockLevel::Bullet { format!("•  {}", b.text) } else { b.text.clone() };
        let mut run = Run::new()
            .add_text(text)
            .size((b.size_pt * 2.0) as usize)
            .color(format!("{r:02X}{g:02X}{bl:02X}"))
            .fonts(RunFonts::new().ascii(&b.font_family).hi_ansi(&b.font_family));
        if b.bold { run = run.bold(); }
        let (before, after) = match b.level {
            BlockLevel::H1 | BlockLevel::H2 | BlockLevel::H3 => ((b.size_pt * 9.0).round() as u32, (b.size_pt * 3.0).round() as u32),
            BlockLevel::Bullet => (0, (b.size_pt * 2.0).round() as u32),
            BlockLevel::Body => (0, (b.size_pt * 3.5).round() as u32),
        };
        let mut para = Paragraph::new().add_run(run).line_spacing(LineSpacing::new().before(before).after(after));
        if b.level == BlockLevel::Bullet { para = para.indent(Some(360), None, None, None); }
        para
    }

    use crate::commands::documents::PhotoPlacement;
    let is_personal = |b: &RenderBlock| b.section_key.as_deref() == Some("personal_details");

    match (pic, placement) {
        (Some(pic), PhotoPlacement::AboveLeft) | (Some(pic), PhotoPlacement::AboveRight) => {
            // Leading personal_details blocks share a row with the photo.
            let split = blocks.iter().position(|b| !is_personal(b)).unwrap_or(blocks.len());
            let (head, rest) = blocks.split_at(split);
            let mut photo_cell = TableCell::new().add_paragraph(
                Paragraph::new().add_run(Run::new().add_image(pic)),
            );
            let mut text_cell = TableCell::new();
            if head.is_empty() {
                text_cell = text_cell.add_paragraph(Paragraph::new());
            } else {
                for b in head { text_cell = text_cell.add_paragraph(block_paragraph(b)); }
            }
            let cells = if placement == PhotoPlacement::AboveLeft {
                vec![photo_cell, text_cell]
            } else {
                std::mem::swap(&mut photo_cell, &mut text_cell);
                vec![text_cell, photo_cell]
            };
            let table = Table::new(vec![TableRow::new(cells)])
                .set_borders(TableBorders::new().clear_all());
            doc = doc.add_table(table);
            for b in rest { doc = doc.add_paragraph(block_paragraph(b)); }
            return finish_docx(doc);
        }
        (Some(pic), PhotoPlacement::AboveCenter) => {
            doc = doc.add_paragraph(
                Paragraph::new().align(AlignmentType::Center).add_run(Run::new().add_image(pic)),
            );
            for b in blocks { doc = doc.add_paragraph(block_paragraph(b)); }
            return finish_docx(doc);
        }
        (None, _) => {
            for b in blocks { doc = doc.add_paragraph(block_paragraph(b)); }
            return finish_docx(doc);
        }
    }
```

Extract the existing byte-serialization tail (the `let mut buf ...; doc.build().pack(...)` at the end of the current function) into a small helper `fn finish_docx(doc: Docx) -> Result<Vec<u8>, String>` and call it from each arm. Replace the old main `for b in blocks` loop body with `block_paragraph(b)` so the logic is DRY (single source).

> Note: `TableBorders::new().clear_all()` is the docx-rs 0.4 borderless call. If the installed docx-rs version names it differently, the compiler will point to the correct method — borderlessness is cosmetic and verified in the manual gate, not the unit test.

- [ ] **Step 5: Thread placement from the export core**

In `documents.rs`, in `cv_document_export_bytes_core`, extract placement next to `photo_bytes` (~line 998):

```rust
    let placement: PhotoPlacement = serde_json::from_str::<serde_json::Value>(&content_json)
        .ok()
        .and_then(|v| {
            v.get("sections")
                .and_then(|s| s.as_array())
                .and_then(|sections| {
                    sections
                        .iter()
                        .find(|s| s.get("key").and_then(|k| k.as_str()) == Some("photo"))
                        .and_then(|p| p.get("placement"))
                        .and_then(|p| serde_json::from_value(p.clone()).ok())
                })
        })
        .unwrap_or_default();
```

Update the DOCX call (~line 1032):

```rust
                crate::commands::tailoring::render_blocks_docx(
                    &resolved,
                    photo_bytes.as_deref(),
                    placement,
                    &page,
                )
```

For the PDF call (`render_blocks_pdf`, ~line 1038): leave its signature unchanged (dead path for library CVs — WYSIWYG print is the real PDF). No placement threading there.

- [ ] **Step 6: Run the Rust tests**

Run: `cd apps/desktop/src-tauri && cargo test`
Expected: PASS (new test + all existing tailoring tests, since `block_paragraph` reproduces prior output).

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/tailoring.rs apps/desktop/src-tauri/src/commands/documents.rs apps/desktop/src-tauri/test-assets/1x1.png
git commit -m "feat(documents): render cv photo placement in docx export"
```

---

### Task 5: Manual desktop gate + docs sync

**Files:**

- Modify: `docs/product/CURRENT_STATE.md` (Recently completed + current branch/focus)

- [ ] **Step 1: Build the desktop app**

Run: `npx nx build desktop` and start the Tauri desktop build (the project's usual `tauri dev`/build command).
Expected: clean build.

- [ ] **Step 2: Manual verification (record results in the PR)**

For a CV with a photo, for each of Left / Center / Right:

- Preview: photo floats to the correct side (Left → photo left, text right; Right → photo right, text left; Center → photo centered, text below). Page cards still paginate correctly; no atom overflow regression.
- Export PDF: opens the OS Save-as-PDF dialog, prints only the sheet, photo in the same position as the preview.
- Export DOCX: opens with the photo in the correct position (side-by-side for Left/Right via borderless table; centered for Center).
- Reload a legacy CV saved before this feature: photo still renders top-left (default), unchanged.
- Confirm no per-component print CSS was added (grep the component SCSS for `@media print`).

- [ ] **Step 3: Update CURRENT_STATE.md**

Add a "Recently completed" bullet for photo-placement slots (3 header slots, float-beside for left/right, centered for center; preview + WYSIWYG PDF + DOCX table; CV only; default `above_left`, back-compat) linking the spec and this plan. Set current branch/focus to `feat/photo-placement`.

- [ ] **Step 4: Commit**

```bash
git add docs/product/CURRENT_STATE.md
git commit -m "docs(documents): record photo placement slots in current state"
```

---

## Notes for the implementer

- The photo section has no atom of its own in the preview — it renders inside the `#headerTpl` (personal_details) atom, so pagination already accounts for the floated photo's height via the `clear: both` pseudo-element. Do not add a separate photo atom.
- `render_blocks_pdf` (Rust) is not exposed for library-CV export anymore; the user-facing PDF is the WYSIWYG browser print of the preview, which inherits the CSS float for free. Do not build a Rust-PDF table.
- Keep `block_paragraph` as the single source of DOCX paragraph styling to avoid drift between the table cell and the below-table blocks.
