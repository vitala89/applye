# WYSIWYG Preview → Export — Design

**Date:** 2026-07-09
**Status:** Approved, ready for implementation plan.
**Supersedes:** `2026-07-09-page-photo-layout-design.md` (Phase 2 photo work folded in here as Phase D).

## Problem

The preview is the source of truth: what the user sees should be the final document, and export must reproduce it. Two gaps today:

1. **Preview is a content card, not a page.** `.cvpreview` (cv-detail scss:814) and `.letter-sheet` (cover-letter-detail scss:575) are `max-width:720px` content-height cards. A4 vs Letter is invisible because height is content-driven, so the page-size control looks dead.
2. **PDF export is a separate renderer.** PDF comes from the Rust `printpdf` path (`export_pdf` in `commands/tailoring.rs`), which re-implements layout and drifts from the on-screen preview. It is not WYSIWYG.

## Locked Decisions

1. **PDF = the preview, printed exactly (WYSIWYG).** Print the preview DOM via the Tauri webview (`webview.print()` → OS dialog → "Save as PDF"). DOCX stays structural. `.tex`/plain-text stay plain. **PDF method = Option A** (`webview.print()`), chosen over headless Chromium to keep the binary small and local-first.
2. **Margins = numeric mm, 4 sides**, with clamp + warning. Replaces the narrow/normal/wide preset.
3. **Preview = a real fixed-proportion A4/Letter sheet** with visible page breaks — continuous sheet + dashed break guides, not JS element-splitting.

## Data Model

`PageSettings.margin` changes from a preset enum to a 4-side mm object.

```ts
// libs/core/src/lib/models/document.model.ts
export interface PageMargins {
  top: number; // mm
  right: number;
  bottom: number;
  left: number;
}
export interface PageSettings {
  size: PageSize; // 'a4' | 'letter' (unchanged)
  margin: PageMargins; // was PageMarginPreset
}
export const PAGE_SETTINGS_DEFAULT: PageSettings = {
  size: 'a4',
  margin: { top: 20, right: 20, bottom: 20, left: 20 },
};
```

Applies to both `CvStyle.page` and `CoverLetterStyle.page`, and the Rust mirrors in `commands/documents.rs`.

**Bounds:** each side clamped to `[0, 50]` mm. Values outside are clamped and trigger the warning.

**Back-compat (read path).** When reading legacy `style_json`:

- `margin: 'narrow'` → all sides 12.7 mm
- `margin: 'normal'` → all sides 20 mm
- `margin: 'wide'` → all sides 30 mm
- `margin` absent / `page` absent → default (A4 / 20 mm all sides)

Migration is read-time only (no DB rewrite); the mapped object is persisted on the next save. Same mapping in TS (`resolvePageSettings`, cv-content.util.ts:531) and Rust (`resolve_page`, tailoring.rs).

## Component Design

### resolvePageSettings (updated)

Returns concrete geometry for both preview binding and any export path:

```ts
interface ResolvedPage {
  widthMm: number;
  heightMm: number;
  margin: { top: number; right: number; bottom: number; left: number }; // mm, clamped
  // percentage helpers for CSS padding, relative to width/height as appropriate
  marginPct: { top: number; right: number; bottom: number; left: number };
}
```

Single source of truth. Clamping to `[0,50]` happens here so preview and export agree.

### Paginated preview sheet (Phase A)

Rebuild `.cvpreview` / `.letter-sheet`:

- **Fixed proportion.** Sheet width scales to fit the preview container; `aspect-ratio: widthMm / heightMm` sets height. A4 (210×297) and Letter (215.9×279.4) now render visibly different.
- **Margins.** Padding = resolved 4-side margins as % of the sheet dimensions (top/bottom as % of height, left/right as % of width).
- **Pagination = continuous sheet + break guides.** Content flows top-to-bottom in one sheet element. Dashed horizontal guide lines are drawn at each usable-page-height boundary with a "Page N" label. No JS element measuring/splitting for the on-screen sheet — guide positions are computed from the resolved page height and margins. (The real page breaks in the PDF come from `@page`, see Phase B.)
- **Warning banner** (below the preview, using existing notification style):
  - **Margin out of range** — a typed value <0 or >50 mm is clamped; banner explains the clamp.
  - **Block too tall** — a single block (e.g. photo, unbreakable line) taller than the usable page area (page height minus top+bottom margins); banner advises reducing margins / photo size.
  - **Multi-page is NOT a warning.** Page count is shown as the "Page N" guide labels only.

