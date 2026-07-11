# CV Section Title/Body Style Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each CV section style its title and body text independently (font, size, weight, colour) plus a configurable title underline, in the preview and WYSIWYG PDF.

**Architecture:** Extend the existing document→section style cascade with a parallel "title" dimension. Document-wide `CvStyle`'s existing fields stay as the body defaults; add `titleStyle`/`titleBorder`. Per-section `CvSectionStyle`'s existing fields stay as the body override; add `title`/`titleBorder`. Resolution produces two effective styles (title, body) per section; preview templates bind each separately. Frontend-only — Rust ignores the new fields (no `deny_unknown_fields`).

**Tech Stack:** Angular 21 (standalone, signals), Nx monorepo, Jest, SCSS.

## Global Constraints

- Preview + WYSIWYG PDF only. No Rust / DOCX / TeX / cover-letter code changes.
- Model additions are all optional fields (no data migration; existing styles keep working).
- i18n: every new key added to BOTH `TRANSLATIONS.en` and `TRANSLATIONS.de` (the `i18n-keys.spec.ts` parity test must stay green).
- `CvFontWeight = 300 | 400 | 600 | 700`.
- Keep the `cvpreview__section-start` spacing class from the prior fix intact.
- Run tests with: `npx nx test desktop --testFile=<file>`.

---

### Task 1: Model + resolution helpers

**Files:**

- Modify: `libs/core/src/lib/models/document.model.ts` (near `CvSectionStyle` ~line 266 and `CvStyle` ~line 276)
- Modify: `apps/desktop/src/app/pages/documents/cv-content.util.ts` (near `effectiveSectionStyle` ~line 509)
- Test: `apps/desktop/src/app/pages/documents/cv-content.util.spec.ts`

**Interfaces:**

- Produces:
  - `type CvBorderStyle = 'none' | 'solid' | 'dotted' | 'dashed'`
  - `interface CvTextStyle { fontFamily?: string; fontSizePt?: number; fontWeight?: CvFontWeight; colorHex?: string }`
  - `CvStyle.titleStyle?: CvTextStyle`, `CvStyle.titleBorder?: CvBorderStyle`
  - `CvSectionStyle.title?: CvTextStyle`, `CvSectionStyle.titleBorder?: CvBorderStyle`
  - `effectiveTitleStyle(style: CvStyle, key: CvSectionKey): { fontFamily: string; fontSizePt: number; fontWeight: CvFontWeight; colorHex: string }`
  - `effectiveTitleBorder(style: CvStyle, key: CvSectionKey): CvBorderStyle`
  - `effectiveSectionStyle` unchanged (= body).

- [ ] **Step 1: Write the failing test**

Add to `cv-content.util.spec.ts`:

```ts
import {
  effectiveSectionStyle,
  effectiveTitleStyle,
  effectiveTitleBorder,
} from './cv-content.util';
import { CvStyle } from '@applye/core';

describe('title/body style resolution', () => {
  const base: CvStyle = {
    fontFamily: 'Calibri',
    fontSizePt: 11,
    accentColorHex: '#333333',
    fontWeight: 400,
  };

  it('title falls back to document titleStyle, then to body defaults', () => {
    const s: CvStyle = { ...base, titleStyle: { fontFamily: 'Georgia', fontSizePt: 14 } };
    const t = effectiveTitleStyle(s, 'summary');
    expect(t.fontFamily).toBe('Georgia'); // from titleStyle
    expect(t.fontSizePt).toBe(14); // from titleStyle
    expect(t.fontWeight).toBe(400); // falls back to body default
    expect(t.colorHex).toBe('#333333'); // falls back to accentColorHex
  });

  it('per-section title override beats document titleStyle', () => {
    const s: CvStyle = {
      ...base,
      titleStyle: { fontFamily: 'Georgia' },
      sectionStyles: { skills: { title: { fontFamily: 'Arial', fontSizePt: 16 } } },
    };
    const t = effectiveTitleStyle(s, 'skills');
    expect(t.fontFamily).toBe('Arial');
    expect(t.fontSizePt).toBe(16);
  });

  it('body resolution is unchanged (section body over document body)', () => {
    const s: CvStyle = { ...base, sectionStyles: { skills: { fontFamily: 'Arial' } } };
    expect(effectiveSectionStyle(s, 'skills').fontFamily).toBe('Arial');
    expect(effectiveSectionStyle(s, 'summary').fontFamily).toBe('Calibri');
  });

  it('titleBorder resolves section over document over default solid', () => {
    expect(effectiveTitleBorder(base, 'summary')).toBe('solid');
    expect(effectiveTitleBorder({ ...base, titleBorder: 'none' }, 'summary')).toBe('none');
    expect(
      effectiveTitleBorder(
        { ...base, titleBorder: 'none', sectionStyles: { skills: { titleBorder: 'dotted' } } },
        'skills',
      ),
    ).toBe('dotted');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test desktop --testFile=cv-content.util.spec.ts`
