# CV Refactor Phase D.2 — Per-Element Styling & Edit-Mode Reduction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users style any CV element at three scopes (this element / this section / whole document; titles: this title / all titles) from the live-preview panel, and remove the document-wide body and title style controls from Edit mode.

**Architecture:** `CvDetailComponent` stays the single source of truth for content, style, persistence, safety, save, export. `CvPreviewComponent` gains element-level selection identity and renders each body leaf with its resolved cascade style. `CvLiveStylePanelComponent` gains a scope selector and emits a scope-tagged patch/reset; the parent maps the scope to the correct write target via pure reducers. Individual body overrides add one new additive map, `elementStyles`, keyed by positional path; titles reuse the existing two-tier storage.

**Tech Stack:** Angular standalone components + signals, `OnPush`, Jest/Nx, existing `CvContent`/`CvStyle` JSON persistence, shared `PaginatedSheetComponent`. No dependency, SQLite migration, route, AI, network, or package changes.

**Design spec:** `docs/superpowers/specs/2026-07-13-cv-live-editor-per-element-styling-design.md`

## Global Constraints

- Cascade resolution, most→least specific: element override → section override → document default → theme seed.
- New storage is additive only: `CvStyle.elementStyles?: Record<string, CvElementStyle>`. No SQLite migration; `styleJson` round-trips the field; Rust DOCX/list-PDF tolerate and ignore it (export parity is Phase E).
- Positional path keys: `summary.body`, `personal_details.<field>`, `experience.<i>.company|industry|location|role`, `experience.<i>.bullet.<b>`, `education.<i>.<field>`, `skills.<i>.label|values`, `languages.<i>`. Reuse one shared path helper for both inline-edit draft ids and style keys.
- Per-leaf body style is typography: it is applied in BOTH the measurement and page render passes so pagination stays correct. Only interactivity stays page-only (`selectable(renderMode)`), never in the measurement pass.
- Body colour applies only when explicitly overridden at some scope — do NOT re-introduce the accent-leak fixed in `015c2e3`. Un-overridden body text keeps its inherited/theme colour.
- All new pure reducers prune inherited/empty values, empty objects, and empty maps (mirror `patchCvSectionStyle`).
- Keep atom ids/order/glue and resting preview output unchanged except for the intended per-element typography.
- EN/DE i18n parity for every new string.
- Local-first, immutable, explicit save; no AI/network introduced.
- Commit subjects are lowercase Conventional Commits; each slice is verified and committed.

## Public interface

```ts
// libs/core/src/lib/models/document.model.ts
export interface CvElementStyle {
  fontFamily?: string;
  fontSizePt?: number;
  fontWeight?: CvFontWeight;
  colorHex?: string;
  lineHeight?: number;
}
export interface CvStyle {
  /* …existing… */
  elementStyles?: Record<string, CvElementStyle>;
}

// apps/desktop/src/app/pages/documents/cv-content.util.ts
export type CvStyleScope = 'element' | 'section' | 'document';
export interface CvPreviewSelection {
  sectionKey: CvSectionKey;
  part: 'body' | 'title';
  elementPath?: string; // set for a body leaf; absent for a title
}
export function patchCvElementStyle(
  style: CvStyle,
  path: string,
  patch: Partial<CvElementStyle>,
): CvStyle;
export function resetCvElementStyle(style: CvStyle, path: string): CvStyle;
export function patchCvDocumentBody(style: CvStyle, patch: Partial<CvElementStyle>): CvStyle;
export function effectiveLeafStyle(
  style: CvStyle,
  key: CvSectionKey,
  elementPath: string | undefined,
): {
  fontFamily: string;
  fontSizePt: number;
  fontWeight: CvFontWeight;
  colorHex?: string;
  lineHeight?: number;
};

// CvLiveStylePanelComponent → parent
export interface CvStylePanelChange {
  scope: CvStyleScope; // for body; for a title, 'section' = this title, 'document' = all titles
  patch?: Partial<CvElementStyle>;
  reset?: boolean;
}
```

The parent maps a `CvStylePanelChange` for the current `selection` to a write:

