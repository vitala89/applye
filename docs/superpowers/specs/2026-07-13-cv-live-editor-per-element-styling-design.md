# CV Live Editor — Per-Element Styling & Edit-Mode Reduction (Phase D.2) — Design

**Status:** Implemented (Tasks 1–6 complete). See "As-built" below for the shipped result, deviations, and residual limitations.
**Branch:** `feat/cv-editor-preview-refactor` (continues after Phase D + quick fixes `9ee10e8`, `c3c0287`).
**Predecessor:** Phase D live-preview editor (per-section styling + inline content editing).

## Goal

Move _all_ CV visual styling into the live-preview editor at a finer granularity, and reduce Edit mode to structure + global page/region settings.

Two user-driven changes from live testing:

1. **Per-element styling with scope.** Every selectable rendered element is independently styleable, with an explicit scope selector to apply the change to just that element, its section-group, or the whole document. Section titles apply to that title or to all titles.
2. **Edit-mode reduction.** Remove the document-wide body and title style controls from Edit mode (they are superseded by the preview panel). Edit mode keeps only the page group (size, margins) and region/photo/include toggles.

Quick fixes #2 (bold moved into preview) and #3 (focus-trap) are already shipped and are out of scope here.

## Resolved product decisions

- **Scope model — three levels.**
  - **Body element** (e.g. an experience role, a bullet, a skill value, the summary text): `This element` → `This section` → `Whole document`.
  - **Title element** (a section heading): `This title` → `All titles`.
- **Base look** (before any override) comes from the **active theme**. There is no longer a document-wide body/title style card in Edit mode; the panel's `Whole document` / `All titles` scope replaces it.
- **Identity — positional path keys.** Individual overrides are keyed by a stable positional path (e.g. `experience.1.role`, `experience.1.bullet.0`, `skills.0.label`, `summary.body`, `personal_details.title`). Distinct per element even when two elements share a display name. No content-model migration. Trade-off (accepted): a per-element override stays with the position if entries are later reordered in Edit mode.
- **Cascade resolution (most → least specific):** element override → section override → document default → theme seed.
- **Fixed contextual side panel** remains the styling surface (no floating toolbar).
- Selection stays a click-to-select interaction; the panel shows the scope selector plus the same font / size / weight / colour / line-height controls already present.

## Architecture

`CvDetailComponent` remains the single source of truth for content, style, persistence, safety checks, save, and export. `CvPreviewComponent` remains the single renderer and gains **element-level** selection identity. `CvLiveStylePanelComponent` gains a **scope selector** and emits a scope-tagged style patch/reset; the parent resolves the scope to the correct write target and applies it through pure reducers.

### Data model (additive, no migration)

Existing (unchanged):

- `CvStyle.fontFamily / fontSizePt / fontWeight / accentColorHex` — document body defaults (written by the `Whole document` body scope).
- `CvStyle.titleStyle?: CvTextStyle` — document title (written by the `All titles` scope).
- `CvStyle.sectionStyles?: Record<CvSectionKey, CvSectionStyle>` — per-section body override + `.title` (section-title override) + `.titleBorder`.

New:

- `CvStyle.elementStyles?: Record<string, CvElementStyle>` — per-element **body** override, keyed by positional path. `CvElementStyle` is the body subset: `fontFamily? / fontSizePt? / fontWeight? / colorHex? / lineHeight?`. Titles are **not** stored here — a title element has only two scopes, which map onto the existing `sectionStyles[key].title` (this title) and `titleStyle` (all titles).

So the only genuinely new storage is `elementStyles` (body leaves). Title scoping reuses the existing two-tier storage.

### Selection identity

`CvPreviewSelection` gains an optional element path:

```ts
export interface CvPreviewSelection {
  sectionKey: CvSectionKey;
  part: 'body' | 'title';
  elementPath?: string; // present when a specific body leaf is selected; absent for a title
}
```

Clicking a specific body leaf sets `elementPath`; clicking a section title sets `part: 'title'` with no path. The path is derived by the same positional logic already used for inline-edit draft ids (`exp.1.role` etc.) — reuse/rename that path helper so draft ids and style keys share one source of truth.

### Scope selector → write target

The panel emits `{ scope, patch }` (or `{ scope, reset: true }`) where `scope ∈ { element, section, document }` for body and `{ title-section, title-document }` for titles. The parent maps scope to a write:

| Selected part | Scope      | Write target               | Reducer                                   |
| ------------- | ---------- | -------------------------- | ----------------------------------------- |
| body          | element    | `elementStyles[path]`      | `patchCvElementStyle(style, path, patch)` |
| body          | section    | `sectionStyles[key]`       | `patchCvSectionStyle` (existing)          |
| body          | document   | `CvStyle` root body fields | `patchCvDocumentBody` (new, thin)         |
| title         | this title | `sectionStyles[key].title` | `setSectionTitleStyle` (existing)         |
| title         | all titles | `titleStyle`               | `updateTitleStyle` (existing)             |

