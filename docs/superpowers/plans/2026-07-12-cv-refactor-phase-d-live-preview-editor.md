# CV Refactor Phase D — Live Preview Editor — Implementation Plan

**Goal:** Turn the existing CV preview mode into a local-first live editor: users select rendered CV text, edit existing visible content inline, and apply per-section font, size, weight, colour, and line-height overrides from a fixed contextual side panel.

**Resolved product decisions:** Keep the existing same-route Edit/Preview toggle. Use a fixed, sticky contextual side panel rather than a floating selection toolbar. Inline editing swaps a rendered leaf for a native input/textarea with a local draft; commit emits one immutable section change and only then repaginates. Structure changes remain in Edit mode.

**Architecture:** `CvDetailComponent` remains the source of truth for content, style, selection, persistence, safety checks, save, and export. `CvPreviewComponent` remains the single renderer and gains an interactive mode plus semantic selection and immutable section-change outputs. A focused `CvLiveStylePanelComponent` receives the selected section/style and emits semantic style patches/reset actions. Pure helpers hide nested field replacement and recursively prune inherited/empty style overrides. `PaginatedSheetComponent` explicitly distinguishes its hidden measurement render from visible page renders so only visible atoms can be interactive.

**Tech stack:** Angular standalone components and signals, `OnPush`, Jest/Nx, existing `CvContent`/`CvStyle` JSON persistence, shared `PaginatedSheetComponent`. No dependency, SQLite migration, route, AI, network, or package changes.

## Phase D contract and constraints

- Same route: `/documents/cv/:id`; the existing mode toggle owns the transition.
- Fixed contextual panel is authoritative. No floating toolbar in Phase D.
- Existing visible leaves are editable; add/remove/reorder and recovery of empty/non-rendered content remain in Edit mode.
- Native inputs/textareas, not generic `contenteditable`; draft locally, commit on blur or explicit keyboard action, cancel with Escape.
- Summary and bullets edit raw `**bold**` source while resting render continues to show parsed `<strong>` runs.
- All changes are immutable and local. Save remains explicit; no AI call is introduced.
- Measurement atoms are never focusable or event-producing. Interactive chrome must not change atom box metrics and must not print.
- Add body-only `CvSectionStyle.lineHeight?: number`, unitless, range 1.0–2.0. Missing/inherit emits no inline line-height and preserves each existing element's current CSS/browser baseline; the curated Normal choice is `1.45` (the existing `--leading-normal`). Options: 1.2 compact, 1.35 tight, 1.45 normal, 1.6 relaxed. Title spacing is out of scope; `CvTextStyle` is unchanged.
- Phase D applies line height to Angular preview/WYSIWYG PDF and persists it. Rust DOCX/list-PDF tolerate and ignore the unknown field; export parity is Phase E.
- Fix the existing body-colour omission while moving the control: `bodyCss()` must emit the already-resolved `colorHex`.
- Keep atom ids/order/glue rules and read-only preview output unchanged.
- Commit subjects are lowercase Conventional Commits; each logical slice is verified and pushed.

## Public interface

```ts
export interface CvPreviewSelection {
  sectionKey: CvSectionKey;
  part: 'body' | 'title';
}

// CvPreviewComponent additions
interactive = input(false);
selection = input<CvPreviewSelection | null>(null);
selectionChange = output<CvPreviewSelection | null>();
sectionChange = output<CvSection>();
```

The parent continues to use `replaceSection(updated)` and owns style mutations. The style panel emits a section key plus a body/title patch or reset; it never owns persistence.

Body/title selection preserves the existing per-section popover's two styling scopes when those controls move to Preview mode. Line height is offered only for `part: 'body'`; heading controls continue to use `CvTextStyle`. “Reset section” deletes the complete section override (body, title, and border) and is labelled accordingly.

## Task 1 — Style contract and pure override reducer

**Files:**

- Modify `libs/core/src/lib/models/document.model.ts`
- Modify `apps/desktop/src/app/pages/documents/cv-content.util.ts` and spec
- Modify `apps/desktop/src/app/pages/documents/cv-detail/cv-preview/cv-preview.component.ts` and spec

- [ ] RED: absent line height emits no inline override (baseline pagination stays unchanged); an explicit override resolves/emits its value; body CSS exposes the already-resolved colour.
- [ ] RED: semantic body/title patches preserve siblings and recursively remove `undefined`, empty title objects, empty section overrides, and empty `sectionStyles`.
- [ ] GREEN: add the optional model field/default and a pure style-override reducer; use it from the parent setters.
- [ ] Run focused core/desktop tests and build/type-check as appropriate.
- [ ] Commit and push.

## Task 2 — Make pagination measurement explicitly non-interactive

**Files:**

- Modify `libs/ui/src/lib/paginated-sheet/*` and spec
- Modify preview atom contexts/templates only as required