| part  | scope    | write target               | reducer                                                  |
| ----- | -------- | -------------------------- | -------------------------------------------------------- |
| body  | element  | `elementStyles[path]`      | `patchCvElementStyle` / `resetCvElementStyle`            |
| body  | section  | `sectionStyles[key]`       | `patchCvSectionStyle` / `resetCvSectionStyle` (existing) |
| body  | document | `CvStyle` root body fields | `patchCvDocumentBody` (existing root fields)             |
| title | section  | `sectionStyles[key].title` | `setSectionTitleStyle` (existing)                        |
| title | document | `titleStyle`               | `updateTitleStyle` (existing)                            |

`colorHex` is emitted in a patch only when the user actually sets a colour (preserve the `015c2e3` no-accent-leak rule); resolution never forces un-overridden body text to a colour.

## Task 1 — Model, element/document reducers, and leaf resolver

**Files:**

- Modify `libs/core/src/lib/models/document.model.ts`
- Modify `apps/desktop/src/app/pages/documents/cv-content.util.ts` and spec

- [ ] RED: `patchCvElementStyle` writes/merges an override under `elementStyles[path]`, prunes inherited/empty values, removes an empty element override, and removes an empty `elementStyles` map; siblings preserved. `resetCvElementStyle` removes only that path.
- [ ] RED: `patchCvDocumentBody` updates the `CvStyle` root body fields (`fontFamily`/`fontSizePt`/`fontWeight`/`accentColorHex`) from an element-style patch (map `colorHex`→`accentColorHex`) without touching `sectionStyles`/`elementStyles`/`titleStyle`.
- [ ] RED: `effectiveLeafStyle(style, key, path)` layers `elementStyles[path]` over `effectiveSectionStyle(style, key)`; absent path returns the section resolution unchanged; `colorHex` stays `undefined` unless explicitly overridden at some scope; `lineHeight` validated 1.0–2.0.
- [ ] GREEN: add `CvElementStyle` + `CvStyle.elementStyles`, the two element reducers, `patchCvDocumentBody`, and `effectiveLeafStyle` (reuse `isValidCvLineHeight`).
- [ ] Run focused core/desktop tests + type-check.
- [ ] Commit.

## Task 2 — Element-level selection identity and shared path helper

**Files:**

- Modify `apps/desktop/src/app/pages/documents/cv-content.util.ts` and spec (extend `CvPreviewSelection`; add/rename a shared `leafPath` helper)
- Modify `cv-preview.component.ts`/`.html` and spec

- [ ] RED: the existing inline-edit draft ids and the new style-selection paths come from ONE helper — assert the helper returns the canonical path for representative leaves (`summary.body`, `experience.1.role`, `experience.1.bullet.0`, `skills.0.values`, `languages.0`).
- [ ] RED: clicking a body leaf on a selectable page render emits `CvPreviewSelection` with the correct `elementPath`; clicking a section title emits `part:'title'` with no `elementPath`; measurement/non-interactive renders emit nothing; the Phase-D focus-trap guard still holds (no redundant re-emit for the identical selection incl. same `elementPath`).
- [ ] GREEN: add `elementPath` to `CvPreviewSelection`, unify the path helper, thread the path through `selectPart`/leaf hosts. Keep `isSelected` semantics correct (a leaf is "selected" when its section+part match; element highlight keyed by `elementPath`).
- [ ] Run focused desktop tests.
- [ ] Commit.

## Task 3 — Render each body leaf with its resolved cascade style

**Files:**

- Modify `cv-preview.component.ts`/`.html` and spec

- [ ] RED: a body leaf with an `elementStyles[path]` override renders that resolved style (font/size/weight/color/line-height) as inline CSS; with no element override it falls back to the section then document then theme value; the SAME resolved style is present in the measurement mirror (typography parity — pagination correctness).
- [ ] RED: an un-overridden leaf emits no `color` (no accent leak); an explicitly overridden colour appears.
- [ ] GREEN: add a `leafCss(key, path)` binding built from `effectiveLeafStyle`, applied per leaf in both passes; keep the existing per-section `bodyCss` for the section wrapper (element style layers on top for the specific leaf).
- [ ] Regression: existing preview/pagination tests stay green; atom ids/order/glue unchanged.
- [ ] Commit.