Expected: FAIL — `effectiveTitleStyle`/`effectiveTitleBorder` not exported.

- [ ] **Step 3: Add the model types**

In `document.model.ts`, add above `CvSectionStyle` (~line 266):

```ts
export type CvBorderStyle = 'none' | 'solid' | 'dotted' | 'dashed';

/** Font properties for one text group (a section's title or its body). All
 * optional; an unset field inherits its parent in the style cascade. */
export interface CvTextStyle {
  fontFamily?: string;
  fontSizePt?: number;
  fontWeight?: CvFontWeight;
  colorHex?: string;
}
```

Extend `CvSectionStyle` (existing fields are the BODY override):

```ts
export interface CvSectionStyle {
  fontFamily?: string;
  fontSizePt?: number;
  colorHex?: string;
  fontWeight?: CvFontWeight;
  /** Per-section title override; unset fields inherit the document title style. */
  title?: CvTextStyle;
  /** Per-section title underline; unset inherits the document title border. */
  titleBorder?: CvBorderStyle;
}
```

Extend `CvStyle` (existing top-level fields are the BODY defaults):

```ts
export interface CvStyle {
  fontFamily: string;
  fontSizePt: number;
  accentColorHex: string;
  fontWeight: CvFontWeight;
  sectionStyles?: Partial<Record<CvSectionKey, CvSectionStyle>>;
  /** Document-wide defaults for section titles; unset fields inherit the body. */
  titleStyle?: CvTextStyle;
  /** Document-wide title underline style; defaults to 'solid' when unset. */
  titleBorder?: CvBorderStyle;
  page?: PageSettings;
}
```

- [ ] **Step 4: Add the resolution helpers**

In `cv-content.util.ts`, after `effectiveSectionStyle` (~line 520), add. Note the import of the new types at the top of the file (add `CvBorderStyle`, `CvTextStyle` to the existing `@applye/core` import):

```ts
/** Resolved title style for a section: per-section title override, then the
 * document-wide `titleStyle`, then the document body defaults as the ultimate
 * fallback so every property is a concrete value. */
export function effectiveTitleStyle(
  style: CvStyle,
  key: CvSectionKey,
): { fontFamily: string; fontSizePt: number; fontWeight: CvFontWeight; colorHex: string } {
  const t: CvTextStyle = style.sectionStyles?.[key]?.title ?? {};
  const d: CvTextStyle = style.titleStyle ?? {};
  return {
    fontFamily: t.fontFamily ?? d.fontFamily ?? style.fontFamily,
    fontSizePt: t.fontSizePt ?? d.fontSizePt ?? style.fontSizePt,
    fontWeight: t.fontWeight ?? d.fontWeight ?? style.fontWeight,
    colorHex: t.colorHex ?? d.colorHex ?? style.accentColorHex,
  };
}

/** Resolved title underline: per-section, then document-wide, then 'solid'. */
export function effectiveTitleBorder(style: CvStyle, key: CvSectionKey): CvBorderStyle {
  return style.sectionStyles?.[key]?.titleBorder ?? style.titleBorder ?? 'solid';
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx nx test desktop --testFile=cv-content.util.spec.ts`
Expected: PASS (all resolution tests green).

