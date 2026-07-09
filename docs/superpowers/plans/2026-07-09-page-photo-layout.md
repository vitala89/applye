# Page & Photo Layout Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users pick page size (A4/Letter) + margin preset (Narrow/Normal/Wide) for CV and cover letter, and pick a CV photo slot (above-left / above-center / left / right), see all of it in the live preview, and have DOCX + PDF export render it identically.

**Architecture:** Page + placement choices live in the existing `style_json` (`CvStyle`/`CoverLetterStyle`) and the photo section (`CvPhotoSection`). A pure resolver turns the preset enums into concrete mm (Rust for export, TS for preview) — one source of truth per side. The shared Rust block renderers (`render_blocks_docx`/`render_blocks_pdf`, from PR #64) gain a `PageConfig` and a `PhotoPlacement`, so both formats stay in lockstep.

**Tech Stack:** Angular (standalone components, signals), Rust Tauri commands (`docx-rs`, `printpdf`), `@applye/core` models, `@applye/i18n` translations. Nx monorepo.

## Global Constraints

- Portrait only. No landscape, no free-drag, no text-wrap around photo, no per-side numeric margins (spec non-goals).
- Page sizes (portrait, mm): A4 = 210 × 297; Letter = 215.9 × 279.4.
- Margin presets (all four sides equal, mm): `narrow` = 12.7, `normal` = 20.0, `wide` = 30.0.
- Photo slots apply to **CV only** (cover letter has no photo). Page settings apply to **both**.
- All new user-facing strings go through `@applye/i18n`, EN + DE, added in both language blocks of `libs/i18n/src/lib/translations/translations.ts`.
- Absent/legacy values resolve to defaults (`size:'a4'`, `margin:'normal'`, `placement:'above_left'`) — existing documents must keep working.
- Rust checks: `cargo test --lib` and `cargo clippy` (lint-staged runs clippy + rustfmt on commit). Angular: `npx nx build desktop --configuration=development`.
- Branch: `feat/page-photo-layout` (already created off `main` after PR #64 merged).

---

## Phase 1 — Page settings (size + margins), CV + cover letter

### Task 1: Model — `PageSettings` type + fields on both styles

**Files:**

- Modify: `libs/core/src/lib/models/document.model.ts` (near `CvStyle` :243 / `CoverLetterStyle` :210 / `CvPhotoSection` :32)

**Interfaces:**

- Produces: `PageSize`, `PageMarginPreset`, `PageSettings`, `PAGE_SETTINGS_DEFAULT`; `CvStyle.page?`, `CoverLetterStyle.page?`.

- [ ] **Step 1: Add the types** — insert above `CvStyle` (after `CvSectionStyle`, ~:238):

```ts
export type PageSize = 'a4' | 'letter';
export type PageMarginPreset = 'narrow' | 'normal' | 'wide';

/** Page geometry for CV / cover-letter export + preview. Portrait only.
 * Stored inside `style_json`; absent resolves to A4 / normal margins. */
export interface PageSettings {
  size: PageSize;
  margin: PageMarginPreset;
}

export const PAGE_SETTINGS_DEFAULT: PageSettings = { size: 'a4', margin: 'normal' };
```

- [ ] **Step 2: Add `page?` to both style interfaces**

In `CvStyle` (add as last field before `}` at :249):

```ts
  /** Page geometry (size + margin preset); absent → A4 / normal. */
  page?: PageSettings;
```

In `CoverLetterStyle` (add as last field before `}` at :220): same two lines.

- [ ] **Step 3: Include page in both defaults** — in `CV_STYLE_DEFAULT` (:251) and `COVER_LETTER_STYLE_DEFAULT` (:222) add:

```ts
  page: PAGE_SETTINGS_DEFAULT,
```

- [ ] **Step 4: Verify it compiles**

Run: `npx nx build core --configuration=development`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add libs/core/src/lib/models/document.model.ts
git commit -m "feat(core): add PageSettings to CvStyle and CoverLetterStyle"
```

---

### Task 2: TS preview resolver — `resolvePageSettings`

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-content.util.ts` (beside `effectiveSectionStyle` :507)

**Interfaces:**

- Consumes: `PageSettings`, `PAGE_SETTINGS_DEFAULT` from `@applye/core`.
- Produces: `ResolvedPage { widthMm; heightMm; marginMm; marginPct }`, `resolvePageSettings(page?: PageSettings): ResolvedPage`.

- [ ] **Step 1: Ensure imports** — confirm `PageSettings` is added to the existing `@applye/core` import block (top of file, ~:1-16). Add `PageSettings` to that import list.

- [ ] **Step 2: Add the resolver** — after `effectiveSectionStyle` (:518):

```ts
export interface ResolvedPage {
  widthMm: number;
  heightMm: number;
  marginMm: number;
  /** Margin as a % of page width — resolution-independent padding for preview. */
  marginPct: number;
}

/** Resolves a `PageSettings` preset to concrete mm. Single source of truth for
 * the preview; the Rust `resolve_page` mirrors these exact numbers for export. */
export function resolvePageSettings(page: PageSettings | undefined): ResolvedPage {
  const p = page ?? { size: 'a4', margin: 'normal' };
  const [widthMm, heightMm] = p.size === 'letter' ? [215.9, 279.4] : [210, 297];
  const marginMm = p.margin === 'narrow' ? 12.7 : p.margin === 'wide' ? 30 : 20;
  return { widthMm, heightMm, marginMm, marginPct: (marginMm / widthMm) * 100 };
}
```

- [ ] **Step 3: Verify compile**

Run: `npx nx build desktop --configuration=development`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-content.util.ts
git commit -m "feat(documents): add resolvePageSettings preview resolver"
```

---

### Task 3: Rust model + resolver — `PageSettings` struct + `resolve_page`

**Files:**

- Modify: `apps/desktop/src-tauri/src/commands/documents.rs` (near `CvStyle` struct)
- Modify: `apps/desktop/src-tauri/src/commands/tailoring.rs` (shared styling section)

**Interfaces:**

- Produces (documents.rs): `pub struct PageSettings { pub size: String, pub margin: String }` with serde defaults + `Default`; `CvStyle.page: PageSettings` (`#[serde(default)]`).
- Produces (tailoring.rs): `pub(crate) struct PageConfig { pub width_mm: f32, pub height_mm: f32, pub margin_mm: f32 }`; `pub(crate) fn resolve_page(p: &PageSettings) -> PageConfig`.

- [ ] **Step 1: Write failing test** — in tailoring.rs test module (`mod tests`), add:

```rust
#[test]
fn resolve_page_maps_presets_to_mm() {
    use crate::commands::documents::PageSettings;
    let a4_normal = resolve_page(&PageSettings { size: "a4".into(), margin: "normal".into() });
    assert_eq!((a4_normal.width_mm, a4_normal.height_mm, a4_normal.margin_mm), (210.0, 297.0, 20.0));

    let letter_narrow = resolve_page(&PageSettings { size: "letter".into(), margin: "narrow".into() });
    assert_eq!(letter_narrow.width_mm, 215.9);
    assert_eq!(letter_narrow.height_mm, 279.4);
    assert_eq!(letter_narrow.margin_mm, 12.7);

    // Unknown values fall back to A4 / normal.
    let junk = resolve_page(&PageSettings { size: "x".into(), margin: "y".into() });
    assert_eq!((junk.width_mm, junk.height_mm, junk.margin_mm), (210.0, 297.0, 20.0));
}
```

- [ ] **Step 2: Run — expect fail** (`PageSettings`, `resolve_page`, `PageConfig` undefined)

Run: `cargo test --lib resolve_page_maps_presets_to_mm --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: FAIL (cannot find `resolve_page` / `PageSettings`).

- [ ] **Step 3: Add `PageSettings` struct** — in documents.rs, right after the `CvSectionStyle` struct (~:672):

```rust
/// Page geometry (portrait) stored in `style_json`. String fields (not enums)
/// so an unknown/legacy value deserializes cleanly and falls back at resolve
/// time rather than erroring, matching the rest of `CvStyle`.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PageSettings {
    #[serde(default = "PageSettings::default_size")]
    pub size: String,
    #[serde(default = "PageSettings::default_margin")]
    pub margin: String,
}

impl PageSettings {
    fn default_size() -> String {
        "a4".to_string()
    }
    fn default_margin() -> String {
        "normal".to_string()
    }
}

impl Default for PageSettings {
    fn default() -> Self {
        Self {
            size: Self::default_size(),
            margin: Self::default_margin(),
        }
    }
}
```

- [ ] **Step 4: Add `page` field to `CvStyle`** — in the `CvStyle` struct (after `section_styles`, ~:633):

```rust
    #[serde(default)]
    pub page: PageSettings,
```

And in `impl Default for CvStyle` (~:658) add `page: Default::default(),`.

- [ ] **Step 5: Add `PageConfig` + `resolve_page`** — in tailoring.rs, in the shared styling section (after `hex_to_rgb`, before `effective_cv`):

```rust
use crate::commands::documents::PageSettings;

/// Concrete page geometry in millimetres, resolved from a `PageSettings` preset.
pub(crate) struct PageConfig {
    pub width_mm: f32,
    pub height_mm: f32,
    pub margin_mm: f32,
}

/// Mirrors the TS `resolvePageSettings` exactly. Unknown values fall back to
/// A4 / normal so a malformed `style_json` never breaks export.
pub(crate) fn resolve_page(p: &PageSettings) -> PageConfig {
    let (width_mm, height_mm) = match p.size.as_str() {
        "letter" => (215.9, 279.4),
        _ => (210.0, 297.0),
    };
    let margin_mm = match p.margin.as_str() {
        "narrow" => 12.7,
        "wide" => 30.0,
        _ => 20.0,
    };
    PageConfig {
        width_mm,
        height_mm,
        margin_mm,
    }
}
```

- [ ] **Step 6: Run — expect pass**

Run: `cargo test --lib resolve_page_maps_presets_to_mm --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/documents.rs apps/desktop/src-tauri/src/commands/tailoring.rs
git commit -m "feat(documents): add PageSettings model + resolve_page"
```

---

### Task 4: Thread `PageConfig` into the DOCX + PDF renderers

**Files:**

- Modify: `apps/desktop/src-tauri/src/commands/tailoring.rs` (`render_blocks_docx`, `render_blocks_pdf`, `md_to_docx_bytes`, `md_to_pdf_bytes`)
- Modify: `apps/desktop/src-tauri/src/commands/documents.rs` (both export cores)

**Interfaces:**

- Consumes: `PageConfig`, `resolve_page`.
- Produces (changed signatures):
  `render_blocks_docx(blocks: &[RenderBlock], photo: Option<&[u8]>, page: &PageConfig) -> Result<Vec<u8>, String>`
  `render_blocks_pdf(blocks: &[RenderBlock], photo: Option<&[u8]>, page: &PageConfig) -> Result<Vec<u8>, String>`

- [ ] **Step 1: Update PDF renderer to use `page`** — in `render_blocks_pdf`, add `page: &PageConfig` param. Replace the hardcoded geometry:
  - `PdfDocument::new("CV", Mm(page.width_mm), Mm(page.height_mm), "Layer 1")`
  - `let margin = Mm(page.margin_mm);` `let margin_mm = page.margin_mm;` `let indent_mm = page.margin_mm + 5.0;` `let right_margin_mm = page.margin_mm;` `let page_w_mm = page.width_mm;`
  - `let top_y = page.height_mm - page.margin_mm;`
  - every `doc.add_page(Mm(page_w_mm), Mm(page.height_mm), "Layer 1")` uses `page.height_mm`.
  - The page-break threshold `if y < 18.0` becomes `if y < page.margin_mm`.
  - Photo box top: `translate_y: Some(Mm(top_y - box_h))` (already relative to `top_y`).

- [ ] **Step 2: Update DOCX renderer to set page size/margins** — in `render_blocks_docx`, add `page: &PageConfig` param. After `let mut doc = Docx::new();` add:

```rust
    // Page size + margins (twips: 1 mm ≈ 56.6929). docx-rs takes u32 twips.
    let tw = |mm: f32| (mm * 56.6929) as u32;
    doc = doc
        .page_size(tw(page.width_mm), tw(page.height_mm))
        .page_margin(
            docx_rs::PageMargin::new()
                .top(tw(page.margin_mm) as i32)
                .bottom(tw(page.margin_mm) as i32)
                .left(tw(page.margin_mm) as i32)
                .right(tw(page.margin_mm) as i32),
        );
```

(Confirm `Docx::page_size(u32,u32)` and `PageMargin` builder against docx-rs 0.4 during the step; if `page_size` differs, use `.page_size(w, h)` per the installed version's signature.)

- [ ] **Step 3: Update the two wrappers** — `md_to_docx_bytes` / `md_to_pdf_bytes` resolve a default page and pass it:

```rust
    let page = resolve_page(&crate::commands::documents::PageSettings::default());
    render_blocks_docx(&resolved, photo, &page)   // and render_blocks_pdf(..., &page)
```

- [ ] **Step 4: Update both export cores** — in documents.rs `cv_document_export_bytes_core` and `cover_letter_document_export_bytes_core`, before the match compute:

```rust
    let page = crate::commands::tailoring::resolve_page(&style.page);
```

and pass `&page` to `render_blocks_docx` / `render_blocks_pdf` calls.

- [ ] **Step 5: Update the existing export test** — `cv_document_export_writes_docx_and_pdf_bytes` needs no change (goes through export core). Run the full suite:

Run: `cargo test --lib --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: all pass (existing + `resolve_page` test).

- [ ] **Step 6: Add a page-dims smoke test** — in tailoring.rs tests:

```rust
#[test]
fn render_blocks_pdf_letter_produces_bytes() {
    let style = crate::commands::documents::CvStyle::default();
    let blocks = resolve_blocks(&style, &[StyledBlock {
        level: BlockLevel::Body, section_key: None, text: "hi".into(), bold: false,
    }], false);
    let page = resolve_page(&crate::commands::documents::PageSettings {
        size: "letter".into(), margin: "wide".into(),
    });
    let bytes = render_blocks_pdf(&blocks, None, &page).expect("pdf");
    assert!(!bytes.is_empty());
}
```

Run: `cargo test --lib render_blocks_pdf_letter_produces_bytes --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/tailoring.rs apps/desktop/src-tauri/src/commands/documents.rs
git commit -m "feat(documents): honor page size + margins in DOCX/PDF export"
```

---

### Task 5: CV editor — page controls + preview reflection

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts`
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html`
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.scss`
- Modify: `libs/i18n/src/lib/translations/translations.ts`

**Interfaces:**

- Consumes: `resolvePageSettings`, `updateStyle(patch)`, `style` signal.
- Produces: `setPageSize(size)`, `setPageMargin(margin)`, `pageStyle` computed for preview.

- [ ] **Step 1: Add i18n keys** — in translations.ts, EN block near `cv_style_customized` (~:722) add:

```ts
      cv_style_page_size: 'Page size',
      cv_style_page_a4: 'A4',
      cv_style_page_letter: 'Letter',
      cv_style_margin: 'Margins',
      cv_style_margin_narrow: 'Narrow',
      cv_style_margin_normal: 'Normal',
      cv_style_margin_wide: 'Wide',
```

DE block near :1678 add:

```ts
      cv_style_page_size: 'Seitengröße',
      cv_style_page_a4: 'A4',
      cv_style_page_letter: 'Letter',
      cv_style_margin: 'Ränder',
      cv_style_margin_narrow: 'Schmal',
      cv_style_margin_normal: 'Normal',
      cv_style_margin_wide: 'Breit',
```

- [ ] **Step 2: Add setters + preview computed** — in cv-detail.component.ts, add `resolvePageSettings` to the `cv-content.util` import, then after `updateStyle` (:181):

```ts
  setPageSize(size: 'a4' | 'letter'): void {
    this.updateStyle({ page: { ...(this.style().page ?? { size: 'a4', margin: 'normal' }), size } });
  }
  setPageMargin(margin: 'narrow' | 'normal' | 'wide'): void {
    this.updateStyle({ page: { ...(this.style().page ?? { size: 'a4', margin: 'normal' }), margin } });
  }

  /** Preview page geometry — aspect ratio + margin padding from the resolver. */
  readonly pageStyle = computed(() => {
    const r = resolvePageSettings(this.style().page);
    return { 'aspect-ratio': `${r.widthMm} / ${r.heightMm}`, padding: `${r.marginPct}%` };
  });
```

(Confirm `computed` is imported from `@angular/core` in this file; it is used elsewhere per `hasAnyCustomStyle`.)

- [ ] **Step 3: Add page controls to the style panel** — in cv-detail.component.html, inside `.cvdetail__style` (after the colour field, ~:191), mirroring the existing `.cvdetail__style-field` + `<select>` pattern (:149-156):

```html
<label class="cvdetail__style-field">
  <span>{{ t()('documents.cv_style_page_size') }}</span>
  <select [value]="style().page?.size ?? 'a4'" (change)="setPageSize($any($event.target).value)">
    <option value="a4">{{ t()('documents.cv_style_page_a4') }}</option>
    <option value="letter">{{ t()('documents.cv_style_page_letter') }}</option>
  </select>
</label>
<label class="cvdetail__style-field">
  <span>{{ t()('documents.cv_style_margin') }}</span>
  <select
    [value]="style().page?.margin ?? 'normal'"
    (change)="setPageMargin($any($event.target).value)"
  >
    <option value="narrow">{{ t()('documents.cv_style_margin_narrow') }}</option>
    <option value="normal">{{ t()('documents.cv_style_margin_normal') }}</option>
    <option value="wide">{{ t()('documents.cv_style_margin_wide') }}</option>
  </select>
</label>
```

(Use the exact translation-key accessor the file already uses — match `t()('documents.cv_style_font')` form at :150.)

- [ ] **Step 4: Apply page geometry to the preview** — bind `[ngStyle]="pageStyle()"` on the preview page wrapper element (the container that wraps the `@for` of preview sections in preview mode). Confirm `NgStyle` is imported (or use `[style.aspect-ratio]` + `[style.padding]` individual bindings if `ngStyle` isn't imported):

```html
[style.aspect-ratio]="pageStyle()['aspect-ratio']" [style.padding]="pageStyle()['padding']"
```

- [ ] **Step 5: Build + preview-verify**

Run: `npx nx build desktop --configuration=development`
Then start the dev server (preview_start) and confirm: switching A4↔Letter changes preview proportions; Narrow/Normal/Wide changes the white margin. Screenshot for the user.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-detail/ libs/i18n/src/lib/translations/translations.ts
git commit -m "feat(documents): CV editor page size + margin controls with preview"
```

---

### Task 6: Cover-letter editor — page controls + preview reflection

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cover-letter-detail/cover-letter-detail.component.ts`
- Modify: `apps/desktop/src/app/pages/documents/cover-letter-detail/cover-letter-detail.component.html`
- Modify: `libs/i18n/src/lib/translations/translations.ts` (reuse the `cv_style_page_*` / `cv_style_margin*` keys from Task 5 — do not duplicate)

**Interfaces:**

- Consumes: `resolvePageSettings`, `updateStyle` (:236), `style` signal (`CoverLetterStyle`).
- Produces: `setPageSize`, `setPageMargin`, `pageStyle` (same shapes as Task 5).

- [ ] **Step 1: Add setters + computed** — in cover-letter-detail.component.ts, import `resolvePageSettings`, add the same `setPageSize` / `setPageMargin` / `pageStyle` as Task 5 Step 2 (identical bodies; `style()` is `CoverLetterStyle` which now also has `page?`).

- [ ] **Step 2: Add page controls** — in cover-letter-detail.component.html `.coverdetail__style` panel (after the colour field, ~:214), same two `<label>` blocks as Task 5 Step 3 (reuse the `documents.cv_style_page_*` keys).

- [ ] **Step 3: Apply to preview** — bind aspect-ratio + padding on the cover-letter preview page wrapper, same as Task 5 Step 4.

- [ ] **Step 4: Build + preview-verify**

Run: `npx nx build desktop --configuration=development`
Preview: cover-letter A4↔Letter + margins reflect. Screenshot.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cover-letter-detail/
git commit -m "feat(documents): cover-letter page size + margin controls with preview"
```

---

## Phase 2 — CV photo slots

### Task 7: Model — `PhotoPlacement` on `CvPhotoSection`

**Files:**

- Modify: `libs/core/src/lib/models/document.model.ts` (`CvPhotoSection` :32)

**Interfaces:**

- Produces: `PhotoPlacement`, `PHOTO_PLACEMENT_DEFAULT`, `CvPhotoSection.placement?`.

- [ ] **Step 1: Add type + field**

Above `CvPhotoSection` (or near the section types):

```ts
export type PhotoPlacement = 'above_left' | 'above_center' | 'left' | 'right';
export const PHOTO_PLACEMENT_DEFAULT: PhotoPlacement = 'above_left';
```

In `CvPhotoSection` interface add:

```ts
  /** Where the photo sits relative to the name/contact block. Default above-left. */
  placement?: PhotoPlacement;
```

- [ ] **Step 2: Build core** — `npx nx build core --configuration=development` → succeeds.

- [ ] **Step 3: Commit**

```bash
git add libs/core/src/lib/models/document.model.ts
git commit -m "feat(core): add PhotoPlacement to CvPhotoSection"
```

---

### Task 8: Rust — parse placement + pass to renderers

**Files:**

- Modify: `apps/desktop/src-tauri/src/commands/tailoring.rs` (`PhotoPlacement` enum, renderer signatures)
- Modify: `apps/desktop/src-tauri/src/commands/documents.rs` (CV export core reads `placement`)

**Interfaces:**

- Produces: `pub(crate) enum PhotoPlacement { AboveLeft, AboveCenter, Left, Right }`, `pub(crate) fn parse_placement(s: &str) -> PhotoPlacement`; renderer signatures gain `placement: PhotoPlacement`.

- [ ] **Step 1: Failing test** — tailoring.rs tests:

```rust
#[test]
fn parse_placement_falls_back_to_above_left() {
    assert_eq!(parse_placement("right"), PhotoPlacement::Right);
    assert_eq!(parse_placement("above_center"), PhotoPlacement::AboveCenter);
    assert_eq!(parse_placement("garbage"), PhotoPlacement::AboveLeft);
}
```

- [ ] **Step 2: Run — expect fail**

Run: `cargo test --lib parse_placement_falls_back --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: FAIL.

- [ ] **Step 3: Add enum + parser** — tailoring.rs shared section:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PhotoPlacement {
    AboveLeft,
    AboveCenter,
    Left,
    Right,
}

pub(crate) fn parse_placement(s: &str) -> PhotoPlacement {
    match s {
        "above_center" => PhotoPlacement::AboveCenter,
        "left" => PhotoPlacement::Left,
        "right" => PhotoPlacement::Right,
        _ => PhotoPlacement::AboveLeft,
    }
}
```

- [ ] **Step 4: Add `placement` param to both renderers** — signatures become
      `render_blocks_docx(blocks, photo, page, placement)` and `render_blocks_pdf(blocks, photo, page, placement)`. For now keep behavior identical for all variants (still top box) so the build stays green; Task 9/10 implement the branches. Update the two wrappers to pass `PhotoPlacement::AboveLeft`.

- [ ] **Step 5: CV export core reads placement** — in `cv_document_export_bytes_core`, the photo section JSON is already located for `photo_bytes`. Extract placement alongside:

```rust
    let placement = crate::commands::tailoring::parse_placement(
        serde_json::from_str::<serde_json::Value>(&content_json)
            .ok()
            .as_ref()
            .and_then(|v| v.get("sections").and_then(|s| s.as_array()))
            .and_then(|secs| secs.iter().find(|s| s.get("key").and_then(|k| k.as_str()) == Some("photo")))
            .and_then(|p| p.get("placement").and_then(|x| x.as_str()))
            .unwrap_or("above_left"),
    );
```

Pass `placement` to the CV `render_blocks_docx`/`render_blocks_pdf` calls. Cover-letter core passes `PhotoPlacement::AboveLeft`.

- [ ] **Step 6: Run — expect pass + full suite green**

Run: `cargo test --lib --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/
git commit -m "feat(documents): parse photo placement + thread to renderers"
```

---

### Task 9: PDF — render the 4 photo slots

**Files:**

- Modify: `apps/desktop/src-tauri/src/commands/tailoring.rs` (`render_blocks_pdf` photo block + header)

**Interfaces:**

- Consumes: `PhotoPlacement`, `PageConfig`. The `personal_details` blocks are the header text (name = first block, contact = second).

- [ ] **Step 1: Extract the personal-details header blocks** — before the main loop, split `blocks` into the header (leading blocks whose `section_key == Some("personal_details")`) and the rest. Render the header via a placement-aware helper; render the rest with the existing loop.

- [ ] **Step 2: Implement placement in the photo block** — replace the current fixed top-left box:
  - `AboveLeft`: photo at `translate_x = margin`, text starts below (current behavior).
  - `AboveCenter`: `translate_x = (page.width_mm - box_w) / 2.0`.
  - `Left`: photo at left column (`x = margin`), header text column starts at `margin + box_w + gap`, both at the same top; after the header, `y` drops below the taller of the two.
  - `Right`: header text column at `x = margin`, photo at `translate_x = page.width_mm - margin - box_w`; text wrap width for the header column = `page.width_mm - margin - box_w - gap - margin`.

Show the `Left`/`Right` two-column math with `box_w = 27.0`, `box_h = 36.0`, `gap = 6.0`. Header text uses the same `use_text` + wrap helpers already in the function, just with a narrower `avail` and a shifted `x`.

- [ ] **Step 3: Smoke test each slot** — tailoring.rs tests:

```rust
#[test]
fn render_blocks_pdf_all_photo_slots_produce_bytes() {
    let style = crate::commands::documents::CvStyle::default();
    let blocks = resolve_blocks(&style, &[
        StyledBlock { level: BlockLevel::H1, section_key: Some("personal_details".into()), text: "Jane Doe".into(), bold: false },
        StyledBlock { level: BlockLevel::Body, section_key: Some("personal_details".into()), text: "jane@x.com".into(), bold: false },
        StyledBlock { level: BlockLevel::H2, section_key: Some("summary".into()), text: "Summary".into(), bold: false },
    ], false);
    let page = resolve_page(&crate::commands::documents::PageSettings::default());
    let photo = include_bytes!("../../tests/fixtures/tiny.png"); // 1x1 png fixture
    for pl in [PhotoPlacement::AboveLeft, PhotoPlacement::AboveCenter, PhotoPlacement::Left, PhotoPlacement::Right] {
        let bytes = render_blocks_pdf(&blocks, Some(photo), &page, pl).expect("pdf");
        assert!(!bytes.is_empty());
    }
}
```

(If no fixture exists, create `apps/desktop/src-tauri/tests/fixtures/tiny.png` — a 1×1 PNG — as part of this step.)

- [ ] **Step 4: Run — expect pass**

Run: `cargo test --lib render_blocks_pdf_all_photo_slots --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/tailoring.rs apps/desktop/src-tauri/tests/fixtures/
git commit -m "feat(documents): render 4 CV photo slots in PDF export"
```

---

### Task 10: DOCX — render the 4 photo slots

**Files:**

- Modify: `apps/desktop/src-tauri/src/commands/tailoring.rs` (`render_blocks_docx` photo/header)

**Interfaces:**

- Consumes: `PhotoPlacement`. Uses docx-rs `Table`/`TableRow`/`TableCell` with no borders for `Left`/`Right`.

- [ ] **Step 1: Implement placement**
  - `AboveLeft`: current first-paragraph image (unchanged).
  - `AboveCenter`: image paragraph with `.align(AlignmentType::Center)`.
  - `Left`: a borderless 1×2 `Table` — cell 0 = image paragraph, cell 1 = the `personal_details` header paragraphs; then continue the remaining blocks below.
  - `Right`: same table, cell 0 = header paragraphs, cell 1 = image.

Show the docx-rs table construction (borderless via `.set_borders` / `TableBorders::new().clear_all()` per the installed version) and moving the `personal_details` header blocks into the cell instead of the main loop.

- [ ] **Step 2: Smoke test** — tailoring.rs tests, mirror Task 9 Step 3 but call `render_blocks_docx(&blocks, Some(photo), &page, pl)` for all four slots; assert non-empty.

- [ ] **Step 3: Run — expect pass + full suite**

Run: `cargo test --lib --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/tailoring.rs
git commit -m "feat(documents): render 4 CV photo slots in DOCX export"
```

---

### Task 11: CV editor — placement chips + preview slots

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts`
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html`
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.scss`
- Modify: `libs/i18n/src/lib/translations/translations.ts`

**Interfaces:**

- Consumes: `includePhoto` (:138), `photoDataUri` (:139), photo section persistence in `save()` (:628-630).
- Produces: `photoPlacement` signal (`PhotoPlacement`), `setPhotoPlacement(p)`.

- [ ] **Step 1: i18n keys** — EN block add:

```ts
      cv_photo_placement: 'Photo position',
      cv_photo_placement_above_left: 'Above (left)',
      cv_photo_placement_above_center: 'Above (centered)',
      cv_photo_placement_left: 'Left of name',
      cv_photo_placement_right: 'Right of name',
```

DE block add:

```ts
      cv_photo_placement: 'Fotoposition',
      cv_photo_placement_above_left: 'Oben (links)',
      cv_photo_placement_above_center: 'Oben (zentriert)',
      cv_photo_placement_left: 'Links vom Namen',
      cv_photo_placement_right: 'Rechts vom Namen',
```

- [ ] **Step 2: Signal + setter + load/save wiring** — in cv-detail.component.ts:
  - add `readonly photoPlacement = signal<PhotoPlacement>('above_left');`
  - load it where the photo section is read (:324-328): `this.photoPlacement.set(photo?.placement ?? 'above_left');`
  - persist in `save()` where the photo section is written (:628-630): include `placement: this.photoPlacement()` on the photo section object.
  - setter:

```ts
  setPhotoPlacement(p: PhotoPlacement): void {
    this.photoPlacement.set(p);
  }
```

(import `PhotoPlacement` from `@applye/core`.)

- [ ] **Step 3: Placement chips** — in cv-detail.component.html, inside the photo card (near the include-photo toggle-chip :83-110), gated on `@if (includePhoto())`, render 4 chips mirroring the `.toggle-chip` pattern:

```html
<div class="cvdetail__photo-slots">
  @for (slot of ['above_left','above_center','left','right']; track slot) {
  <button
    class="toggle-chip"
    [class.toggle-chip--active]="photoPlacement() === slot"
    (click)="setPhotoPlacement($any(slot))"
  >
    {{ t()('documents.cv_photo_placement_' + slot) }}
  </button>
  }
</div>
```

- [ ] **Step 4: Preview slots** — in the preview `personal_details` (:684-695) + `photo` (:823-828) render, position the photo per `photoPlacement()`:
  - `above_left` / `above_center`: photo above the name block, aligned start/center.
  - `left` / `right`: wrap the photo + name/contact in a flex row (`flex-direction: row`, photo order swapped for `right`).
  - Make the photo container clickable to cycle/select: clicking a slot region calls `setPhotoPlacement(...)`. Simplest: each of the 4 chips already sets it; for "click-to-place in preview", add a small overlay control on the preview photo that opens the same 4 options, or make the photo draggable-free by clicking to advance. **Chosen:** clicking the preview photo cycles to the next slot (`above_left → above_center → left → right → above_left`) with a tooltip; the chips remain the explicit control. Implement `cyclePhotoPlacement()`.

```ts
  cyclePhotoPlacement(): void {
    const order: PhotoPlacement[] = ['above_left', 'above_center', 'left', 'right'];
    const i = order.indexOf(this.photoPlacement());
    this.photoPlacement.set(order[(i + 1) % order.length]);
  }
```

- [ ] **Step 5: Build + preview-verify**

Run: `npx nx build desktop --configuration=development`
Preview: chips switch photo position in preview; clicking the preview photo cycles slots; Save persists (reload keeps the slot). Screenshot for the user.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-detail/ libs/i18n/src/lib/translations/translations.ts
git commit -m "feat(documents): CV photo placement chips + preview slots"
```

---

### Task 12: Docs + changelog

**Files:**

- Modify: `CHANGELOG.md` (Unreleased → Added)
- Modify: `docs/product/CURRENT_STATE.md`

- [ ] **Step 1: Changelog entry** — under `## [Unreleased]` → `### Added`:

```md
- **Page & photo layout settings.** CV and cover-letter editors gained page-size (A4 / Letter) and margin (Narrow / Normal / Wide) controls, reflected live in the preview and applied identically to DOCX and PDF export. CV adds a photo-position selector (above-left / above-center / left of name / right of name), also live in the preview; the two-column slots render as a borderless table in DOCX and a two-column header in PDF.
```

- [ ] **Step 2: CURRENT_STATE note** — append a one-line status under the CV/cover-letter feature entry noting page + photo-placement shipped on `feat/page-photo-layout`.

- [ ] **Step 3: Commit + push + PR**

```bash
git add CHANGELOG.md docs/product/CURRENT_STATE.md
git commit -m "docs: record page & photo layout settings"
git push -u origin feat/page-photo-layout
gh pr create --base main --title "feat(documents): page size/margins + CV photo placement" --body "Implements docs/superpowers/specs/2026-07-09-page-photo-layout-design.md"
```

---

## Self-Review Notes

- **Spec coverage:** page size + margins (Tasks 1-6), CV photo slots (Tasks 7-11), preview reflection (5,6,11), identical DOCX/PDF (4,9,10), defaults/back-compat (all model tasks), i18n EN+DE (5,11). Covered.
- **Interaction "reposition in preview":** realized as chips + click-to-cycle on the preview photo (Task 11 Step 4) — discrete, deterministic, per the approved design (no free drag).
- **Signature evolution:** renderers gain `page` in Task 4 and `placement` in Task 8; wrappers and both export cores updated in the same tasks — no dangling callers.
- **Verify docx-rs 0.4 APIs during execution:** `Docx::page_size` / `PageMargin` (Task 4) and borderless `Table` (Task 10) — signatures confirmed against the installed version at implementation time; the steps note the fallback.