## Task 4 — Panel scope selector and scope→write mapping

**Files:**

- Modify `cv-detail/cv-live-style-panel/*` (component, template, SCSS, spec)
- Modify `cv-detail.component.*` and spec
- Modify `libs/i18n/src/lib/translations/translations.ts`

- [ ] RED: for a body selection the panel offers three scopes (element/section/document); for a title selection two (this title/all titles); changing a control emits `CvStylePanelChange` with the active scope and the cleaned patch; reset emits `{ scope, reset:true }`.
- [ ] RED: the parent maps each `(part, scope)` to the correct reducer/target per the interface table and applies it immutably; the parent keeps the existing safety-check debounce.
- [ ] RED: default scope on new selection is `element` for a body leaf and `section` (this title) for a title; switching scope re-targets subsequent edits.
- [ ] GREEN: add the scope selector + emit; wire the parent mapping using `patchCvElementStyle`/`resetCvElementStyle`/`patchCvSectionStyle`/`patchCvDocumentBody`/`setSectionTitleStyle`/`updateTitleStyle`.
- [ ] Add EN/DE strings for the three body scopes, two title scopes, and any reset label (parity).
- [ ] Print CSS still hides panel/selection chrome.
- [ ] Commit.

## Task 5 — Remove body/title style groups from Edit mode; relocate reset

**Files:**

- Modify `cv-detail.component.html`/`.ts`/`.scss` and spec
- Modify `cv-live-style-panel/*` (add a "reset all styling" affordance) and spec
- Modify `libs/i18n/src/lib/translations/translations.ts` if labels change

- [ ] RED: Edit mode no longer renders the `cv_style_group_body` (BODY TEXT) or `cv_style_group_titles` (SECTION TITLES) groups; the `cv_style_group_page` group (page size + margins) and the region/photo/include chips remain.
- [ ] RED: a "reset all styling" action in the preview panel clears every style override back to the theme (`elementStyles`, `sectionStyles`, `titleStyle`, and document body root overrides) and leaves content + page + region untouched.
- [ ] GREEN: delete the two groups from the Edit template; remove now-dead handlers/computed/SCSS/i18n after verifying each is unused repo-wide (`updateStyle` is still used by the document-body scope path — keep it; `updateTitleStyle` still used by all-titles scope — keep it). Re-home the "Custom" badge / `hasAnyCustomStyle` / `resetAllStyles` logic to drive the panel's reset-all (or scope it out of Edit) — do not drop the reset capability.
- [ ] Parent save/load test still proves per-section + element + document overrides serialize to and restore from `styleJson`.
- [ ] Commit.

## Task 6 — Hardening, docs, and final review

- [ ] Keyboard: scope selector reachable and operable; visible focus; accessible names for scope controls; focus behaviour unchanged elsewhere.
- [ ] Verify measurement/page typography parity for element overrides (a per-leaf size/line-height change repaginates on commit and both passes measure identically).
- [ ] Confirm print/export contains no panel/selection/scope chrome and matches the committed styled preview.
- [ ] Run focused tests regularly, then full desktop/ui/i18n/core suites, desktop build, and type-check/lint/format on changed files.
- [ ] Update `docs/product/CURRENT_STATE.md`, the design spec, and `.superpowers/sdd/progress.md` with behaviour, the three-scope model, the Edit-mode reduction, verification, and the Phase E export-parity limitation.
- [ ] Run the two-axis whole-Phase-D.2 review (standards + spec), fix findings, re-verify, commit.

## Manual Tauri gate

- Style a single element, then the section, then the whole document; confirm the cascade and that narrower scopes win.
- Style one section title vs all titles.
- Classic and Aurora, A4 and Letter: element size/line-height change repaginates correctly across pages.
- Edit mode shows only page + region; no body/title style groups; reset-all in the preview returns to the theme look.
- Save/reload preserves content, per-section, per-element, document, and title overrides.
- Export/print contains no interactive chrome and matches the styled preview.