- [ ] **Step 6: Commit**

```bash
git add libs/core/src/lib/models/document.model.ts apps/desktop/src/app/pages/documents/cv-content.util.ts apps/desktop/src/app/pages/documents/cv-content.util.spec.ts
git commit -m "feat(documents): title/body style model + resolution helpers"
```

---

### Task 2: Component style accessors

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts` (`sectionCss` ~line 386; imports; `setSectionStyle` ~line 429)
- Test: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.spec.ts`

**Interfaces:**

- Consumes: `effectiveTitleStyle`, `effectiveTitleBorder`, `CvBorderStyle`, `CvTextStyle` (Task 1).
- Produces on the component:
  - `bodyCss(key: CvSectionKey): Record<string, string>` (font-family/size/weight)
  - `titleCss(key: CvSectionKey): Record<string, string>` (font-family/size/weight/color)
  - `titleBorderCss(key: CvSectionKey): string` (a `border-bottom` value, for `[style.borderBottom]`)
  - `setSectionTitleStyle(key: CvSectionKey, patch: Partial<CvTextStyle>): void` (deep-merges into `sectionStyles[key].title`)
  - `updateTitleStyle(patch: Partial<CvTextStyle>): void` (deep-merges into document-wide `titleStyle`)
  - keep `effStyle`, `sectionOverride`, `setSectionStyle`, `resetSectionStyle`.

> **Angular note:** template expressions do NOT support object spread
> (`{...a, ...b}`). All merge logic lives in component methods
> (`setSectionTitleStyle`, `updateTitleStyle`); `titleBorderCss` returns a
> plain string bound via `[style.borderBottom]`, never spread into `ngStyle`.

- [ ] **Step 1: Write the failing test**

Add to `cv-detail.component.spec.ts` inside the existing describe:

```ts
it('titleCss and bodyCss resolve independent fonts; titleBorderCss maps the line', () => {
  component.style.set({
    ...component.style(),
    fontFamily: 'Calibri',
    titleStyle: { fontFamily: 'Georgia' },
    titleBorder: 'dotted',
  });
  expect(component.bodyCss('summary')['font-family']).toBe('Calibri');
  expect(component.titleCss('summary')['font-family']).toBe('Georgia');
  expect(component.titleBorderCss('summary')).toContain('dotted');

  component.style.set({ ...component.style(), titleBorder: 'none' });
  expect(component.titleBorderCss('summary')).toBe('none');
});

it('setSectionTitleStyle deep-merges into the section title override', () => {
  component.setSectionTitleStyle('skills', { fontFamily: 'Arial' });
  component.setSectionTitleStyle('skills', { fontSizePt: 15 });
  expect(component.style().sectionStyles?.skills?.title).toEqual({
    fontFamily: 'Arial',
    fontSizePt: 15,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test desktop --testFile=cv-detail.component.spec.ts`
Expected: FAIL — `bodyCss`/`titleCss`/`titleBorderCss`/`setSectionTitleStyle` not defined.

- [ ] **Step 3: Add imports**

In `cv-detail.component.ts`, extend the `@applye/core` import to include `effectiveTitleStyle`, `effectiveTitleBorder`, `CvBorderStyle`, `CvTextStyle` (whichever come from that module — `effectiveTitleStyle`/`effectiveTitleBorder` are exported from `cv-content.util`, alongside the existing `effectiveSectionStyle` import; `CvBorderStyle`/`CvTextStyle` from `@applye/core`).

- [ ] **Step 4: Replace `sectionCss` with the three accessors + add the setter**

Replace the `sectionCss` method (~386-393) with:

```ts
/** Body-text style for a section wrapper. */
bodyCss(key: CvSectionKey): Record<string, string> {
  const s = this.effStyle(key);
  return {
    'font-family': s.fontFamily,
    'font-size': `${s.fontSizePt}pt`,
    'font-weight': String(s.fontWeight),
  };
}

/** Title style for a section heading. */
titleCss(key: CvSectionKey): Record<string, string> {
  const s = effectiveTitleStyle(this.style(), key);
  return {
    'font-family': s.fontFamily,
    'font-size': `${s.fontSizePt}pt`,
    'font-weight': String(s.fontWeight),
    color: s.colorHex,
  };
}

/** Title underline as a `border-bottom` string for `[style.borderBottom]`. */
titleBorderCss(key: CvSectionKey): string {
  const b = effectiveTitleBorder(this.style(), key);
  return b === 'none' ? 'none' : `var(--border-width) ${b} var(--border-subtle)`;
}
```

Add after `setSectionStyle` (~436):

```ts
/** Deep-merge a patch into a section's title override (a nested object that
 * `setSectionStyle`'s shallow merge would otherwise replace wholesale). */
setSectionTitleStyle(key: CvSectionKey, patch: Partial<CvTextStyle>): void {
  const current = this.style();
  const existing = current.sectionStyles?.[key]?.title ?? {};
  this.setSectionStyle(key, { title: { ...existing, ...patch } });
}

/** Deep-merge a patch into the document-wide title style (template
 * expressions can't spread, so the merge happens here). */
updateTitleStyle(patch: Partial<CvTextStyle>): void {
  this.updateStyle({ titleStyle: { ...(this.style().titleStyle ?? {}), ...patch } });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx nx test desktop --testFile=cv-detail.component.spec.ts`
Expected: PASS. (The prior `sectionCss`-based tests were replaced by `bodyCss`; if any test referenced `sectionCss`, update it to `bodyCss` — none currently do.)

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.spec.ts
git commit -m "feat(documents): title/body style accessors on CV detail"
```

---

### Task 3: Preview templates + SCSS cleanup

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html` (title h3s + section wrappers; the `#sectionTitleTpl`, `#summaryTpl`, `#skillsTpl`, `#languagesTpl`)
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.scss` (`.cvpreview__section-title` ~634; `.cvpreview__summary` ~648; `.cvpreview__languages` ~665; `.cvpreview__entry ul` ~659)
- Test: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.spec.ts`

**Interfaces:**

- Consumes: `titleCss`, `bodyCss`, `titleBorderCss` (Task 2).

- [ ] **Step 1: Write the failing test**

Add to `cv-detail.component.spec.ts`:

```ts
it('renders section title in the title font and body in the body font', () => {
  component.doc.set({ id: 1, docType: 'cv', source: 'manual', isDefault: false });
  component.loadError.set(false);
  component.previewMode.set(true);
  component.style.set({
    ...component.style(),
    fontFamily: 'Calibri', // body
    titleStyle: { fontFamily: 'Georgia' }, // title
    titleBorder: 'none',
  });
  component.sections.set([
    { key: 'skills', order: 0, visible: true, groups: [{ label: 'L', values: ['TS'] }] },
  ]);
  fixture.detectChanges();

  const root = fixture.nativeElement as HTMLElement;
  const title = root.querySelector('.cvpreview__section-title') as HTMLElement;
  const body = root.querySelector('.cvpreview__section') as HTMLElement;
  expect(title.style.fontFamily).toContain('Georgia');
  expect(body.style.fontFamily).toContain('Calibri');
  expect(title.style.borderBottom === '' || title.style.borderBottom === 'none').toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test desktop --testFile=cv-detail.component.spec.ts`
Expected: FAIL — title currently uses `sectionCss` (removed) or the body font, and border is hardcoded in CSS not inline.

- [ ] **Step 3: Update the templates**

In `cv-detail.component.html`:

`#sectionTitleTpl` h3 — bind title style + border (no spread; border via its own binding):

```html
<h3
  class="cvpreview__section-title cvpreview__section-start"
  [ngStyle]="titleCss(key)"
  [style.borderBottom]="titleBorderCss(key)"
>
  {{ label }}
</h3>
```