New pure reducers mirror the existing pruning discipline (drop inherited/empty values; remove empty maps). Reset at a scope removes only that scope's override for the target.

### Resolution

Extend the body resolver so a leaf's effective style is `elementStyles[path]` layered over `effectiveSectionStyle(style, key)` (which already layers section over document). The renderer applies the resolved per-leaf body style as inline CSS on that leaf in **both** the measurement and page passes (it is typography, not interactivity — both passes must match so pagination is correct). Only interactivity stays page-only.

### Edit-mode reduction (#4)

In `cv-detail.component.html`, the `cv_section_style` card currently holds three groups: body (`updateStyle`), titles (`updateTitleStyle`/`updateStyle({titleBorder})`), and page (`setPageSize`/`setMarginSide`).

- **Remove** the body group and the titles group (and any now-dead handlers/computed/i18n once confirmed unused repo-wide — `updateStyle` may still be used by `Whole document` writes via a different path; verify each before deleting).
- **Keep** the page group (size + margins) and the region select + photo/include-birthdate/include-marital chips (already outside the card).
- **Reset semantics:** the existing `resetAllStyles` / `hasAnyCustomStyle` / "Custom" badge measured body+title customization. Decide during planning: either scope the reset/badge to page-only, or relocate an overall "reset styling" affordance to the preview panel. Do not silently drop the ability to reset.

## Constraints (carry forward from Phase D)

- Local-first, immutable, explicit save; no AI/network introduced.
- Measurement atoms never focusable/event-producing; interactive chrome must not change atom metrics and must not print.
- `elementStyles` persists in `styleJson`; Rust DOCX/list-PDF tolerate and ignore the unknown field (export parity is Phase E — same deferral as `sectionStyles`/`lineHeight`).
- Keep atom ids/order/glue and resting preview output unchanged except for the intended per-element typography.
- Body colour still applies only when explicitly overridden at some scope (do not re-introduce the accent-leak fixed in `015c2e3`); resolution must not force un-overridden body text to the accent.
- EN/DE i18n parity for new panel strings (scope labels, reset).
- Commit subjects are lowercase Conventional Commits; each slice verified.

## Out of scope

- Reordering-stable element identity (UUID migration) — positional keys accepted.
- Export parity for `elementStyles` in Rust DOCX/list-PDF — Phase E.
- Adding new content fields or new section families.

## Open items for the plan

- Exact panel UX for the scope selector (segmented control vs dropdown) and how it defaults per selected part.
- Whether `Whole document` body scope reuses the existing root fields directly or a small wrapper reducer.
- Reset/badge relocation decision (above).
- Path-helper unification between inline-edit draft ids and style keys.

## As-built (Task 6 — hardening, docs, final review)

Implemented essentially as designed, resolving the open items as follows:

