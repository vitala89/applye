# WYSIWYG Preview → Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CV / cover-letter preview a real paginated A4/Letter sheet with numeric 4-side mm margins, and export PDF by printing that exact sheet (WYSIWYG) via the Tauri webview.

**Architecture:** One source of truth — `resolvePageSettings` — feeds concrete geometry (mm + clamped 4-side margins) to (a) the on-screen sheet CSS, (b) a dynamically injected `@page` print rule consumed by `webview.print()`, and (c) the structural DOCX renderer. The margin model migrates from a preset enum to a 4-side mm object with read-time back-compat. Pagination on screen is drawn by a pure-CSS repeating gradient; measurement (for page-count label and overflow warnings) uses a `ResizeObserver`, never DOM splitting.

**Tech Stack:** Angular (standalone components, signals), TypeScript, Rust (Tauri 2 commands, `docx-rs`, `serde`), Jest (TS unit), `cargo test` (Rust unit).

## Global Constraints

- **Nx monorepo.** Shared types live in `libs/core`; user-facing strings in `libs/i18n`; never hardcode UI copy.
- **Offline-first.** No network in any of this work.
- **Back-compat is mandatory.** Existing `style_json` holds `margin: 'narrow'|'normal'|'wide'` (string) and must keep resolving correctly forever; never error on legacy data.
- **TS ↔ Rust parity.** `resolvePageSettings` (TS) and `resolve_page` (Rust) must produce identical mm numbers for identical input. A4 = 210×297 mm, Letter = 215.9×279.4 mm. Legacy presets: narrow=12.7, normal=20, wide=30 mm.
- **Margin bounds:** each side clamped to `[0, 50]` mm in the resolver.
- **Commit convention:** Conventional Commits, lowercase subject (commitlint rejects capitalized/sentence-case subjects). Husky + lint-staged run prettier on commit.
- **Branch:** `feat/wysiwyg-preview-export` (already created).

**Scope of this plan = first ship: Spike + Migration + Phase A + Phase B.** Phase C (DOCX 4-side alignment) and Phase D (photo placement) are separate follow-up plans, per the spec.

---

### Task 0: Research spike — prove `webview.print()` → A4 PDF (throwaway)

**Goal:** Before building Phase B, prove the Tauri webview can print a styled HTML sheet to a correct A4 PDF whose page breaks honor `@page`. This is a throwaway; do NOT commit production code from it. Capture findings in the plan's notes.

**Files:**

- Temp only (a scratch route or a temporary button in `cv-detail`). Revert before finishing.

- [ ] **Step 1: Add the print permission**

Edit `apps/desktop/src-tauri/capabilities/default.json`, add `"core:webview:allow-print"` to the `permissions` array.

- [ ] **Step 2: Add a throwaway print button in `cv-detail.component.ts`**

```ts
// TEMP spike — remove after
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

async spikePrint(): Promise<void> {
  const style = document.createElement('style');
  style.textContent = '@page { size: 210mm 297mm; margin: 20mm 20mm 20mm 20mm; }';
  document.head.appendChild(style);
  await getCurrentWebviewWindow().print();
}
```

Wire a temporary `<button (click)="spikePrint()">SPIKE PRINT</button>` into the preview.

- [ ] **Step 3: Run the app and print**