### WYSIWYG PDF export (Phase B)

- "Export PDF" invokes `webview.print()` (Tauri). Requires `core:webview:allow-print` in `apps/desktop/src-tauri/capabilities/*.json`.
- **Print stylesheet** (`@media print`) hides all app chrome and shows only the sheet; `@page { size: <a4|letter>; margin: <4-side mm> }` drives the real page breaks so the printed pages match the on-screen guides.
- The Rust `export_pdf` (printpdf) path is retired from the CV / cover-letter flow. DOCX/tex export commands stay.

### DOCX + tex/txt (Phase C)

- DOCX stays structural but honors 4-side mm margins + page size (docx-rs `PageSize` + `PageMargin` — already wired for presets, swap preset→mm).
- `.tex` / plain-text stay plain/structural.
- **Honest expectation.** A one-line UI note states only PDF is pixel-exact; DOCX matches size/margins/structure but not pixels.

### Photo placement (Phase D — deferred)

Old Phase 2, deferred by the user. 4 discrete photo slots, expressed in the paginated preview + print CSS + DOCX. Reuses `PhotoPlacement` model bits from `2026-07-09-page-photo-layout-design.md`. Out of scope for the first ship; listed here so the model/preview design leaves room for it.

## Data Flow

```
style_json (DB)
  → read + back-compat map (preset→mm)   [TS resolvePageSettings / Rust resolve_page]
  → ResolvedPage (clamped 4-side mm)
      → preview sheet CSS (aspect-ratio + % padding + break guides)   [Phase A]
      → @page print CSS → webview.print() → PDF                        [Phase B]
      → docx-rs PageSize + PageMargin → DOCX                           [Phase C]
```

## Error / Edge Handling

- Out-of-range mm → clamp in `resolvePageSettings` + warning banner.
- Block taller than usable area → warning banner (does not block export).
- Legacy preset values → mapped, never error.
- `webview.print()` cancelled by user → no-op, no error surfaced.

## Testing

- **Model/back-compat (unit):** legacy `'narrow'|'normal'|'wide'` and absent → correct mm; TS and Rust parity on the mm numbers; clamp `[0,50]`.
- **resolvePageSettings (unit):** A4/Letter dims, 4-side mm → correct px/%; clamp behavior.
- **Preview (component):** A4 vs Letter aspect-ratio differs; margins map to padding; break-guide count matches computed page count; warning fires on out-of-range and block-too-tall.
- **Print CSS (manual/spike):** `webview.print()` produces a correct A4/Letter PDF whose page breaks match the on-screen guides — validated in the research spike before Phase B build.
- **DOCX (unit):** page size + 4-side margins land in the docx bytes.

## Phasing

Ordered; first ship = migration + A + B.

- **Spike:** throwaway proof that preview HTML prints to a correct A4 PDF via `webview.print()` + `@page` CSS. Gate before Phase B.
- **Migration:** `PageMargins` model (TS + Rust), back-compat read map, updated resolvers. Unit-tested.
- **Phase A:** paginated preview sheet + 4-side numeric mm controls + warning banner. Highest user-visible value, pure Angular/CSS.
- **Phase B:** print CSS + `webview.print()` wiring; retire Rust PDF from this path.
- **Phase C:** align DOCX to 4-side mm; keep tex/txt plain; add honesty note.
- **Phase D:** photo placement slots (deferred).

## Files That Will Change

- Model: `libs/core/src/lib/models/document.model.ts` (`PageSettings`, `PageMargins`).
- Resolver: `apps/desktop/src/app/pages/documents/cv-content.util.ts` (`resolvePageSettings`).
- Preview: `apps/desktop/src/app/pages/documents/{cv-detail,cover-letter-detail}/*.{ts,html,scss}` (`.cvpreview` scss:814, `.letter-sheet` scss:575).
- Rust: `apps/desktop/src-tauri/src/commands/{documents.rs,tailoring.rs}` (`PageSettings`/`PageMargins` structs, `resolve_page`, DOCX margins; retire PDF from CV/cover-letter path).
- Capabilities: `apps/desktop/src-tauri/capabilities/*.json` (`core:webview:allow-print`).
- i18n: `libs/i18n/src/lib/translations/translations.ts` (4-side margin labels, warning/notice strings; reuse existing `cv_style_page_*`).

```

```