- **Scope selector UX:** a plain `<select>` inside the panel (not a segmented control) — three `<option>`s for a body selection (`documents.cv_style_scope_element/section/document`), two for a title (`documents.cv_style_scope_this_title/all_titles`). Default scope on a fresh selection: `element` for a body leaf with a path, `section` for a pathless body selection (a whole-entry/whole-row click) and for a title (`this title`) — the pathless-body default was a fix (`1388ec2`) after the naive "always default `element`" silently dropped edits when there was no `elementPath` to write to.
- **`Whole document` body scope:** a small new reducer, `patchCvDocumentBody(style, patch)`, writes the `CvStyle` root fields (`fontFamily`/`fontSizePt`/`fontWeight`/`accentColorHex`) directly — thinner than reusing the section reducer, and keeps `sectionStyles`/`elementStyles`/`titleStyle` untouched by construction.
- **Reset relocation:** "Reset all styling" moved from Edit mode's Style-card header into the live panel's footer (`CvLiveStylePanelComponent`'s `resetAll` output → `CvDetailComponent.resetAllStyles()`), reachable even with nothing selected, disabled only when the document has no override at any scope (`hasAnyCustomStyle`, extended to also check `elementStyles`).
- **Path-helper unification:** one `leafPath(kind, ...parts)` builder in `cv-content.util.ts` is the single source for both the inline-edit draft id and the `elementStyles`/`CvPreviewSelection.elementPath` key — no separate mapping table, no drift risk.

### a11y / keyboard hardening (Task 6)

- **Scope selector:** already a native `<select>`, so already Tab-reachable and Enter/arrow-operable with the browser's default focus ring (no CSS in this codebase disables `outline` on native controls outside the print stylesheet). Given an explicit `[attr.aria-label]="t()('documents.cv_style_scope_label')"` in addition to its existing visible `<label>` wrapping, for a robust, directly-testable accessible name.
- **Per-leaf accessible names (T2 review minor, fixed):** every per-leaf selectable host used to reuse the generic `selectAriaLabel(key, 'body')` name, so a screen reader announced the identical "Experience — Body text" for an entry's company, industry, location, AND role. A new `leafAriaLabel(sectionKey, field)` helper (`cv-preview.component.ts`) composes the section label with a field-specific label — reusing the SAME i18n field labels already shown in Edit mode's section editors (`documents.cv_field_company`, `_role`, `_bullet`, `_label`, `_language`, …; two new labels, `cv_field_industry`/`cv_field_location`, added EN+DE for the two fields that had no existing short label). Applied to: personal-details fullName/title, experience company/industry/location/role/bullet, skills label/values, and the language value leaf. Whole-entry/whole-row/whole-body wrapper hosts (no single `elementPath`) intentionally keep the generic name — there's nothing to disambiguate there.
- **Nested `role="button"` (accepted, not restructured):** several leaf hosts (e.g. an experience entry's company/role spans) sit INSIDE another selectable host (the whole-entry wrapper), so the rendered DOM has a `role="button"` nested inside another `role="button"`, which is technically non-conforming ARIA. Click handling already relies on `stopPropagation()` in `selectLeaf`/`selectPart` to keep the two independent, and restructuring the DOM (e.g. `aria-owns`, or moving the leaf host outside its section wrapper) would touch the whole selection/layout model for a cosmetic ARIA-validator complaint with no observed assistive-tech failure mode found — judged higher-risk than valuable for this task. Documented here as an accepted trade-off, not fixed.

### Measurement/print verification

- **Typography parity (element scope repaginates):** `leafCss(path)` (the element-scope CSS delta) is bound on the same leaf in both the page-card render and the hidden `.paginated-sheet__measure` mirror, so a per-leaf font-size/line-height override affects the pagination math identically to what's shown — proven for summary, an experience company leaf, a skills values leaf, and a language value leaf (Task 6 added the latter two — T3 review minor).
- **Print/export has no panel/selection/scope chrome:** both print paths (`exportPdfWysiwyg()`, the direct `Cmd/Ctrl+P` `beforeprint` handler) clear the live `selection` before printing, and the global print stylesheet (`apps/desktop/src/styles.scss`) hides `.cvdetail__live-panel` entirely and strips the `.cvpreview__selectable`/`.cvpreview__selected` outlines. Task 6 closed a defensive gap: the per-element `.cvpreview__element-selected` dashed outline (new in this phase) was never added to that same stripping rule — unreachable in practice today (selection is always null at print time), but now covered explicitly rather than relying on that invariant silently. A new static test (`apps/desktop/src/cv-print-css.spec.ts`) locks in the print block's content, mirroring the existing `followup-no-transmit.spec.ts` file-scan pattern (Angular unit tests never render `@media print`, so this is the only way to regression-test it).

### Test-coverage minors folded in (no production-code change)

- `effectiveLeafStyle`/`leafCss`: an empty-string `elementPath`/path now has an explicit test proving it resolves exactly like an absent one (section resolution), including a case where a literal `''` key exists in `elementStyles` to prove the empty path is never used as a real lookup key.
- `patchCvElementStyle`: added the missing reference-equality assertions — the merge-into-existing-override test now also asserts `original`/its nested override object are untouched and `changed !== original`; the sibling-preservation test now asserts the untouched sibling override is the SAME object reference, not just value-equal.

### Known accepted follow-ups (not fixed in Task 6)

- Resetting a section title's `this title` scope clears the title's font/size/weight/colour override but leaves an explicit `titleBorder` override on that section intact (it must be cleared via the `all titles`/document scope or "reset all styling"). Matches the shipped `setSectionTitleStyle` semantics from Phase D; flagged as a possible future UX tweak, not a bug in the T1–T5 contract.
- Coverage gap carried from T2: the personal-details contact line, an education entry's degree/institution, and either entry's date range still render as combined, non-decomposed spans — not individually style-selectable. Only the leaf families enumerated above (and in the plan's path list) are per-leaf styleable today; splitting these combined spans into leaves is a larger follow-up that touches the resting-render markup, deferred pending product input.

### Verification (Task 6)

`npx nx test desktop` (364/364, 26 suites), `npx nx test ui` (32/32), `npx nx test i18n` (1/1) and the desktop `i18n-keys.spec.ts` guard (2/2), `npx nx test core` (35/35), `npx nx build desktop` (clean; only pre-existing warnings: bundle budget, Sass `@import`, `cdkDragPlaceholder`), prettier + eslint on every touched file (only pre-existing non-null-assertion warnings in test files; zero new lint errors — 5 pre-existing lint errors in unrelated `jobs`/`my-jobs` files were left untouched, out of scope).
