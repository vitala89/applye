# CV Refactor Phase C — Decompose the God Component — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break `cv-detail.component` (1138 TS / 1253 HTML / 876 SCSS) into focused, testable units — a presentational `CvPreviewComponent` and six per-section editor components — **with zero behavior change**. Same screen, same controls, same output; only the file boundaries change. Every existing test stays green (migrated to the child that now owns the logic).

**Architecture:** `cv-detail` becomes an orchestrator that owns the source-of-truth signals (`sections`, `style`, `themeId`, photo signals, metadata) and wires children. The preview column (markup + 8 `<ng-template>` atoms + `atoms()`/`geometry()`/`themeVars()`/styling methods + `<lib-paginated-sheet>`) moves as one indivisible unit into `CvPreviewComponent` behind a read-only `@Input` surface with a single `blockOverflow` output. Each `@switch (section.key)` arm moves into a `Cv*SectionEditorComponent` with a `[section]` input and a `(sectionChange)` output, converting in-place mutation to immutable emit-up. The per-section style popover and the global style panel **stay in the parent** this phase (they move in Phase D). No responsibility is added or removed — this is a structural refactor only.

**Tech Stack:** Angular standalone components, `OnPush`, signal inputs/outputs (`input()`, `output()`), Jest via `nx test desktop`. Follow the existing style of the sibling child `CvPhotoCropComponent` for input/output declarations.

## Global Constraints

- **Behavior-preserving.** No visible change, no output change (preview render, pagination, print PDF, DOCX all identical). If a change would alter behavior, it does not belong in Phase C.
- **All existing tests stay green.** `cv-detail.component.spec.ts` has 31 `it`s. Tests that assert logic which moves to a child migrate to that child's spec; tests for logic that stays remain. Net: no test is deleted without an equivalent assertion living in the new owner's spec. `nx test desktop` total count must not drop.
- **No new dependencies, no `@applye/core` type changes, no Rust changes.** Only new component files under `apps/desktop/src/app/pages/documents/cv-detail/` and edits to the existing `cv-detail.*` and shared `cv-content.util.ts` (re-exports only if needed).
- **Match the codebase's modern Angular idiom:** signal inputs (`input.required<T>()`), signal outputs (`output<T>()`), `viewChild.required`, `@if`/`@for`/`@switch` control flow, `computed`. Mirror `CvPhotoCropComponent`.
- **Immutable updates.** Section editors must emit a new `CvSection` object (and new nested arrays/objects) on change — never mutate the `[section]` input in place. The parent replaces the section in `sections()` by `key`.
- Commit subjects lowercase (commitlint: no sentence/start/pascal/upper case); Conventional Commit format; end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.
- Every commit passes repo pre-commit hooks (lint-staged: prettier + lint on staged files).

## File structure (target)

```
cv-detail/
  cv-detail.component.ts|html|scss|spec.ts        (orchestrator — shrinks)
  cv-preview/
    cv-preview.component.ts|html|scss|spec.ts     (NEW — presentational preview)
  section-editors/
    cv-summary-editor.component.ts|html|spec.ts        (NEW)
    cv-languages-editor.component.ts|html|spec.ts       (NEW)
    cv-skills-editor.component.ts|html|spec.ts          (NEW)
    cv-education-editor.component.ts|html|spec.ts        (NEW)
    cv-experience-editor.component.ts|html|spec.ts       (NEW)
    cv-personal-details-editor.component.ts|html|spec.ts (NEW)
  cv-photo-crop/ … (unchanged)
```

Section-editor SCSS: reuse the shared `.docedit-*` primitives (already in `_editor-shell.scss`) and the existing `.cvdetail__*` field styles — keep those in the parent SCSS and rely on non–view-encapsulated shared styles, OR move the specific field styles per editor. Prefer keeping shared `.docedit-*`/`.cvdetail__field*` in place and giving each editor minimal own styles; do not duplicate.

---

### Task 1: Extract `CvPreviewComponent`

The preview column is one indivisible unit — the 8 `<ng-template>` atom refs are consumed only by `atoms()`, so templates + `atoms()`/`geometry()`/`themeVars()`/styling methods move together.

