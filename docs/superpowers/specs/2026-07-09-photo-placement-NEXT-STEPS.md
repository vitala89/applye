# Photo Placement + White-Sheet — Next Session Handoff

**Date:** 2026-07-09
**Status:** WYSIWYG preview→export shipped (PR #66). This file drives the next session.
**Start a fresh session for this.** This file is the entry point.

## What just shipped (PR #66, on `main`, squash `4b67383`)

WYSIWYG preview → export for CV + cover letter:

- **Model:** `PageSettings.margin` is now a 4-side mm object (`PageMargins {top,right,bottom,left}`) in `libs/core/.../document.model.ts` (TS) and `commands/documents.rs` (Rust `MarginSpec` untagged enum accepts legacy preset string OR 4-side object). Legacy preset → mm on read (narrow 12.7 / normal 20 / wide 30). Default A4 / 20 mm. Clamp [0,50].
- **Resolvers:** `resolvePageSettings` (TS, `cv-content.util.ts`) and `resolve_page` (Rust, `tailoring.rs`) return identical mm + 4-side margins.
- **Preview:** `.cvpreview` (cv-detail) and `.letter-sheet` (cover-letter-detail) are real fixed-proportion A4/Letter sheets. `PX_PER_MM = 96/25.4`. CSS vars `--page-w/--page-h/--mt/--mr/--mb/--ml`. Dashed page-break guides via `repeating-linear-gradient`. `ResizeObserver` → `pageCount` + `blockOverflow` signals. Page-count row + overflow warning banner below the sheet.
- **PDF = WYSIWYG:** "Export PDF" in preview → `exportPdfWysiwyg()` injects `<style id="wysiwyg-page-rule">` with `@page { size; margin }`, toggles body class `printing-cv`, calls DOM `window.print()` (Tauri macOS webview overrides it to native print IPC; needs `core:webview:allow-print`, added to `capabilities/default.json`). `@media print` shows only the sheet, zeroes padding (@page owns margins), hides guides, and **pins the sheet to light paper token values** so text is legible on the dark app theme.
- **DOCX:** per-side `PageMargin` honors the 4 mm values. tex/txt unchanged.
- **List:** PDF export option removed from CV/cover-letter library lists (DOCX/tex stay); note points to preview. Rust `printpdf` retired from this path (still used by AI-tailored job-application export).

Key files: `apps/desktop/src/app/pages/documents/{cv-detail,cover-letter-detail}/*.{ts,html,scss}`, `cv-content.util.ts`, `libs/core/.../document.model.ts`, `apps/desktop/src-tauri/src/commands/{documents.rs,tailoring.rs}`, `capabilities/default.json`, `libs/i18n/.../translations.ts`.

Deferred minors (safe): orphaned `documents.cv_export_pdf_action` i18n key; unused `ResolvedPage.marginPct`; `cvpreview__` class prefix reused inside the cover-letter template.

## Step 0 — Manual print verification — DONE ✅

Verified on a real macOS desktop build: Export PDF opens the OS "Save as PDF" dialog and prints **only the sheet** (correct A4 size, legible dark-on-white). `window.print()` on the macOS Tauri webview honours `@page`. Option A stands; no need for headless Chromium.

Two print bugs found + fixed post-merge (PR #67, on `main` `f661b74`):

1. **Async print timing** — `window.print()` on macOS is a non-blocking native IPC; the synchronous `finally` removed the `printing-cv` body class before the snapshot. Fix: clear the class on the `afterprint` event instead.
2. **View-encapsulated print CSS (the real one)** — the `@media print` block lived in the component SCSS, so Angular's Emulated encapsulation scoped `body.printing-cv *` to that component's own elements and it could not hide the app shell/sidebar → the whole app printed. Fix: moved the print rules to the GLOBAL `apps/desktop/src/styles.scss`.

**Lesson for future print work:** print rules that hide/show across components MUST live in the global stylesheet, never in a component SCSS.

## Step 1b — Discrete page cards in the preview (NEW, user-requested; likely the next feature)

**User wants** the preview to show real, separate page sheets, not the current single continuous sheet with a dashed break-guide line. Each page rendered as its own card with a clear caption below it: **"Page 1 of N", "Page 2 of N", …** — so page 2 shows how the content actually continues.

This is the "true separate page cards" option deferred at the original brainstorm (we shipped continuous-sheet + guides for simplicity). It is a **preview redesign**, non-trivial:

- Measure content and split into per-page `.page-card`s at the usable-page-height boundary (JS: `usableH = (heightMm − top − bottom)·PX_PER_MM`; page count = `ceil(contentH / usableH)`).
- Do NOT cut a block/line in half — respect `break-inside: avoid`; a block that doesn't fit moves wholly to the next card.
- Each card = white paper (fold in Step 1 "always white sheet" here — we're rebuilding the sheet anyway), caption "Page i of N" underneath, gap between cards.
- Keep the printed PDF in sync (real `@page` breaks already work; ensure on-screen card boundaries match where print actually breaks — `page-break-inside: avoid` on the same blocks).
- Replaces the current `repeating-linear-gradient` guides + single page-count row + `blockOverflow`/`pageCount` measurement in cv-detail & cover-letter-detail.

Needs its own `/brainstorm` → spec → plan → subagent execution. Branch `feat/preview-page-cards`. **This likely supersedes Step 1** (white sheet folds in) and is probably higher priority than Phase D per the user.

## Step 1 — Always-white preview sheet (fold into Step 1b)

**Decision (locked by user): the on-screen preview sheet always renders as white paper, regardless of app theme.** Rationale: preview = final document; on the dark theme the sheet currently uses `--surface-1`/`--text-primary` → grey paper, which breaks "what you see is what you print".

**Approach:** the `@media print` block for `.cvpreview` and `.letter-sheet` already pins light-paper token values (see the C1 fix in PR #66). Lift those same overrides to the **base** on-screen sheet rule so screen == print:

- On `.cvpreview` (cv-detail scss) and `.letter-sheet` (cover-letter scss), redefine the theme CSS custom properties to their light values on the sheet element (cascades to `.cvpreview__*` / letter children): `--surface-1/-2`, `--text-primary/-secondary/-tertiary`, `--border-subtle/-default/-strong`, accent tokens — reuse the exact values already in the `@media print` block. Plus explicit `background:#fff; color:<light text>`.
- The user's accent colour (name/titles) comes from inline `accentColorHex` — leave it (real colour, correct on white).
- After lifting to the base rule, the `@media print` copy of those overrides becomes redundant — dedupe (keep one source, e.g. a shared `%paper-light` placeholder or a mixin applied in both the base rule and print). Keep print's `padding:0` + `background-image:none`.
- The surrounding `.cvpreview-viewport` / letter viewport can keep the app-theme background (the grey desk around the white page looks correct in both themes).

Verify: dev build clean, component specs green; on a desktop build the sheet is white in dark mode and print still matches.

## Step 2 — Phase D: Photo placement slots (main feature; via `/brainstorm`)

Old "page-photo" Phase 2, deferred. Now that a real paginated sheet exists, the slots are finally expressible.

Scope to lock in brainstorming:

- **Slots:** a small fixed set of discrete positions (e.g. top-left / top-right / header-band / sidebar). Decide the exact set and which are DE-Bewerbungsfoto-appropriate.
- **Model:** reuse `PhotoPlacement` bits from the old `2026-07-09-page-photo-layout-design.md` spec (superseded, but the model idea is reusable). Add a placement field to the CV photo model; back-compat default = current inline top box.
- **Expression in 3 surfaces:** the paginated preview sheet (CSS position per slot), the print CSS (so the WYSIWYG PDF matches), and DOCX (docx-rs positioning — honest about limits).
- **Interaction:** where the user picks the slot (the existing photo card in the CV editor).
- Photo already exists: pick/crop 3:4, base64 dataUri in `CvPhotoSection`, embedded in DOCX/PDF (see PR #62). Placement is layout only.

Deliverable of the brainstorm: a new spec at `docs/superpowers/specs/YYYY-MM-DD-photo-placement-design.md` (supersede `2026-07-09-page-photo-layout-design.md`), then a plan, then subagent-driven execution.

## Working rules (from AGENTS.md / CLAUDE.md)

- Feature work on a new branch (`feat/photo-placement`), never on `main`.
- Read `PROJECT_CONTEXT.md`, `AGENTS.md`, `docs/product/CURRENT_STATE.md` first.
- Conventional Commits, lowercase subject (commitlint). Shared types → `libs/core`; strings → `libs/i18n`; TS↔Rust parity for anything exported.
- Core offline; AI opt-in; user data local + sensitive.