For the three inline titles (summary/skills/languages), replace their `[ngStyle]="sectionCss('<key>')"` + `[style.color]` on the `<h3>` with:

```html
<h3
  class="cvpreview__section-title"
  [ngStyle]="titleCss('summary')"
  [style.borderBottom]="titleBorderCss('summary')"
></h3>
```

(repeat with `'skills'` and `'languages'`). And change each section wrapper `<div class="cvpreview__section cvpreview__section-start" [ngStyle]="sectionCss('<key>')">` to `[ngStyle]="bodyCss('<key>')"`. Also update the `#expEntryTpl` / `#eduEntryTpl` wrappers that used `sectionCss(key)` to `bodyCss(key)`.

- [ ] **Step 4: SCSS cleanup**

In `cv-detail.component.scss`, edit `.cvpreview__section-title` (~634) — remove the three now-style-driven lines, keep the rest:

```scss
.cvpreview__section-title {
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  padding-bottom: var(--space-2);
  margin: 0 0 var(--space-3);
}
```

(Removed: `font-family: var(--font-mono)`, `font-size: var(--text-xs)`, `color: var(--text-tertiary)`, `border-bottom: …`. Colour now comes from `titleCss`, border from `titleBorderCss`.)

Remove the `font-size: var(--text-sm)` line from `.cvpreview__summary` (~648), `.cvpreview__languages` (~665), and `.cvpreview__entry ul` (~659) so body size is driven by `bodyCss`.

- [ ] **Step 5: Run tests + build to verify**

Run: `npx nx test desktop --testFile=cv-detail.component.spec.ts`
Expected: PASS.
Run: `npx nx build desktop --configuration=production`
Expected: build succeeds (no template/SCSS errors).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.scss apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.spec.ts
git commit -m "feat(documents): drive CV preview title/body from split styles"
```

---

### Task 4: Global style card UI + i18n

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html` (global `docedit-style-grid`, ~161-210)
- Modify: `libs/i18n/src/lib/translations/translations.ts` (`documents` namespace, EN + DE)
- Test: `apps/desktop/src/i18n-keys.spec.ts` (parity — auto-covered)

**Interfaces:**

- Consumes: `updateStyle`, and new nested writes for `titleStyle`/`titleBorder`.

- [ ] **Step 1: Add i18n keys (EN + DE)**

In `translations.ts`, add to the `documents` object in BOTH `en` and `de`:

EN:

```ts
cv_style_group_body: 'Body text',
cv_style_group_titles: 'Section titles',
cv_style_weight: 'Weight',
cv_style_line: 'Line',
cv_style_line_none: 'None',
cv_style_line_solid: 'Solid',
cv_style_line_dotted: 'Dotted',
cv_style_line_dashed: 'Dashed',
```

DE:

```ts
cv_style_group_body: 'Fließtext',
cv_style_group_titles: 'Abschnittstitel',
cv_style_weight: 'Stärke',
cv_style_line: 'Linie',
cv_style_line_none: 'Keine',
cv_style_line_solid: 'Durchgezogen',
cv_style_line_dotted: 'Gepunktet',
cv_style_line_dashed: 'Gestrichelt',
```

- [ ] **Step 2: Run i18n parity test**

Run: `npx nx test desktop --testFile=i18n-keys.spec.ts`
Expected: PASS (EN/DE parity holds).

- [ ] **Step 3: Add the "Section titles" group to the global card**

In `cv-detail.component.html`, inside the `docedit-style-grid` (after the existing Body font/color fields, before/after page size), add a titles subgroup. Restore a body-size field too (removed in the earlier bug fix, now meaningful alongside a title size). Example fields to add:

```html
<!-- Body size (document-wide) -->
<div class="docedit-field">
  <span class="docedit-field__label">{{ t()('documents.cv_style_size') }}</span>
  <input
    type="number"
    min="6"
    max="24"
    step="0.5"
    [ngModel]="style().fontSizePt"
    (ngModelChange)="updateStyle({ fontSizePt: +$event })"
  />
</div>

<!-- Section-title group -->
<div class="docedit-field">
  <span class="docedit-field__label"
    >{{ t()('documents.cv_style_group_titles') }} · {{ t()('documents.cv_style_font') }}</span
  >
  <select
    [ngModel]="style().titleStyle?.fontFamily ?? ''"
    (ngModelChange)="updateTitleStyle({ fontFamily: $event || undefined })"
  >
    <option value="">{{ t()('documents.cv_section_style_inherit') }}</option>
    @for (font of atsSafeFonts; track font) {
    <option [value]="font">{{ font }}</option>
    }
  </select>
</div>
<div class="docedit-field">
  <span class="docedit-field__label"
    >{{ t()('documents.cv_style_group_titles') }} · {{ t()('documents.cv_style_size') }}</span
  >
  <input
    type="number"
    min="6"
    max="28"
    step="0.5"
    [ngModel]="style().titleStyle?.fontSizePt ?? null"
    [placeholder]="style().fontSizePt"
    (ngModelChange)="updateTitleStyle({ fontSizePt: $event ? +$event : undefined })"
  />
</div>
<div class="docedit-field">
  <span class="docedit-field__label">{{ t()('documents.cv_style_line') }}</span>
  <select
    [ngModel]="style().titleBorder ?? 'solid'"
    (ngModelChange)="updateStyle({ titleBorder: $event })"
  >
    <option value="none">{{ t()('documents.cv_style_line_none') }}</option>
    <option value="solid">{{ t()('documents.cv_style_line_solid') }}</option>
    <option value="dotted">{{ t()('documents.cv_style_line_dotted') }}</option>
    <option value="dashed">{{ t()('documents.cv_style_line_dashed') }}</option>
  </select>
</div>
```

Title weight + colour fields follow the same pattern via `updateTitleStyle`,
for parity with body — weight as a `<select>` of 300/400/600/700 bound with
`(ngModelChange)="updateTitleStyle({ fontWeight: $event ? +$event : undefined })"`,
colour as `type="color"` bound with `(ngModelChange)="updateTitleStyle({ colorHex: $event })"`.

- [ ] **Step 4: Run the CV detail spec + build**

Run: `npx nx test desktop --testFile=cv-detail.component.spec.ts`
Expected: PASS.
Run: `npx nx build desktop --configuration=production`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html libs/i18n/src/lib/translations/translations.ts
git commit -m "feat(documents): global CV style card gains title group + line"
```

---

### Task 5: Per-section popover UI

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html` (`#stylePopover`, ~723-770)
- Test: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.spec.ts`

**Interfaces:**

- Consumes: `sectionOverride`, `setSectionStyle`, `setSectionTitleStyle` (Task 2), and the Task 4 i18n keys.

- [ ] **Step 1: Write the failing test**

```ts
it('per-section title override renders over the document title style', () => {
  component.doc.set({ id: 1, docType: 'cv', source: 'manual', isDefault: false });
  component.loadError.set(false);
  component.previewMode.set(true);
  component.style.set({ ...component.style(), titleStyle: { fontFamily: 'Georgia' } });
  component.setSectionTitleStyle('skills', { fontFamily: 'Arial' });
  component.sections.set([
    { key: 'skills', order: 0, visible: true, groups: [{ label: 'L', values: ['TS'] }] },
  ]);
  fixture.detectChanges();
  const title = fixture.nativeElement.querySelector('.cvpreview__section-title') as HTMLElement;
  expect(title.style.fontFamily).toContain('Arial');
});
```

- [ ] **Step 2: Run test to verify it fails / passes**

Run: `npx nx test desktop --testFile=cv-detail.component.spec.ts`
Expected: PASS already at the accessor level (Task 2 wired resolution). This test guards the popover write path used in Step 3; keep it.

- [ ] **Step 3: Split the popover into Title + Body groups**

In `#stylePopover`, wrap the existing font/size/color/weight fields under a Body group label, and add a parallel Title group binding to `sectionOverride(key)?.title` via `setSectionTitleStyle`, plus a Line select bound to `sectionOverride(key)?.titleBorder` via `setSectionStyle(key, { titleBorder: $event })`. Body group (existing fields, add a group label):