**Files:**

- Create: `cv-detail/cv-preview/cv-preview.component.ts` | `.html` | `.scss` | `.spec.ts`
- Modify: `cv-detail/cv-detail.component.ts` (remove moved members, render `<app-cv-preview>`), `.html` (replace preview column ~1037–1246 with the element), `.scss` (move `.cvpreview__*` + print rules)
- Modify: `cv-detail/cv-detail.component.spec.ts` (migrate preview tests out)

**Interfaces:**

- `CvPreviewComponent` inputs (signal `input.required`): `sections: CvSection[]`, `style: CvStyle`, `themeId: number`, `includePhoto: boolean`, `photoDataUri: string | null`, `photoPlacement: PhotoPlacement`.
- Output: `blockOverflow = output<boolean>()`.
- Moves INTO the child (from `cv-detail.component.ts`): `PX_PER_MM` (296), `geometry` (298), `atoms` (328), `previewSections` (613), `themeVars` (245), `activeTheme` (234 — recomputed from the `themeId` input), the 8 `viewChild.required` template refs (316–323), and pure methods `effStyle` (440), `bodyCss` (445), `titleCss` (455), `titleBorderCss` (470), `hasExplicitTitleBorder` (481), `runs` (157), `headerPlacementClass` (1012). Plus the util imports these use (`effectiveSectionStyle`, `effectiveTitleStyle`, `effectiveTitleBorder`, `buildContactLine`, `orderedVisibleSections`, `sectionLabelKey`, `resolvePageSettings`) and `PaginatedSheetComponent`.
- STAYS in parent: `sections`, `style`, `themeId`, `includePhoto`, `photoDataUri`, `photoPlacement` (source of truth), `blockOverflow` signal (parent binds child output to it for the overflow warning + export), `exportPdfWysiwyg` (see step 5).

- [ ] **Step 1: Scaffold the component**