- [ ] RED: measurement outlet context identifies measurement mode; the measurement root is inert/aria-hidden; visible cards identify page mode.
- [ ] GREEN: add a namespaced `$sheetRenderMode: 'measure' | 'page'` outlet-context field plus defense-in-depth inertness without changing atom geometry, ids, ordering, or page packing. Reject/guard an atom context that already supplies the reserved key.
- [ ] Regression: existing CV and cover-letter pagination/preview tests stay green and read-only DOM is unchanged.
- [ ] Commit and push.

## Task 3 — Contextual live-style panel and selection

**Files:**

- Create `cv-detail/cv-live-style-panel/*` (component, template, SCSS, spec)
- Modify `cv-preview.component.*` and spec
- Modify `cv-detail.component.*` and spec
- Modify `libs/i18n/src/lib/translations.ts`

- [ ] RED: interactive visible section/title targets emit semantic selection; non-interactive and measurement renders expose no affordance.
- [ ] RED: panel font/size/weight/colour/line-height changes produce the expected cleaned override; reset removes only the selected section override.
- [ ] GREEN: wire fixed/sticky panel beside paper in Preview mode. Keep parent authoritative and reuse its safety-check debounce.
- [ ] Remove per-section Style buttons/popover from Edit mode; keep theme/global/page controls there.
- [ ] Add minimal EN/DE strings for live-preview hint, empty selection, edit/apply, and line height.
- [ ] Print CSS hides panel/selection/edit chrome.
- [ ] Parent save/load test proves `sectionStyles[key].lineHeight` is serialized to and restored from `styleJson`.
- [ ] Commit and push.

## Task 4 — Inline-edit tracer: summary and personal details

**Files:** preview component/template/SCSS/spec plus a focused pure helper/directive if it deepens the interface

- [ ] RED: drafting emits nothing; blur/apply emits one new immutable section; Escape followed by blur emits nothing and restores resting text.
- [ ] RED: summary focused editor exposes raw `**` markers, resting render preserves `<strong>`, and Cmd/Ctrl+B uses `toggleBoldWrap`.
- [ ] RED: full name, title, and each visible contact source field render as individual leaves in the existing order; separators remain derived/non-editable, and localized fallbacks activate the underlying source field without becoming persisted content.
- [ ] GREEN: add native leaf editors only to visible page renders; measurement mirrors remain typography-identical and non-interactive.
- [ ] Parent integration proves Edit ↔ Live preview synchronization without save/reload.
- [ ] Commit and push.

## Task 5 — Remaining visible leaf mappings

**Files:** preview component/template/spec and pure mapping helper/spec as needed

- [ ] Experience: company, industry, location, role, each source date, and bullets. Date separators and the localized Present fallback remain derived/non-editable.
- [ ] Education: degree, institution, dates.
- [ ] Skills: group label and values.
- [ ] Languages: visible language value; current non-rendered level remains Edit-only.
- [ ] Each test asserts the original section/nested arrays are unchanged and the exact target index changes.
- [ ] Derived section headings, punctuation, page captions, Present fallback, photo, and non-visible empty fields stay non-editable.
- [ ] Commit and push.

## Task 6 — Hardening, cleanup, docs, and final review

- [ ] Keyboard: activation, commit, cancel, visible focus, accessible names, panel semantics, focus return.
- [ ] Export action policy: synchronously commit the active draft, close editor chrome, await Angular render plus a completed pagination measurement, then call `window.print()`.
- [ ] Direct OS/browser print policy: printable markup always contains the last committed canonical text behind the editor overlay and excludes the uncommitted draft/native control.
- [ ] Active-draft tests cover both policies and prove there is no input caret, panel, selection outline, or edit chrome in print.
- [ ] Pagination: drafting does not repaginate; commit triggers measurement; atom ids/order/glue and idle page layout remain unchanged.
- [ ] Keep Phase C cleanup out of functional slices. If dead parent icons or the write-only `blockOverflow` binding are removed, do so in a separate cleanup commit after Phase D is green; defer duplicated editor SCSS consolidation.
- [ ] Run focused tests regularly, then full desktop/ui/i18n/core tests, desktop build, type-check/lint/format checks relevant to changed files.
- [ ] Update `docs/product/CURRENT_STATE.md`, the design spec, and `.superpowers/sdd/progress.md` with behavior, verification, export limitation, and manual gates.
- [ ] Run the required two-axis whole-Phase-D review (standards + spec), fix findings, re-verify, commit, and push.

## Manual Tauri gate

- Keyboard-only select/edit/style/reset across all visible section families.
- Classic and Aurora, A4 and Letter, multi-page repagination after commit.
- Narrow desktop width: fixed panel remains usable without changing paper geometry.
- Export PDF/print contains no interactive chrome and matches committed preview.
- Save/reload preserves content, per-section overrides, and line height.
