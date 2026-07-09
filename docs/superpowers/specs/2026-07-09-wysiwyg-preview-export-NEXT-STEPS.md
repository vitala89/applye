# WYSIWYG Preview → Export — Next Session Handoff

**Date:** 2026-07-09
**Status:** Direction chosen, needs re-brainstorm → new spec → research spike → plan → build.
**Start a fresh session for this.** This file is the entry point.

## Context: what already shipped

The `feat/page-photo-layout` branch **Phase 1** merged to main (page size + margins):

- `PageSettings` model in `libs/core/.../document.model.ts` (TS) and `commands/documents.rs` (Rust): `page?: { size:'a4'|'letter'; margin:'narrow'|'normal'|'wide' }` on `CvStyle` + `CoverLetterStyle`. Default A4 / normal, back-compatible.
- Resolvers: `resolvePageSettings` (TS, `cv-content.util.ts`) and `resolve_page` (Rust, `commands/tailoring.rs`) — same mm numbers.
- Export honors it: DOCX `PageSize`+`PageMargin`, PDF page dims + margins + wrap width.
- Editor controls: A4/Letter + Narrow/Normal/Wide selects in `cv-detail` and `cover-letter-detail`; preview binds aspect-ratio + margin padding.

Prior related work still in place: shared section-tagged block model + DOCX/PDF style parity + PDF wrapping + DOCX spacing (PR #64), CV photo upload (PR #62).

## What the user actually wants now (supersedes the old plan's Phase 2)

The **preview is the source of truth**. What the user sees in the preview is the final document, and export must reproduce it.

Locked decisions (from this session):

1. **PDF = the preview, exactly (WYSIWYG).** Print the preview HTML via the Tauri webview, not the Rust `printpdf` renderer. DOCX stays structural (Word is not WYSIWYG). `.tex`/plain-text stay plain/structural.
2. **Margins = numeric mm, with an overflow warning** — replace the Narrow/Normal/Wide presets with a numeric mm control (one value, or 4 sides). If content overflows the page / margins are out of range, show a notification below the preview.
3. **Preview = a real paginated A4/Letter sheet** — fixed page proportions, visible page breaks (page 1, page 2, …), not the current `max-width:720px` content card. The current preview is why the page-size button looks dead: A4 vs Letter is invisible when height is content-driven.

## Open decision to resolve FIRST (blocks the plan)

**How to produce the WYSIWYG PDF file.** Tauri v2 built-in printing is `WebviewWindow.print()` → **OS print dialog** (`core:webview:allow-print` permission), where the user picks "Save as PDF". It is true WYSIWYG but **not a silent file save**.

- **Option A — `webview.print()` dialog:** built-in, light, WYSIWYG. UX change: "Export PDF" opens the print dialog instead of writing a file directly. No new deps.
- **Option B — headless Chromium** (e.g. `chromiumoxide` / `headless_chrome`) to render the CV HTML → PDF silently to a file. Heavy dependency + bundle size; conflicts with the "tiny binary, local-first" ethos. Silent file save.

Recommend **A** unless the user insists on silent file export. Ask this at the start of the fresh session; it shapes the whole PDF path.

## Suggested phased approach for the fresh session

1. **Re-brainstorm** (superpowers:brainstorming) to lock: PDF approach (A vs B), numeric-margins UX (single vs 4-side, min/max, overflow rule), and the paginated-preview design. Rewrite the spec at `docs/superpowers/specs/` (supersede `2026-07-09-page-photo-layout-design.md`).
2. **Research spike** on the chosen PDF path — build a throwaway proof that the preview HTML prints to a correct A4 PDF (dialog or headless), including `@page` / print CSS, before committing to the plan.
3. **Phase A — Paginated preview + numeric margins.** Turn the preview into a fixed-proportion A4/Letter sheet with CSS pagination (page-break indicators), numeric mm margin control, and an overflow/out-of-range warning. Pure Angular/CSS; the highest-value, user-visible win.
4. **Phase B — WYSIWYG PDF.** Wire "Export PDF" to the chosen path (print CSS + `webview.print()`, or headless render). Ensure the printed output matches the on-screen sheet.
5. **Phase C — Align DOCX + tex/txt.** Keep DOCX structural but match sizes/margins/section structure to the preview as closely as docx-rs allows; make `.tex`/plain-text honor the same content/structure. Set honest expectations: only PDF is pixel-WYSIWYG.
6. **Phase D — Photo placement** (the old Phase 2, deferred by the user): 4 discrete slots, now expressed in the paginated preview + PDF print + DOCX. Model bits (`PhotoPlacement`) from the old plan are reusable.

## Files that will matter

- Preview: `apps/desktop/src/app/pages/documents/{cv-detail,cover-letter-detail}/*.{ts,html,scss}` — `.cvpreview` (scss ~:814) and `.letter-sheet` are the sheets to rebuild.
- Resolver/util: `apps/desktop/src/app/pages/documents/cv-content.util.ts` (`resolvePageSettings`).
- Model: `libs/core/src/lib/models/document.model.ts` (`PageSettings` → migrate margin from preset enum to mm number).
- Rust export: `apps/desktop/src-tauri/src/commands/{tailoring.rs,documents.rs}` (DOCX/tex; PDF path may move out of Rust for the WYSIWYG route).
- Tauri print permission: `apps/desktop/src-tauri/capabilities/*.json` — add `core:webview:allow-print` if going with Option A.
- i18n: `libs/i18n/src/lib/translations/translations.ts` (reuse `cv_style_page_*` / `cv_style_margin*`, add numeric-margin + overflow-warning keys).

## Migration note

The margin model changes from preset enum (`'narrow'|'normal'|'wide'`) to a numeric mm value. Keep back-compat: accept the old string values and map them to mm (narrow→12.7, normal→20, wide→30) when reading legacy `style_json`.
