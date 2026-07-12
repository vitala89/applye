# CV Live Editor — Per-Element Styling & Edit-Mode Reduction (Phase D.2) — Design

**Status:** Approved design, pending spec review → plan.
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