Run: `npx nx run desktop:tauri dev` (or the repo's documented desktop dev command). Open a CV, enter preview, click SPIKE PRINT.
Expected: OS print dialog opens; "Save as PDF" produces a PDF sized A4 with content inside a 20mm margin. Verify page breaks land where `@page` implies for multi-page content.

- [ ] **Step 4: Record findings**

Confirm and note in this file under "Spike Findings": the exact import + call that worked (`getCurrentWebviewWindow().print()` vs alternative), the exact permission string, and whether `@page size`/`margin` were honored by the platform webview (WKWebView on macOS).

- [ ] **Step 5: Revert throwaway code**

Remove the temp button and `spikePrint`. **Keep** the `core:webview:allow-print` permission (Phase B needs it) — that is the one artifact of the spike that stays. Do not commit yet; Phase B commits the permission with its real usage. `git checkout` the component; leave `default.json` modified.

> **Spike Findings:** _(fill in during Step 4)_

---

### Task 1: Migrate the TS margin model to 4-side mm

**Files:**

- Modify: `libs/core/src/lib/models/document.model.ts:206-216` (add `PageMargins`, change `PageSettings.margin`, update default)
- Test: `libs/core/src/lib/models/document.model.spec.ts` (create if absent; else append)

**Interfaces:**

- Produces: `interface PageMargins { top: number; right: number; bottom: number; left: number }` (mm); `PageSettings.margin: PageMargins`; `PAGE_SETTINGS_DEFAULT = { size: 'a4', margin: { top: 20, right: 20, bottom: 20, left: 20 } }`. `PageMarginPreset` type is **retained** (legacy read-path uses it as an accepted input shape) but no longer the stored type.

- [ ] **Step 1: Write the failing test**

```ts
// document.model.spec.ts
import { PAGE_SETTINGS_DEFAULT } from './document.model';

describe('PAGE_SETTINGS_DEFAULT', () => {
  it('defaults to A4 with 20mm on all four sides', () => {
    expect(PAGE_SETTINGS_DEFAULT).toEqual({
      size: 'a4',
      margin: { top: 20, right: 20, bottom: 20, left: 20 },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test core --testFile=document.model.spec.ts`
Expected: FAIL — default still `{ size: 'a4', margin: 'normal' }`.

- [ ] **Step 3: Edit the model**

Replace lines 206-216 region:

```ts
export type PageSize = 'a4' | 'letter';
export type PageMarginPreset = 'narrow' | 'normal' | 'wide';

/** Four-side page margins in millimetres. Each side clamped to [0,50] at
 * resolve time (see resolvePageSettings). */
export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Page geometry for CV / cover-letter export + preview. Portrait only.
 * Stored inside `style_json`; absent resolves to A4 / 20mm margins.
 * Legacy `style_json` may hold `margin` as a `PageMarginPreset` string —
 * the read path (resolvePageSettings) maps it to mm. */
export interface PageSettings {
  size: PageSize;
  margin: PageMargins;
}

export const PAGE_SETTINGS_DEFAULT: PageSettings = {
  size: 'a4',
  margin: { top: 20, right: 20, bottom: 20, left: 20 },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test core --testFile=document.model.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/core/src/lib/models/document.model.ts libs/core/src/lib/models/document.model.spec.ts
git commit -m "feat(documents): migrate PageSettings margin to 4-side mm model"
```

---

### Task 2: Update `resolvePageSettings` — back-compat + 4-side clamp

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-content.util.ts:521-536` (`ResolvedPage`, `resolvePageSettings`)
- Test: `apps/desktop/src/app/pages/documents/cv-content.util.spec.ts` (append; file exists for this util)

**Interfaces:**

- Consumes: `PageSettings`, `PageMargins`, `PageMarginPreset` from Task 1.
- Produces:

```ts
interface ResolvedPage {
  widthMm: number;
  heightMm: number;
  margin: { top: number; right: number; bottom: number; left: number }; // mm, clamped [0,50]
  marginPct: { top: number; right: number; bottom: number; left: number }; // top/bottom %of height, left/right %of width
}
function resolvePageSettings(page: PageSettings | undefined): ResolvedPage;
```

`resolvePageSettings` accepts legacy input where `page.margin` is a `PageMarginPreset` string OR absent (runtime-tolerant, since stored JSON predates the type change).

- [ ] **Step 1: Write the failing tests**

```ts
// cv-content.util.spec.ts
import { resolvePageSettings } from './cv-content.util';

describe('resolvePageSettings', () => {
  it('resolves A4 with 4-side mm margins', () => {
    const r = resolvePageSettings({
      size: 'a4',
      margin: { top: 10, right: 15, bottom: 20, left: 25 },
    } as any);
    expect(r.widthMm).toBe(210);
    expect(r.heightMm).toBe(297);
    expect(r.margin).toEqual({ top: 10, right: 15, bottom: 20, left: 25 });
    expect(r.marginPct.left).toBeCloseTo((25 / 210) * 100, 4);
    expect(r.marginPct.top).toBeCloseTo((10 / 297) * 100, 4);
  });

  it('maps legacy preset "narrow" to 12.7mm on all sides', () => {
    const r = resolvePageSettings({ size: 'a4', margin: 'narrow' } as any);
    expect(r.margin).toEqual({ top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 });
  });

  it('maps legacy preset "wide" to 30mm and Letter dims', () => {
    const r = resolvePageSettings({ size: 'letter', margin: 'wide' } as any);
    expect(r.widthMm).toBe(215.9);
    expect(r.heightMm).toBe(279.4);
    expect(r.margin.top).toBe(30);
  });

  it('falls back to A4 / 20mm when page is undefined', () => {
    const r = resolvePageSettings(undefined);
    expect(r.widthMm).toBe(210);
    expect(r.margin).toEqual({ top: 20, right: 20, bottom: 20, left: 20 });
  });

  it('clamps out-of-range margins to [0,50]', () => {
    const r = resolvePageSettings({
      size: 'a4',
      margin: { top: -5, right: 80, bottom: 20, left: 20 },
    } as any);
    expect(r.margin.top).toBe(0);
    expect(r.margin.right).toBe(50);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx nx test desktop --testFile=cv-content.util.spec.ts`
Expected: FAIL — `r.margin` is currently a number (`marginMm`), not an object.

- [ ] **Step 3: Implement**

Replace `ResolvedPage` + `resolvePageSettings` (lines 521-536):

```ts
export interface ResolvedPage {
  widthMm: number;
  heightMm: number;
  /** Clamped 4-side margins in mm. */
  margin: { top: number; right: number; bottom: number; left: number };
  /** Each side as a % of the relevant page dimension — resolution-independent
   * padding for the preview (top/bottom of height, left/right of width). */
  marginPct: { top: number; right: number; bottom: number; left: number };
}

const PRESET_MM: Record<string, number> = { narrow: 12.7, normal: 20, wide: 30 };
const clampMm = (v: number): number => Math.min(50, Math.max(0, Number.isFinite(v) ? v : 20));

/** Normalises the stored margin (new 4-side object, legacy preset string, or
 * absent) into clamped 4-side mm. */
function normalizeMargins(margin: unknown): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  if (typeof margin === 'string') {
    const mm = PRESET_MM[margin] ?? 20;
    return { top: mm, right: mm, bottom: mm, left: mm };
  }
  if (margin && typeof margin === 'object') {
    const m = margin as Partial<PageMargins>;
    return {
      top: clampMm(m.top ?? 20),
      right: clampMm(m.right ?? 20),
      bottom: clampMm(m.bottom ?? 20),
      left: clampMm(m.left ?? 20),
    };
  }
  return { top: 20, right: 20, bottom: 20, left: 20 };
}

/** Resolves `PageSettings` (new or legacy) to concrete mm + %. Single source of
 * truth for the preview; the Rust `resolve_page` mirrors these numbers for
 * DOCX export. */
export function resolvePageSettings(page: PageSettings | undefined): ResolvedPage {
  const size = page?.size === 'letter' ? 'letter' : 'a4';
  const [widthMm, heightMm] = size === 'letter' ? [215.9, 279.4] : [210, 297];
  const margin = normalizeMargins(page?.margin);
  return {
    widthMm,
    heightMm,
    margin,
    marginPct: {
      top: (margin.top / heightMm) * 100,
      bottom: (margin.bottom / heightMm) * 100,
      left: (margin.left / widthMm) * 100,
      right: (margin.right / widthMm) * 100,
    },
  };
}
```

Ensure `PageMargins` is imported at the top of the file (add to the existing `@applye/core` import that already includes `PageSettings`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx nx test desktop --testFile=cv-content.util.spec.ts`
Expected: PASS (all 5).

- [ ] **Step 5: Fix consumers that read the old shape, then build**

`pageStyle` in `cv-detail.component.ts:201-203` and the cover-letter equivalent read `r.marginPct` as a number — Task 4 rewrites them. For now just confirm the type errors are limited to the preview components (Task 4 owns them). Run: `npx nx build desktop` — expect errors ONLY in `cv-detail`/`cover-letter-detail` `pageStyle`/`marginMm` usage. If errors appear elsewhere, fix those call sites to use `r.margin`/`r.marginPct` object form here.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-content.util.ts apps/desktop/src/app/pages/documents/cv-content.util.spec.ts
git commit -m "feat(documents): resolve 4-side mm margins with legacy preset back-compat"
```

---

### Task 3: Update Rust `PageSettings` + `resolve_page` + DOCX for 4-side mm

**Files:**

- Modify: `apps/desktop/src-tauri/src/commands/documents.rs:792-815` (`PageSettings` struct, add `PageMargins`, `MarginSpec`)
- Modify: `apps/desktop/src-tauri/src/commands/tailoring.rs:315-339` (`PageConfig`, `resolve_page`), `:465-479` (DOCX margins)
- Test: append to the existing `resolve_page` test module in `tailoring.rs`

**Interfaces:**

- Produces (Rust): `PageConfig { width_mm: f32, height_mm: f32, margin: Margins }` where `Margins { top, right, bottom, left: f32 }`. `resolve_page(&PageSettings) -> PageConfig` accepts legacy preset string OR 4-side object via a `#[serde(untagged)]` `MarginSpec`.

- [ ] **Step 1: Write the failing test**

Append to the test module in `tailoring.rs`:

```rust
#[test]
fn resolve_page_maps_legacy_preset_and_four_side_mm() {
    use crate::commands::documents::{MarginSpec, PageMargins, PageSettings};
    // legacy preset
    let legacy = PageSettings { size: "a4".into(), margin: MarginSpec::Preset("wide".into()) };
    let c = resolve_page(&legacy);
    assert_eq!(c.width_mm, 210.0);
    assert_eq!(c.margin.top, 30.0);
    assert_eq!(c.margin.left, 30.0);
    // 4-side object
    let sides = PageSettings {
        size: "letter".into(),
        margin: MarginSpec::Sides(PageMargins { top: 10.0, right: 15.0, bottom: 20.0, left: 25.0 }),
    };
    let c2 = resolve_page(&sides);
    assert_eq!(c2.width_mm, 215.9);
    assert_eq!(c2.margin.right, 15.0);
    assert_eq!(c2.margin.left, 25.0);
    // clamp
    let bad = PageSettings {
        size: "a4".into(),
        margin: MarginSpec::Sides(PageMargins { top: -5.0, right: 80.0, bottom: 20.0, left: 20.0 }),
    };
    let c3 = resolve_page(&bad);
    assert_eq!(c3.margin.top, 0.0);
    assert_eq!(c3.margin.right, 50.0);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p <tauri-crate-name> resolve_page_maps_legacy_preset_and_four_side_mm` (crate name per `apps/desktop/src-tauri/Cargo.toml`; e.g. `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml resolve_page_maps`).
Expected: FAIL — `MarginSpec`/`PageMargins` don't exist; `margin` is `String`.

- [ ] **Step 3: Edit `documents.rs` struct (lines 792-815)**

```rust
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PageMargins {
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
    pub left: f32,
}

/// Margin as stored: legacy preset string ("narrow"|"normal"|"wide") OR a
/// 4-side mm object. `resolve_page` normalises both to clamped mm.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(untagged)]
pub enum MarginSpec {
    Preset(String),
    Sides(PageMargins),
}

impl Default for MarginSpec {
    fn default() -> Self {
        MarginSpec::Preset("normal".into())
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PageSettings {
    #[serde(default = "PageSettings::default_size")]
    pub size: String,
    #[serde(default)]
    pub margin: MarginSpec,
}

impl PageSettings {
    fn default_size() -> String {
        "a4".into()
    }
}

impl Default for PageSettings {
    fn default() -> Self {
        PageSettings { size: Self::default_size(), margin: MarginSpec::default() }
    }
}
```

Remove the old `default_margin` fn and the old `#[serde(default = "PageSettings::default_margin")]` line. If `default_margin` is referenced elsewhere, update those references (grep `default_margin`).

- [ ] **Step 4: Edit `tailoring.rs` `PageConfig` + `resolve_page` (315-339)**

```rust
/// Concrete page geometry in millimetres, resolved from `PageSettings`.
pub(crate) struct PageConfig {
    pub width_mm: f32,
    pub height_mm: f32,
    pub margin: crate::commands::documents::PageMargins,
}

fn clamp_mm(v: f32) -> f32 {
    v.max(0.0).min(50.0)
}

/// Mirrors the TS `resolvePageSettings`. Accepts legacy presets and 4-side mm;
/// unknown size falls back to A4 so a malformed `style_json` never breaks export.
pub(crate) fn resolve_page(p: &crate::commands::documents::PageSettings) -> PageConfig {
    use crate::commands::documents::{MarginSpec, PageMargins};
    let (width_mm, height_mm) = match p.size.as_str() {
        "letter" => (215.9, 279.4),
        _ => (210.0, 297.0),
    };
    let margin = match &p.margin {
        MarginSpec::Preset(s) => {
            let mm = match s.as_str() {
                "narrow" => 12.7,
                "wide" => 30.0,
                _ => 20.0,
            };
            PageMargins { top: mm, right: mm, bottom: mm, left: mm }
        }
        MarginSpec::Sides(m) => PageMargins {
            top: clamp_mm(m.top),
            right: clamp_mm(m.right),
            bottom: clamp_mm(m.bottom),
            left: clamp_mm(m.left),
        },
    };
    PageConfig { width_mm, height_mm, margin }
}
```

- [ ] **Step 5: Update the DOCX margin call (465-479)**

Replace the four `.top/.bottom/.left/.right(tw(page.margin_mm))` with per-side:

```rust
            PageMargin::new()
                .top(tw(page.margin.top))
                .bottom(tw(page.margin.bottom))
                .left(tw(page.margin.left))
                .right(tw(page.margin.right)),
```

- [ ] **Step 6: Run the test + full suite + lint**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml resolve_page_maps` → PASS.
Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` → all green.
Run: `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings` and `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml`.
Expected: clean. (The PDF `printpdf` path in `tailoring.rs` also reads `page.margin_mm` — update those references to `page.margin.top` etc. or the crate won't compile. Grep `margin_mm` and fix all hits; the PDF path is retired from the CV/cover-letter flow in Phase B but must still compile now.)

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/documents.rs apps/desktop/src-tauri/src/commands/tailoring.rs
git commit -m "feat(documents): honor 4-side mm margins in rust resolve_page and docx"
```

---

### Task 4: Rebuild the CV preview as a paginated sheet

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts` (`pageStyle` computed → CSS custom props; add `ResizeObserver` for page-count + overflow)
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html` (preview wrapper markup)
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.scss:814+` (`.cvpreview` → sheet)
- Test: `cv-detail.component.spec.ts` (append focused signal test)

**Interfaces:**

- Consumes: `resolvePageSettings` → `ResolvedPage` (Task 2).
- Produces: `pageVars` computed returning CSS custom properties; `pageCount` signal; `overflowWarning` signal (used by Task 6).

- [ ] **Step 1: Replace the `pageStyle` computed with `pageVars` (cv-detail.component.ts:201-203)**

```ts
/** px per mm at 96dpi — fixes the on-screen sheet to real page proportions. */
private static readonly PX_PER_MM = 96 / 25.4;

readonly pageVars = computed(() => {
  const r = resolvePageSettings(this.style().page);
  const px = CvDetailComponent.PX_PER_MM;
  const w = r.widthMm * px;
  const h = r.heightMm * px;
  return {
    '--page-w': `${w}px`,
    '--page-h': `${h}px`,
    '--mt': `${r.margin.top * px}px`,
    '--mr': `${r.margin.right * px}px`,
    '--mb': `${r.margin.bottom * px}px`,
    '--ml': `${r.margin.left * px}px`,
  } as Record<string, string>;
});
```

(Keep the class name in the component reference; adjust if `pageStyle` is referenced elsewhere in the template — Step 3 rewires it.)

- [ ] **Step 2: Add page-count + overflow measurement**

Add a `viewChild` for the sheet element and a `ResizeObserver` that measures content height. In the component class:

```ts
readonly sheetEl = viewChild<ElementRef<HTMLElement>>('cvSheet');
readonly pageCount = signal(1);
readonly blockOverflow = signal(false);

private ro?: ResizeObserver;

private observeSheet(): void {
  const el = this.sheetEl()?.nativeElement;
  if (!el) return;
  this.ro?.disconnect();
  this.ro = new ResizeObserver(() => this.recomputePages(el));
  this.ro.observe(el);
  this.recomputePages(el);
}

private recomputePages(el: HTMLElement): void {
  const r = resolvePageSettings(this.style().page);
  const px = CvDetailComponent.PX_PER_MM;
  const usableH = (r.heightMm - r.margin.top - r.margin.bottom) * px;
  const contentH = el.scrollHeight - (r.margin.top + r.margin.bottom) * px;
  this.pageCount.set(Math.max(1, Math.ceil(contentH / Math.max(1, usableH))));
  // Block-too-tall: any direct child taller than one usable page.
  const tooTall = Array.from(el.children).some((c) => (c as HTMLElement).offsetHeight > usableH + 1);
  this.blockOverflow.set(tooTall || usableH <= 0);
}
```

Call `observeSheet()` from an `effect()` (so it re-runs when `previewMode()` flips to true and the sheet enters the DOM) and disconnect the observer in `ngOnDestroy`. Add `viewChild, ElementRef, effect, signal` to the Angular imports if not present.

- [ ] **Step 3: Update the template preview block (cv-detail.component.html)**

Find where the preview renders the `.cvpreview` sheet (bound to the old `pageStyle`) and wrap it:

```html
<div class="cvpreview-viewport">
  <div class="cvpreview" #cvSheet [style]="pageVars()">
    <!-- existing preview content unchanged -->
  </div>
  <!-- page-count + warning row rendered by Task 6 -->
</div>
```

Remove the old `[ngStyle]="pageStyle"` / `[style]="pageStyle"` binding on the sheet; the new `[style]="pageVars()"` replaces it.

- [ ] **Step 4: Rewrite `.cvpreview` SCSS (cv-detail.component.scss:814)**

```scss
.cvpreview-viewport {
  overflow: auto;
  display: flex;
  justify-content: center;
  padding: var(--space-4);
  background: var(--surface-2);
}
.cvpreview {
  position: relative;
  width: var(--page-w);
  min-height: var(--page-h);
  padding: var(--mt) var(--mr) var(--mb) var(--ml);
  box-sizing: border-box;
  background: var(--surface-1);
  border: var(--border-width) solid var(--border-default);
  box-shadow: 0 1px 4px rgb(0 0 0 / 12%);
  font-family: var(--font-sans);
  color: var(--text-primary);
  // Page-break guides: a dashed line at every full page-height boundary.
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(var(--page-h) - 1px),
    var(--border-strong, #999) calc(var(--page-h) - 1px),
    var(--border-strong, #999) var(--page-h)
  );
  background-attachment: local;
}
```

Remove the old `max-width: 720px; margin: 0 auto; padding: var(--space-8);` from `.cvpreview`. Keep all `.cvpreview__*` child rules unchanged.

- [ ] **Step 5: Add a focused component test**

```ts
// cv-detail.component.spec.ts
it('exposes A4 sheet dimensions via pageVars', () => {
  component.style.set({
    ...component.style(),
    page: { size: 'a4', margin: { top: 20, right: 20, bottom: 20, left: 20 } },
  } as any);
  const vars = component.pageVars();
  expect(vars['--page-w']).toBe(`${(210 * 96) / 25.4}px`);
  expect(vars['--mt']).toBe(`${(20 * 96) / 25.4}px`);
});
it('produces different width for Letter', () => {
  component.style.set({
    ...component.style(),
    page: { size: 'letter', margin: { top: 20, right: 20, bottom: 20, left: 20 } },
  } as any);
  expect(component.pageVars()['--page-w']).toBe(`${(215.9 * 96) / 25.4}px`);
});
```

(Adapt `component.style.set(...)` to how the component exposes its style signal; if `style` is derived, drive it via the input the test harness already uses.)

- [ ] **Step 6: Run tests + build**

Run: `npx nx test desktop --testFile=cv-detail.component.spec.ts` → PASS.
Run: `npx nx build desktop` → no type errors.

- [ ] **Step 7: Verify in the preview**

Use the preview tools: start the app, open a CV, enter preview. Confirm A4 sheet renders with real proportions; switch size to Letter (after Task 5 controls exist — if doing Task 4 first, temporarily set size in code) and confirm the sheet widens. Screenshot for the record.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-detail/
git commit -m "feat(documents): render cv preview as paginated a4/letter sheet"
```

---

### Task 5: Replace preset margin control with 4-side mm inputs (CV + cover letter)

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html:204-212` (margin control)
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts` (margin change handlers)
- Modify: `apps/desktop/src/app/pages/documents/cover-letter-detail/*` (same controls + the `.letter-sheet` sheet rebuild mirroring Task 4)
- Modify: `libs/i18n/src/lib/translations/translations.ts` (add margin-side + notice keys; EN + DE)
- Test: none new (covered by resolver tests); manual verify

**Interfaces:**

- Consumes: `PageSettings`, `PageMargins` (Task 1); `pageVars` (Task 4).
- Produces: `setMarginSide(side: keyof PageMargins, value: number)` and `setPageSize(size: PageSize)` on both detail components, writing back through the existing style-update path.

- [ ] **Step 1: Add i18n keys**

In `translations.ts`, alongside the existing `cv_style_page_*` / `cv_style_margin*` keys, add (EN then DE mirror):

```ts
cv_style_margins: 'Margins (mm)',
cv_style_margin_top: 'Top',
cv_style_margin_right: 'Right',
cv_style_margin_bottom: 'Bottom',
cv_style_margin_left: 'Left',
cv_style_page_count: 'Page {n}',          // interpolated in component
cv_style_overflow_warning: 'Content is taller than the usable page area — reduce margins or content.',
cv_style_export_pdf_wysiwyg: 'Export PDF (print)',
cv_style_export_pixel_note: 'PDF matches the preview exactly. DOCX matches size, margins, and structure but not pixels.',
```

Keep the legacy `cv_style_margin_narrow/normal/wide` keys (still referenced by old data paths / removable later). Provide German translations for each new key.

- [ ] **Step 2: Replace the CV margin `<select>` (html:204-212) with 4 numeric inputs**

```html
<div class="cvdetail__style-field">
  <span class="cvdetail__style-label">{{ t()('documents.cv_style_margins') }}</span>
  <div class="cvdetail__margin-grid">
    @for (side of marginSides; track side.key) {
    <label class="cvdetail__margin-input">
      <span>{{ t()(side.label) }}</span>
      <input
        type="number"
        min="0"
        max="50"
        step="1"
        [ngModel]="currentMargin()[side.key]"
        (ngModelChange)="setMarginSide(side.key, $event)"
      />
    </label>
    }
  </div>
</div>
```

- [ ] **Step 3: Add component wiring (cv-detail.component.ts)**

```ts
readonly marginSides = [
  { key: 'top' as const, label: 'documents.cv_style_margin_top' },
  { key: 'right' as const, label: 'documents.cv_style_margin_right' },
  { key: 'bottom' as const, label: 'documents.cv_style_margin_bottom' },
  { key: 'left' as const, label: 'documents.cv_style_margin_left' },
];

readonly currentMargin = computed<PageMargins>(() => {
  const r = resolvePageSettings(this.style().page);
  return r.margin; // already clamped 4-side mm
});

setMarginSide(side: keyof PageMargins, value: number): void {
  const clamped = Math.min(50, Math.max(0, Math.round(Number(value) || 0)));
  const cur = this.currentMargin();
  const size = this.style().page?.size ?? 'a4';
  this.updatePage({ size, margin: { ...cur, [side]: clamped } });
}

setPageSize(size: PageSize): void {
  this.updatePage({ size, margin: this.currentMargin() });
}
```

Implement `updatePage(page: PageSettings)` to merge into the style and persist through the component's existing style-save method (the same path the old size/margin `<select>` used — find how `style().page` was written before and reuse it).

- [ ] **Step 4: Point the size `<select>` at `setPageSize`**

Change the size select (html:194-201) `(ngModelChange)` to call `setPageSize($event)` so it goes through the same merge (preserving margins).

- [ ] **Step 5: Mirror everything for the cover letter**

Apply Steps 2-4 to `cover-letter-detail` and rebuild `.letter-sheet` (scss:575) exactly like Task 4's `.cvpreview` (sheet width/min-height/padding vars + repeating-gradient guides + viewport wrapper + `pageVars`/`ResizeObserver`). The cover-letter component already imports `resolvePageSettings`.

- [ ] **Step 6: Add margin-grid SCSS (both components)**

```scss
.cvdetail__margin-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-2);
}
.cvdetail__margin-input {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--text-xs);
  input {
    width: 100%;
  }
}
```

- [ ] **Step 7: Build + verify**

Run: `npx nx build desktop` → clean.
Verify with preview tools: change each margin side, confirm the sheet padding updates live; switch A4/Letter, confirm dimensions change and margins persist. Screenshot.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/app/pages/documents/ libs/i18n/
git commit -m "feat(documents): replace margin preset with 4-side mm inputs and i18n"
```

---

### Task 6: Page-count indicator + overflow warning banner

**Files:**

- Modify: `cv-detail.component.html` + `cover-letter-detail.component.html` (banner + page-count row below the sheet)
- Modify: both `.scss` (banner styles)
- Uses: `pageCount`, `blockOverflow` signals (Task 4) and i18n keys (Task 5)

**Interfaces:**

- Consumes: `pageCount()`, `blockOverflow()`, `t()`.

- [ ] **Step 1: Add the row + banner markup (below `.cvpreview` in the viewport)**

```html
<div class="cvpreview__pagebar">
  <span class="cvpreview__pagecount"
    >{{ t()('documents.cv_style_page_count').replace('{n}', pageCount().toString()) }}</span
  >
</div>
@if (blockOverflow()) {
<p class="cvpreview__warning" role="status">{{ t()('documents.cv_style_overflow_warning') }}</p>
}
```

(If the codebase has a shared notice/banner component, use it instead of a raw `<p>`; match the existing style-note pattern used for `check_style_safety` notes.)

- [ ] **Step 2: Add banner SCSS**

```scss
.cvpreview__pagebar {
  text-align: center;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  padding: var(--space-2) 0;
}
.cvpreview__warning {
  margin: var(--space-2) auto 0;
  max-width: var(--page-w, 720px);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-card);
  background: var(--warning-tint, #fff4e5);
  color: var(--warning-strong, #8a5a00);
  font-size: var(--text-sm);
}
```

- [ ] **Step 3: Build + verify both trigger paths**

Run: `npx nx build desktop`.
Verify with preview tools: (a) add enough content to push to 2 pages → "Page 2" shows, NO warning; (b) set all margins to 50 on a small page (or add a very tall block) → warning appears. Screenshot both.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/app/pages/documents/
git commit -m "feat(documents): add page-count indicator and overflow warning banner"
```

---

### Task 7: WYSIWYG PDF via `webview.print()` from the detail view

**Files:**

- Modify: `apps/desktop/src-tauri/src/main.rs` or the Tauri config — **only** the capability: `apps/desktop/src-tauri/capabilities/default.json` (add `core:webview:allow-print`, already added in the spike; commit it here)
- Modify: `cv-detail.component.ts` + `cover-letter-detail.component.ts` (print action + dynamic `@page` injection)
- Modify: both `.html` (Export PDF button in preview toolbar)
- Modify: both `.scss` (a print stylesheet block, or a shared `print.scss`)
- Modify: i18n already has `cv_style_export_pdf_wysiwyg` (Task 5)

**Interfaces:**

- Consumes: `resolvePageSettings` (mm for `@page`), `getCurrentWebviewWindow` from `@tauri-apps/api/webviewWindow` (confirm exact symbol from the spike).

- [ ] **Step 1: Confirm the print permission is present**

`apps/desktop/src-tauri/capabilities/default.json` `permissions` array includes `"core:webview:allow-print"` (from spike). If not, add it.

- [ ] **Step 2: Add the print method (both detail components)**

```ts
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

async exportPdfWysiwyg(): Promise<void> {
  const r = resolvePageSettings(this.style().page);
  const rule =
    `@page { size: ${r.widthMm}mm ${r.heightMm}mm;` +
    ` margin: ${r.margin.top}mm ${r.margin.right}mm ${r.margin.bottom}mm ${r.margin.left}mm; }`;
  let el = document.getElementById('wysiwyg-page-rule') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'wysiwyg-page-rule';
    document.head.appendChild(el);
  }
  el.textContent = rule;
  document.body.classList.add('printing-cv');
  try {
    await getCurrentWebviewWindow().print();
  } finally {
    document.body.classList.remove('printing-cv');
  }
}
```

- [ ] **Step 3: Add the print stylesheet**

In the component SCSS (or a global `styles.scss` print block), so only the sheet prints:

```scss
@media print {
  body.printing-cv * {
    visibility: hidden;
  }
  body.printing-cv .cvpreview,
  body.printing-cv .cvpreview * {
    visibility: visible;
  }
  body.printing-cv .cvpreview {
    position: absolute;
    inset: 0;
    width: auto;
    min-height: auto;
    margin: 0;
    padding: 0; // @page margin handles the real margins — avoid double-margin
    border: 0;
    box-shadow: none;
    background-image: none; // hide the on-screen break guides
  }
}
```

(For the cover letter, target `.letter-sheet` with the same rules; use a shared class or duplicate per component.)

- [ ] **Step 4: Add the Export PDF button in preview mode (both html)**

In the preview toolbar (near the preview/edit toggle):

```html
@if (previewMode()) {
<button appButton variant="primary" size="sm" (click)="exportPdfWysiwyg()">
  {{ t()('documents.cv_style_export_pdf_wysiwyg') }}
</button>
}
```

- [ ] **Step 5: Build + verify end-to-end**

Run: `npx nx build desktop`.
Run the desktop app. Open a CV → preview → Export PDF (print). Confirm: OS dialog opens, "Save as PDF" yields a PDF whose page size, margins, and page breaks match the on-screen sheet. Repeat for a 2-page CV and the cover letter.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/capabilities/default.json apps/desktop/src/app/pages/documents/
git commit -m "feat(documents): export wysiwyg pdf via webview print from preview"
```

---

### Task 8: Retire the list-level Rust PDF export; keep DOCX/tex

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-list/cv-list.component.html:80` and `cover-letter-list.component.html:71` (remove the `pdf` `<option>`)
- Modify: `cv-list.component.ts` + `cover-letter-list.component.ts` (drop `'pdf'` from the export format union + any pdf-specific branch)
- Modify: `libs/i18n` — add a short note pointing users to the preview for PDF (reuse `cv_style_export_pixel_note` or a new `cv_export_pdf_moved` key)
- Rust: leave `export_pdf`/`printpdf` in place for now (used by tailored/job-application export elsewhere); only the CV/cover-letter _library_ list stops offering it. Confirm with a grep that no other caller breaks.

**Interfaces:**

- Consumes: nothing new.

- [ ] **Step 1: Remove the pdf option from both list templates**

Delete the `<option value="pdf">…</option>` lines. The export `<select>` now offers `docx` (and `tex` where present).

- [ ] **Step 2: Narrow the format unions**

In both list components change `format: 'docx' | 'pdf' | 'tex'` → `format: 'docx' | 'tex'` (or `'docx'` only for cover letter), and remove any `if (format === 'pdf')` branch + the `pdf` extension from save-dialog filters (`cv-list.component.ts:202`).

- [ ] **Step 3: Add the pointer note**

Where the export control sits, add a small hint (i18n) that PDF export now lives in the document preview ("Open the document and use Export PDF for a pixel-exact PDF").

- [ ] **Step 4: Grep for orphaned callers**

Run: `grep -rn "export_pdf\|'pdf'" apps/desktop/src/app/pages/documents/`
Expected: no remaining CV/cover-letter _library list_ references to pdf export. Tailored/job-application PDF (if any) is untouched.

- [ ] **Step 5: Build + verify**

Run: `npx nx build desktop`. Verify the list export dropdowns no longer show PDF; DOCX still exports. Screenshot.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/app/pages/documents/ libs/i18n/
git commit -m "feat(documents): move pdf export to preview, drop list-level pdf option"
```

---

## Final Verification

- [ ] `npx nx test core` and `npx nx test desktop` green for touched specs.
- [ ] `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` green; `cargo clippy -- -D warnings` clean.
- [ ] `npx nx build desktop` clean.
- [ ] Manual: legacy CV (created before this change, preset margin) still opens, previews, and prints with correct margins (back-compat).
- [ ] Manual: A4↔Letter visibly changes the sheet; 4-side mm inputs move padding live; overflow warning fires on tall content; Export PDF (print) produces a PDF matching the sheet.
- [ ] Update `CHANGELOG.md` `[Unreleased]` with the WYSIWYG preview + 4-side margins + PDF-print entry.
- [ ] Docs sync: note in `docs/product/CURRENT_STATE.md` that PDF export is now WYSIWYG from preview; DOCX remains structural.

## Deferred (separate plans)

- **Phase C:** deeper DOCX/tex alignment beyond margins (structure/spacing parity + honesty note surfaced in UI).
- **Phase D:** photo placement slots (4 discrete positions) expressed in the paginated preview + print CSS + DOCX; reuses `PhotoPlacement` model bits from `2026-07-09-page-photo-layout-design.md`.