Create `cv-preview.component.ts` as a standalone `OnPush` component, `selector: 'app-cv-preview'`, imports `[NgStyle, NgTemplateOutlet, PaginatedSheetComponent, LucideAngularModule]` (drop any it doesn't use). Inject `TranslateService` (for `t`/labels) — mirror how `cv-detail` uses `this.i18n.t`. Declare the six inputs and the `blockOverflow` output listed above. Move `activeTheme` as `computed(() => getBuiltinTheme(this.themeId()))`.

- [ ] **Step 2: Move the preview markup + templates into `cv-preview.component.html`**

Cut `cv-detail.component.html` lines ~1037–1246 (the `.cvpreview-viewport` block through the last atom template `#languagesTpl`) into `cv-preview.component.html`. Rewrite references: `sections()` → `sections()` (input signal), `themeVars()`/`atoms()`/`geometry()` unchanged (now local), method calls unchanged. The `<app-cv-photo-crop>` at 1248 stays in the PARENT (it's editor state), not the preview.

- [ ] **Step 3: Move the SCSS**

Move `.cvpreview__*` rules and the preview/print rules (`cv-detail.component.scss` ~679–874, including the `@page`/`body.printing-cv` preview rules) into `cv-preview.component.scss`. Print rules that must apply globally during `window.print()` (`body.printing-cv` scoping) may need `:host-context(body.printing-cv)` or to remain a global rule — verify the printed output is unchanged (step 5).

- [ ] **Step 4: Wire the parent**

In `cv-detail.component.html`, replace the removed preview column with:

```html
<app-cv-preview
  [sections]="sections()"
  [style]="style()"
  [themeId]="themeId()"
  [includePhoto]="includePhoto()"
  [photoDataUri]="photoDataUri()"
  [photoPlacement]="photoPlacement()"
  (blockOverflow)="blockOverflow.set($event)"
/>
```

Add `CvPreviewComponent` to `cv-detail`'s imports; remove the now-unused imports (`NgTemplateOutlet`, `PaginatedSheetComponent`, the moved util imports) and the moved class members. Keep `blockOverflow` signal in the parent (its overflow warning `@if (blockOverflow())` stays where it is, in the editor column).

- [ ] **Step 5: Verify print/export unchanged**

`exportPdfWysiwyg()` stays in the parent. Confirm it still toggles `body.printing-cv` and injects the `@page` rule, and that the print CSS now living in the child still applies (the class is on `<body>`, so the child's `:host-context(body.printing-cv) .cvpreview…` or a retained global rule must match). If the printed sheet regresses, keep the `body.printing-cv` print block as a global style (parent scss or `libs/ui` global) rather than encapsulated in the child. Manually confirm via the desktop preview if available; otherwise assert the DOM contract in the existing export test.

- [ ] **Step 6: Migrate preview tests**

Move these `it`s from `cv-detail.component.spec.ts` into a new `cv-preview.component.spec.ts` (instantiate `CvPreviewComponent` with `componentRef.setInput(...)` for each input): geometry A4 (170), Letter width (180), renders sheet (188), experience splits to head+bullet atoms (197), section-start spacing (281), effective font no mono fallback (228), title vs body fonts (258), `titleCss`/`bodyCss`/`titleBorderCss` mapping (380), summary `**bold**`→`<strong>` (318), Aurora teal + showIndustry (418), explicit titleBorder beats Aurora (446), photo placement default+chip render side (the render half of 330/336 — the toggle half stays with the editor). Keep in the parent spec: `mergePersonalField`, per-section style writers, collapse/popover, `hasAnyCustomStyle`, photo toggle/`removePhoto`, reorder locks, `exportPdfWysiwyg`.

- [ ] **Step 7: Green gate + commit**

Run: `npx nx test desktop 2>&1 | tail -14 && npx nx build desktop 2>&1 | tail -8`
Expected: total test count unchanged from before Task 1; all pass; build clean.

```bash
git add apps/desktop/src/app/pages/documents/cv-detail
git commit -m "refactor(documents): extract cv-preview presentational component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Extract summary + languages editors

Simplest arms (single field / flat list). Establishes the `[section]` in / `(sectionChange)` out pattern.

**Files:**

- Create: `section-editors/cv-summary-editor.component.ts|html|spec.ts`, `section-editors/cv-languages-editor.component.ts|html|spec.ts`
- Modify: `cv-detail.component.html` (replace the `@case 'summary'` 565–586 and `@case 'languages'` 794–834 arm bodies with the elements), `cv-detail.component.ts` (remove `addLanguage`/`removeLanguage`; keep `runs` only if still used by parent — it moved to preview, so remove from parent if unused)

**Interfaces:**

- `CvSummaryEditorComponent`: input `section: CvSummarySection`; output `sectionChange = output<CvSummarySection>()`. Owns the bold-field textarea + `toggleBoldWrap`/`applyBold`/`onBoldKeydown` for the summary (move these from parent; parent keeps them only if a remaining editor uses them — bullets in experience do, so `applyBold`/`onBoldKeydown` are shared: put the shared bold helpers in a tiny exported util or a base, or duplicate the 3-line handlers per editor — prefer moving the pure `toggleBoldWrap` usage; `applyBold(el,set)` stays generic and can live in each editor that needs it).
- `CvLanguagesEditorComponent`: input `section: CvLanguagesSection`; output `sectionChange = output<CvLanguagesSection>()`. Owns add/remove language.

- [ ] **Step 1: Build `CvSummaryEditorComponent`** — move the `@case 'summary'` markup into its template; on textarea input emit `{ ...section, text }`; move the summary bold button + keydown. Standalone `OnPush`, imports `[FormsModule, LucideAngularModule, ButtonDirective]`.

- [ ] **Step 2: Build `CvLanguagesEditorComponent`** — move `@case 'languages'` markup; `addLanguage()` emits `{ ...section, items: [...section.items, blank] }`; `removeLanguage(i)` emits with the item filtered out; field edits emit an immutably-updated `items`.

- [ ] **Step 3: Wire parent** — in the `@switch`, replace the two arms with `<app-cv-summary-editor [section]="$any(section)" (sectionChange)="replaceSection($event)" />` and the languages equivalent. Add a parent helper `replaceSection(updated: CvSection)` that does `this.sections.update(list => list.map(s => s.key === updated.key ? updated : s))`. Add both components to imports; remove the moved methods.

- [ ] **Step 4: Tests** — new specs assert: summary emits updated text + bold wrap; languages add/remove/edit emit correct immutable sections. Add a small parent test that `replaceSection` swaps by key. Migrate any existing summary/languages editing assertions.

- [ ] **Step 5: Green gate + commit**

Run: `npx nx test desktop 2>&1 | tail -14`

```bash
git add apps/desktop/src/app/pages/documents/cv-detail
git commit -m "refactor(documents): extract summary and languages section editors

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Extract skills + education editors

**Files:**

- Create: `section-editors/cv-skills-editor.component.*`, `section-editors/cv-education-editor.component.*` (+ specs)
- Modify: `cv-detail.component.html` (`@case 'skills'` 735–793, `@case 'education'` 683–734), `cv-detail.component.ts` (remove `addSkillGroup`/`removeSkillGroup`/`addSkill`; move `addEntry`/`removeBullet`-for-education into the education editor — note `addEntry` is shared with experience, so keep a generic version or give each its own; prefer per-editor local `addEntry` since the blank-entry shape differs)

**Interfaces:**

- `CvSkillsEditorComponent`: input `section: CvSkillsSection`; output `sectionChange = output<CvSkillsSection>()`. Owns skill-group add/remove and add-skill.
- `CvEducationEditorComponent`: input `section: CvEducationSection`; output `sectionChange = output<CvEducationSection>()`. Owns education entry add/remove + `blankEducationEntry` (already in `cv-content.util.ts`).

- [ ] **Step 1: Build both editors** following the Task 2 pattern (immutable emit-up).
- [ ] **Step 2: Wire parent** — replace both arms with the elements bound to `replaceSection`; remove moved methods; add imports.
- [ ] **Step 3: Tests** — specs assert add/remove/edit emit correct immutable sections; migrate existing assertions.
- [ ] **Step 4: Green gate + commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-detail
git commit -m "refactor(documents): extract skills and education section editors

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Extract experience editor

Most complex arm — entries with nested bullets + industry.

**Files:**

- Create: `section-editors/cv-experience-editor.component.*` (+ spec)
- Modify: `cv-detail.component.html` (`@case 'experience'` 587–682), `cv-detail.component.ts` (remove `addEntry`/`addBullet`/`removeBullet` for experience + the bold helpers if now only used here)

**Interfaces:**

- `CvExperienceEditorComponent`: input `section: CvExperienceSection`; output `sectionChange = output<CvExperienceSection>()`. Owns add/remove entry, add/remove bullet, industry field, and the bullet bold button (`applyBold`/`onBoldKeydown` on each bullet input). Uses `blankExperienceEntry` from `cv-content.util.ts`.

- [ ] **Step 1: Build the editor** — nested immutable updates: editing bullet `j` of entry `i` emits `{ ...section, entries: entries.map((e,ei) => ei===i ? { ...e, bullets: e.bullets.map((b,bj) => bj===j ? val : b) } : e) }`. Add/remove entry and bullet likewise immutable.
- [ ] **Step 2: Wire parent** — replace the arm; remove moved methods; add import.
- [ ] **Step 3: Tests** — assert add entry, add/remove bullet, edit bullet, industry edit, and bullet bold all emit correct immutable sections. This is the highest-risk immutability surface — cover it well.
- [ ] **Step 4: Green gate + commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-detail
git commit -m "refactor(documents): extract experience section editor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Extract personal-details editor

Fields + field-toggles + ATS notes + profile-pull (AI stays in parent).

**Files:**

- Create: `section-editors/cv-personal-details-editor.component.*` (+ spec)
- Modify: `cv-detail.component.html` (`@case 'personal_details'` 484–564), `cv-detail.component.ts` (move `mergePersonalField` usage; keep `pullFromProfile` AI call in parent)

**Interfaces:**

- `CvPersonalDetailsEditorComponent`: inputs `section: CvPersonalDetailsSection`, `includeBirthdate: boolean`, `includeMaritalStatus: boolean`, `atsNoteKeys: string[]`, `pulling: boolean`. Outputs `sectionChange = output<CvPersonalDetailsSection>()`, `includeBirthdateChange = output<boolean>()`, `includeMaritalStatusChange = output<boolean>()`, `pullProfile = output<void>()`.
- `pullFromProfile()` (AI) STAYS in the parent; the parent binds `(pullProfile)="pullFromProfile()"`. `mergePersonalField` (exported free fn, 93–98) stays exported in the parent module or moves to `cv-content.util.ts` — prefer moving it to `cv-content.util.ts` so both the editor and the parent's `pullFromProfile` merge use the same helper (verify its existing import sites).

- [ ] **Step 1: Decide `mergePersonalField` home** — grep its usages; if used by both the editor and parent `pullFromProfile`, move it to `cv-content.util.ts` and update imports (keep behavior identical; it already has tests — move those tests with it or keep them pointing at the new import).
- [ ] **Step 2: Build the editor** — fields emit immutably; the two toggles emit their `*Change` outputs; ATS notes render from `atsNoteKeys` input; the "pull from profile" button emits `pullProfile` and shows a spinner from `pulling`.
- [ ] **Step 3: Wire parent** — replace the arm; bind toggles to `includeBirthdate`/`includeMaritalStatus` signals, `(pullProfile)` to `pullFromProfile()`, `[pulling]="pullingProfile()"`; remove moved markup.
- [ ] **Step 4: Tests** — assert field edits emit immutable section; toggles emit; `pullProfile` fires. Keep/adjust the `mergePersonalField` tests at their new home. Keep parent test that `pullFromProfile` still merges into `sections`.
- [ ] **Step 5: Green gate + commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-detail
git commit -m "refactor(documents): extract personal-details section editor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Verify gate + orchestrator confirmation

**Files:** none modified — verification only.

- [ ] **Step 1: Confirm the parent shrank** — Run: `wc -l apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html`. Expected: both materially smaller than the 1138 / 1253 baseline (the six arms + preview column are gone). Record the new counts.

- [ ] **Step 2: Confirm no behavior drift** — Run: `npx nx test desktop 2>&1 | tail -14`. Expected: total test count ≥ the pre-Phase-C count (moved tests re-homed, new editor tests added); all pass.

- [ ] **Step 3: Build clean** — Run: `npx nx build desktop 2>&1 | tail -8`. Expected: only pre-existing warnings.

- [ ] **Step 4: Manual smoke (if desktop build available)** — open a CV: confirm the editor arms, the live preview, theme switch, photo placement, per-section style popover, summary/bullet bold, add/remove entry/bullet/skill/language, save, and Export PDF all behave exactly as before.

- [ ] **Step 5: No commit** — verification only. Phase C complete.

## Self-Review

- **Spec coverage:** Spec Phase C = "extract `CvPreviewComponent` + section editors + style-panel split; edit=structure+theme+global, per-section visual controls move out." This plan implements the extraction (Tasks 1–5) but **defers the per-section-controls move to Phase D** per the approved C/D refinement — the style panel and per-section popover stay in the parent this phase. That deferral is explicit in Global Constraints and the Architecture note, and was agreed with the user. No orphaned spec requirement: the "move controls" requirement is reassigned to Phase D, not dropped.
- **Placeholder scan:** Refactor tasks specify interfaces (inputs/outputs/moved members), exact source line ranges to move, parent wiring snippets, and test-migration lists rather than re-transcribing existing code — appropriate for a move-refactor where the code already exists. The immutable-update pattern is shown concretely (Task 4 Step 1). No TBD/TODO.
- **Type consistency:** `replaceSection(updated: CvSection)` used consistently across Tasks 2–5; each editor's `(sectionChange)` emits its concrete `Cv*Section` type; parent maps by `key`. `input.required<T>()`/`output<T>()` idiom stated once in Global Constraints and reused.
- **Test integrity:** Global Constraints forbid dropping a test without re-homing its assertion; Task 6 Step 2 gates on total count not decreasing. The riskiest surface (experience nested immutability) gets dedicated coverage in Task 4 Step 3.