```html
<span class="cvdetail__style-group">{{ t()('documents.cv_style_group_body') }}</span>
<!-- existing font / size / color / weight fields stay here -->
```

Title group:

```html
<span class="cvdetail__style-group">{{ t()('documents.cv_style_group_titles') }}</span>
<label class="cvdetail__style-field">
  <span class="cvdetail__style-label">{{ t()('documents.cv_style_font') }}</span>
  <select
    [ngModel]="sectionOverride(key)?.title?.fontFamily ?? ''"
    (ngModelChange)="setSectionTitleStyle(key, { fontFamily: $event || undefined })"
  >
    <option value="">{{ t()('documents.cv_section_style_inherit') }}</option>
    @for (font of atsSafeFonts; track font) {
    <option [value]="font">{{ font }}</option>
    }
  </select>
</label>
<label class="cvdetail__style-field">
  <span class="cvdetail__style-label">{{ t()('documents.cv_style_size') }}</span>
  <input
    type="number"
    min="6"
    max="28"
    step="0.5"
    [ngModel]="sectionOverride(key)?.title?.fontSizePt ?? null"
    [placeholder]="style().titleStyle?.fontSizePt ?? style().fontSizePt"
    (ngModelChange)="setSectionTitleStyle(key, { fontSizePt: $event ? +$event : undefined })"
  />
</label>
<label class="cvdetail__style-field">
  <span class="cvdetail__style-label">{{ t()('documents.cv_style_line') }}</span>
  <select
    [ngModel]="sectionOverride(key)?.titleBorder ?? ''"
    (ngModelChange)="setSectionStyle(key, { titleBorder: $event || undefined })"
  >
    <option value="">{{ t()('documents.cv_section_style_inherit') }}</option>
    <option value="none">{{ t()('documents.cv_style_line_none') }}</option>
    <option value="solid">{{ t()('documents.cv_style_line_solid') }}</option>
    <option value="dotted">{{ t()('documents.cv_style_line_dotted') }}</option>
    <option value="dashed">{{ t()('documents.cv_style_line_dashed') }}</option>
  </select>
</label>
```

(Add title weight + colour fields with the same `setSectionTitleStyle` pattern for parity.)

Add a minimal SCSS rule for `.cvdetail__style-group` (small caps label) in `cv-detail.component.scss` if not present:

```scss
.cvdetail__style-group {
  display: block;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-tertiary);
  margin: var(--space-3) 0 var(--space-1);
}
```

- [ ] **Step 4: Run tests + build**

Run: `npx nx test desktop --testFile=cv-detail.component.spec.ts`
Expected: PASS (all CV detail tests).
Run: `npx nx build desktop --configuration=production`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.scss
git commit -m "feat(documents): per-section CV style popover gains title group"
```

---

## Verification (whole feature)

- `npx nx test desktop` — full desktop suite green (cv-content.util, cv-detail, i18n-keys).
- `npx nx build desktop --configuration=production` — succeeds.
- Manual (Tauri gate, #1): open a CV → Style card → change a title font/size/line and confirm the preview title updates independently of the body; per-section popover overrides one section; Export-PDF (WYSIWYG) matches the preview.

## Self-review notes

- Spec coverage: model (T1), resolution (T1), preview binding + SCSS cleanup (T3), global UI (T4), per-section UI (T5), i18n (T4), tests (T1/T2/T3/T5). All spec sections mapped.
- Border colour fixed to `--border-subtle` per spec; only line style is user-selectable.
- `setSectionStyle` shallow-merge would clobber the nested `title`; `setSectionTitleStyle` (T2) deep-merges it — used by T5.
