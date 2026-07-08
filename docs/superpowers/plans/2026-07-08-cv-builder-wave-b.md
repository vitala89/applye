# CV Builder Wave B — Per-Section Style Constructor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each CV section gets its own font / size / colour / weight, layered over a global default with inheritance and per-section "reset to common"; add a font-weight control; reconcile the CV editor shell to the `CV Editor.dc.html` mock. Preview only.

**Architecture:** Extend the persisted flat `CvStyle` (`document_library.style_json`) with a new `fontWeight` and an optional `sectionStyles` map keyed by `CvSectionKey`. A pure `effectiveSectionStyle()` util merges override-over-global field-by-field (undefined → inherit). The Angular preview binds effective per-section styles inline; an inline "Style" popover per section card edits the overrides. Rust `check_style_safety` gains per-section coverage + a weight note. No export/renderer changes.

**Tech Stack:** Angular (standalone, signals, OnPush), TypeScript, Rust (Tauri + serde), Jest (desktop), `cargo test`, i18n `translations.ts`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-08-cv-builder-wave-b-design.md`.
- Branch: `feat/cv-default-template` (continues after PR #59). Do **not** open a new branch.
- Preview only — never touch `documents.rs` export renderers (`cv_document_export`, markdown/LaTeX) or `cvContentToMd`.
- Serde structs use `#[serde(rename_all = "camelCase")]`; keep new Rust fields consistent (`font_weight` ↔ `fontWeight`, `section_styles` ↔ `sectionStyles`).
- `CvSectionKey` = `personal_details | summary | experience | education | skills | languages`.
- Font weight domain: `300 | 400 | 600 | 700` (Light / Normal / Semibold / Bold). Global default `400`.
- i18n keys added to **both** `en` and `de` in the single `libs/i18n/src/lib/translations/translations.ts`.
- OnPush re-emit for signal mutation: `this.style.set({ ...this.style() })`.
- Test commands: desktop `npx nx test desktop`; Rust `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`.
- Colour override applies to a section's **heading** only; font/size/weight apply to the whole section.

---

### Task 1: Model + `effectiveSectionStyle` util

**Files:**

- Modify: `libs/core/src/lib/models/document.model.ts` (CvStyle block ~150-160, StyleNoteKind ~180)
- Modify: `apps/desktop/src/app/pages/documents/cv-content.util.ts` (add export near other exports)
- Test: `apps/desktop/src/app/pages/documents/cv-content.util.spec.ts`

**Interfaces:**

- Produces: `CvFontWeight`, `CvSectionStyle`, extended `CvStyle` (with `fontWeight`, `sectionStyles?`), `CV_STYLE_DEFAULT.fontWeight = 400`, and

  ```ts
  export function effectiveSectionStyle(
    style: CvStyle,
    key: CvSectionKey,
  ): { fontFamily: string; fontSizePt: number; fontWeight: CvFontWeight; colorHex: string };
  ```

- [ ] **Step 1: Write failing tests**

Add to `cv-content.util.spec.ts`:

```ts
import { effectiveSectionStyle } from './cv-content.util';
import { CV_STYLE_DEFAULT, CvStyle } from '@applye/core'; // match existing import path in the spec

describe('effectiveSectionStyle', () => {
  const base: CvStyle = { ...CV_STYLE_DEFAULT }; // fontFamily Calibri, fontSizePt 11, accentColorHex #333333, fontWeight 400

  it('inherits global when no override', () => {
    expect(effectiveSectionStyle(base, 'summary')).toEqual({
      fontFamily: 'Calibri',
      fontSizePt: 11,
      fontWeight: 400,
      colorHex: '#333333',
    });
  });

  it('applies per-field override, inherits the rest', () => {
    const s: CvStyle = {
      ...base,
      sectionStyles: { experience: { fontSizePt: 12, fontWeight: 700 } },
    };
    expect(effectiveSectionStyle(s, 'experience')).toEqual({
      fontFamily: 'Calibri',
      fontSizePt: 12,
      fontWeight: 700,
      colorHex: '#333333',
    });
  });

  it('colorHex falls back to accent, or uses override', () => {
    expect(effectiveSectionStyle(base, 'skills').colorHex).toBe('#333333');
    const s: CvStyle = { ...base, sectionStyles: { skills: { colorHex: '#0a5' } } };
    expect(effectiveSectionStyle(s, 'skills').colorHex).toBe('#0a5');
  });

  it('legacy style_json (no fontWeight) defaults to 400 after CV_STYLE_DEFAULT merge', () => {
    const legacy = { fontFamily: 'Arial', fontSizePt: 10, accentColorHex: '#111111' };
    const merged: CvStyle = { ...CV_STYLE_DEFAULT, ...legacy };
    expect(effectiveSectionStyle(merged, 'summary').fontWeight).toBe(400);
    expect(effectiveSectionStyle(merged, 'summary').fontFamily).toBe('Arial');
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npx nx test desktop --testPathPattern cv-content.util`
Expected: FAIL — `effectiveSectionStyle` not exported / `fontWeight` missing on `CV_STYLE_DEFAULT`.

- [ ] **Step 3: Extend the model**

In `document.model.ts`, replace the `CvStyle` interface + default and add the new types:

```ts
export type CvFontWeight = 300 | 400 | 600 | 700; // Light / Normal / Semibold / Bold

export interface CvSectionStyle {
  fontFamily?: string;
  fontSizePt?: number;
  colorHex?: string;
  fontWeight?: CvFontWeight;
}

export interface CvStyle {
  fontFamily: string;
  fontSizePt: number;
  accentColorHex: string;
  fontWeight: CvFontWeight;
  sectionStyles?: Partial<Record<CvSectionKey, CvSectionStyle>>;
}

export const CV_STYLE_DEFAULT: CvStyle = {
  fontFamily: 'Calibri',
  fontSizePt: 11,
  accentColorHex: '#333333',
  fontWeight: 400,
};
```

Also extend the note kind:

```ts
export type StyleNoteKind =
  | 'font_ats_risk'
  | 'size_out_of_range'
  | 'color_readability_risk'
  | 'weight_unavailable_risk';
```

- [ ] **Step 4: Implement the util**

Add to `cv-content.util.ts` (import `CvStyle, CvSectionKey, CvFontWeight` from the same source the file already imports models from):

```ts
export function effectiveSectionStyle(
  style: CvStyle,
  key: CvSectionKey,
): { fontFamily: string; fontSizePt: number; fontWeight: CvFontWeight; colorHex: string } {
  const o = style.sectionStyles?.[key] ?? {};
  return {
    fontFamily: o.fontFamily ?? style.fontFamily,
    fontSizePt: o.fontSizePt ?? style.fontSizePt,
    fontWeight: o.fontWeight ?? style.fontWeight,
    colorHex: o.colorHex ?? style.accentColorHex,
  };
}
```

- [ ] **Step 5: Run — verify pass**

Run: `npx nx test desktop --testPathPattern cv-content.util`
Expected: PASS (all prior tests still green).

- [ ] **Step 6: Commit**

```bash
git add libs/core/src/lib/models/document.model.ts apps/desktop/src/app/pages/documents/cv-content.util.ts apps/desktop/src/app/pages/documents/cv-content.util.spec.ts
git commit -m "feat: add per-section cv style model + effectiveSectionStyle util"
```

---

### Task 2: Rust style-safety over per-section overrides + weight note

**Files:**

- Modify: `apps/desktop/src-tauri/src/commands/documents.rs` (CvStyle struct ~577-610, `check_style_safety_core` ~645-672, tests ~1351)

**Interfaces:**

- Consumes: TS `CvStyle` shape from Task 1 (camelCase `fontWeight`, `sectionStyles`).
- Produces: `check_style_safety_core` that also inspects each per-section override and emits `weight_unavailable_risk` when a curated font lacks the chosen weight.

**Weight-availability note:** the curated `ATS_SAFE_FONTS` list carries no per-font weight metadata. Ship the note with a conservative rule: emit `weight_unavailable_risk` **only** for weight `300` (Light), which the common ATS core fonts (Calibri, Arial, Times New Roman, Georgia, Verdana) do not reliably ship. 400/600/700 are treated as universally available. This keeps the note truthful without new metadata; document the rule in a code comment.

- [ ] **Step 1: Write failing tests**

Add near the existing `check_style_safety_is_quiet_on_the_safe_default` test:

```rust
#[test]
fn check_style_safety_flags_bad_per_section_override() {
    let json = r#"{"fontFamily":"Calibri","fontSizePt":11,"accentColorHex":"#333333","fontWeight":400,
        "sectionStyles":{"summary":{"fontSizePt":20.0,"colorHex":"#eeeeee"}}}"#;
    let notes = check_style_safety_core(Some(json.to_string()));
    assert!(notes.iter().any(|n| n.kind == "size_out_of_range"));
    assert!(notes.iter().any(|n| n.kind == "color_readability_risk"));
}

#[test]
fn check_style_safety_flags_light_weight() {
    let json = r#"{"fontFamily":"Calibri","fontSizePt":11,"accentColorHex":"#333333","fontWeight":300}"#;
    let notes = check_style_safety_core(Some(json.to_string()));
    assert!(notes.iter().any(|n| n.kind == "weight_unavailable_risk"));
}

#[test]
fn check_style_safety_quiet_on_safe_per_section() {
    let json = r#"{"fontFamily":"Calibri","fontSizePt":11,"accentColorHex":"#333333","fontWeight":700,
        "sectionStyles":{"skills":{"fontFamily":"Arial","fontWeight":600}}}"#;
    assert!(check_style_safety_core(Some(json.to_string())).is_empty());
}
```

- [ ] **Step 2: Run — verify fail**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml check_style_safety`
Expected: FAIL — new fields not deserialized / weight note not emitted.

- [ ] **Step 3: Extend the struct**

In `documents.rs`, add fields to `CvStyle` (keep camelCase rename):

```rust
    #[serde(default = "CvStyle::default_font_weight")]
    pub font_weight: i64,
    #[serde(default)]
    pub section_styles: std::collections::HashMap<String, CvSectionStyle>,
```

Add the default fn + `Default` field, and the override struct:

```rust
    fn default_font_weight() -> i64 { 400 }
```

```rust
#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CvSectionStyle {
    pub font_family: Option<String>,
    pub font_size_pt: Option<f64>,
    pub color_hex: Option<String>,
    pub font_weight: Option<i64>,
}
```

Update `impl Default for CvStyle` to set `font_weight: Self::default_font_weight()` and `section_styles: Default::default()`.

- [ ] **Step 4: Extend the checker**

Refactor the per-value checks into a helper and call it for the global style and each override's effective value:

```rust
fn push_font_size_color_notes(
    notes: &mut Vec<StyleNote>,
    font: &str,
    size: f64,
    color: &str,
) {
    if !ATS_SAFE_FONTS.contains(&font.trim().to_lowercase().as_str()) {
        notes.push(StyleNote { kind: "font_ats_risk".to_string(), detail: font.to_string() });
    }
    if !(9.0..=13.0).contains(&size) {
        notes.push(StyleNote { kind: "size_out_of_range".to_string(), detail: format!("{size}") });
    }
    if is_low_print_contrast(color) {
        notes.push(StyleNote { kind: "color_readability_risk".to_string(), detail: color.to_string() });
    }
}

// Light (300) is not reliably shipped by the ATS core fonts; 400/600/700 are safe.
fn weight_note(weight: i64) -> Option<StyleNote> {
    if weight == 300 {
        Some(StyleNote { kind: "weight_unavailable_risk".to_string(), detail: "300".to_string() })
    } else {
        None
    }
}
```

Rewrite `check_style_safety_core` body after parsing `style`:

```rust
    let mut notes = Vec::new();
    push_font_size_color_notes(&mut notes, &style.font_family, style.font_size_pt, &style.accent_color_hex);
    if let Some(n) = weight_note(style.font_weight) { notes.push(n); }
    for o in style.section_styles.values() {
        let font = o.font_family.as_deref().unwrap_or(&style.font_family);
        let size = o.font_size_pt.unwrap_or(style.font_size_pt);
        let color = o.color_hex.as_deref().unwrap_or(&style.accent_color_hex);
        push_font_size_color_notes(&mut notes, font, size, color);
        if let Some(n) = weight_note(o.font_weight.unwrap_or(style.font_weight)) { notes.push(n); }
    }
    notes
```

(Dedup is unnecessary for tests; if a duplicate `weight_unavailable_risk` bothers a reviewer, collapse with a `seen` set — optional.)

- [ ] **Step 5: Run — verify pass**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS, no regressions in the existing suite.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/documents.rs
git commit -m "feat: extend cv style-safety to per-section overrides and light-weight note"
```

---

### Task 3: Editor shell reconcile + global Weight control

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html` (style row ~118-166, preview container ~181-183)
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.scss` (`.cvdetail` ~8, `.cvdetail__style` ~164)
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts` (note-key map ~118-120)
- Modify: `libs/i18n/src/lib/translations/translations.ts` (add keys to en + de)

**Interfaces:**

- Consumes: `CvStyle.fontWeight`, `effectiveSectionStyle` (Task 1); `weight_unavailable_risk` note kind (Task 1/2).
- Produces: a two-column editor grid (`editor-form 1fr | preview 540px`), a global Weight `<select>` bound to `updateStyle({ fontWeight })`, and the note-message map entry for `weight_unavailable_risk`.

- [ ] **Step 1: Add i18n keys**

In `translations.ts`, under the `documents` group in **both** `en` and `de`, add:

```ts
// en
cv_style_weight: 'Weight',
cv_style_weight_300: 'Light',
cv_style_weight_400: 'Normal',
cv_style_weight_600: 'Semibold',
cv_style_weight_700: 'Bold',
cv_style_note_weight: 'This weight may not be available for the chosen font.',
```

```ts
// de
cv_style_weight: 'Schriftstärke',
cv_style_weight_300: 'Leicht',
cv_style_weight_400: 'Normal',
cv_style_weight_600: 'Halbfett',
cv_style_weight_700: 'Fett',
cv_style_note_weight: 'Diese Schriftstärke ist für die gewählte Schrift evtl. nicht verfügbar.',
```

- [ ] **Step 2: Map the new note kind**

In `cv-detail.component.ts`, extend the note-key map (currently `font_ats_risk` / `size_out_of_range` / `color_readability_risk`):

```ts
    weight_unavailable_risk: 'documents.cv_style_note_weight',
```

- [ ] **Step 3: Add the global Weight control**

In `cv-detail.component.html`, after the Accent-colour `<label>` block (~166), add:

```html
<label class="cvdetail__style-field">
  <span class="cvdetail__style-label">{{ t()('documents.cv_style_weight') }}</span>
  <select [ngModel]="style().fontWeight" (ngModelChange)="updateStyle({ fontWeight: +$event })">
    <option [ngValue]="300">{{ t()('documents.cv_style_weight_300') }}</option>
    <option [ngValue]="400">{{ t()('documents.cv_style_weight_400') }}</option>
    <option [ngValue]="600">{{ t()('documents.cv_style_weight_600') }}</option>
    <option [ngValue]="700">{{ t()('documents.cv_style_weight_700') }}</option>
  </select>
</label>
```

Bind global weight on the preview container (line ~181-183):

```html
<div
  class="cvpreview"
  [style.font-family]="style().fontFamily"
  [style.font-size.pt]="style().fontSizePt"
  [style.font-weight]="style().fontWeight"
></div>
```

- [ ] **Step 4: Reconcile layout to the mock**

In `cv-detail.component.scss`, change the editor body from a stacked column to the mock's two-column grid. Wrap the edit-form region and the preview in a grid container (add a `.cvdetail__body` wrapper `<div>` in the HTML around the meta/style/sections block and the `.cvpreview`):

```scss
.cvdetail__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 540px;
  gap: 24px;
  align-items: start;
}
.cvdetail__preview-col {
  position: sticky;
  top: 16px;
}
@media (max-width: 1100px) {
  .cvdetail__body {
    grid-template-columns: 1fr;
  }
  .cvdetail__preview-col {
    position: static;
  }
}
```

Restyle `.cvdetail__style` to the mock's control-row language (mono uppercase labels, sunken control backgrounds):

```scss
.cvdetail__style {
  display: flex;
  gap: 20px;
  align-items: flex-end;
  flex-wrap: wrap;
}
.cvdetail__style-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cvdetail__style-label {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}
.cvdetail__style select,
.cvdetail__style input {
  height: 36px;
  padding: 0 11px;
  background: var(--surface-sunken);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-input);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}
.cvdetail__style select:focus,
.cvdetail__style input:focus {
  border-color: var(--border-accent);
  box-shadow: var(--shadow-ring);
}
```

Wrap existing Font/Size/Accent labels in `.cvdetail__style-field` + `.cvdetail__style-label` spans to match (mechanical class rename of the three existing `<label>`/`<span>` pairs).

- [ ] **Step 5: Run — verify build + tests**

Run: `npx nx test desktop --testPathPattern cv-detail`
Then: `npx nx build desktop` (or the project's typecheck target) to confirm the template compiles.
Expected: PASS / clean build.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.scss apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts libs/i18n/src/lib/translations/translations.ts
git commit -m "feat: reconcile cv editor shell to mock and add global font-weight control"
```

---

### Task 4: Per-section "Style" popover + preview binding

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts` (add `setSectionStyle` / `resetSectionStyle` / `openStyleKey` signal + `effectiveSectionStyle` passthrough)
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.html` (each section wrapper + card header)
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.scss` (popover styles)
- Modify: `libs/i18n/src/lib/translations/translations.ts` (popover keys en + de)
- Test: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.spec.ts`

**Interfaces:**

- Consumes: `effectiveSectionStyle` (Task 1), `CvFontWeight`, `CvSectionKey`, `CvSectionStyle`.
- Produces:

  ```ts
  effStyle(key: CvSectionKey): { fontFamily: string; fontSizePt: number; fontWeight: CvFontWeight; colorHex: string };
  setSectionStyle(key: CvSectionKey, patch: Partial<CvSectionStyle>): void; // writes style().sectionStyles[key], re-emits, debounces refreshStyleNotes
  resetSectionStyle(key: CvSectionKey): void;                               // deletes style().sectionStyles[key]
  toggleStylePopover(key: CvSectionKey): void;                              // openStyleKey signal
  ```

- [ ] **Step 1: Write failing component tests**

Add to `cv-detail.component.spec.ts` (follow the file's existing setup/`TestBed` harness; get the component instance as the other tests do):

```ts
it('setSectionStyle writes an override and re-emits', () => {
  component.setSectionStyle('experience', { fontWeight: 700 });
  expect(component.style().sectionStyles?.experience?.fontWeight).toBe(700);
  expect(component.effStyle('experience').fontWeight).toBe(700);
});

it('resetSectionStyle clears the override back to inherit', () => {
  component.setSectionStyle('experience', { fontSizePt: 13, colorHex: '#0a5' });
  component.resetSectionStyle('experience');
  expect(component.style().sectionStyles?.experience).toBeUndefined();
  expect(component.effStyle('experience').colorHex).toBe(component.style().accentColorHex);
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npx nx test desktop --testPathPattern cv-detail`
Expected: FAIL — methods not defined.

- [ ] **Step 3: Implement component methods**

In `cv-detail.component.ts` add (import `effectiveSectionStyle`, `CvSectionKey`, `CvSectionStyle`):

```ts
readonly openStyleKey = signal<CvSectionKey | null>(null);

effStyle(key: CvSectionKey) {
  return effectiveSectionStyle(this.style(), key);
}

toggleStylePopover(key: CvSectionKey): void {
  this.openStyleKey.set(this.openStyleKey() === key ? null : key);
}

setSectionStyle(key: CvSectionKey, patch: Partial<CvSectionStyle>): void {
  const current = this.style();
  const sectionStyles = { ...(current.sectionStyles ?? {}) };
  sectionStyles[key] = { ...(sectionStyles[key] ?? {}), ...patch };
  this.style.set({ ...current, sectionStyles });
  if (this.styleCheckTimer) clearTimeout(this.styleCheckTimer);
  this.styleCheckTimer = setTimeout(() => void this.refreshStyleNotes(), 400);
}

resetSectionStyle(key: CvSectionKey): void {
  const current = this.style();
  const sectionStyles = { ...(current.sectionStyles ?? {}) };
  delete sectionStyles[key];
  this.style.set({ ...current, sectionStyles });
  if (this.styleCheckTimer) clearTimeout(this.styleCheckTimer);
  this.styleCheckTimer = setTimeout(() => void this.refreshStyleNotes(), 400);
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npx nx test desktop --testPathPattern cv-detail`
Expected: PASS.

- [ ] **Step 5: Bind effective styles in the preview**

In `cv-detail.component.html`, for each rendered section wrapper (`.cvpreview__section` for summary/skills/experience/education/languages, and the `personal_details` header block), apply the effective font/size/weight to the wrapper and effective colour to the heading. Example for a section (repeat per section key, passing the right key):

```html
<div
  class="cvpreview__section"
  [style.font-family]="effStyle('experience').fontFamily"
  [style.font-size.pt]="effStyle('experience').fontSizePt"
  [style.font-weight]="effStyle('experience').fontWeight"
>
  <h3 class="cvpreview__section-title" [style.color]="effStyle('experience').colorHex">…</h3>
  …
</div>
```

For `personal_details`, bind the name colour to `effStyle('personal_details').colorHex` (replaces the blanket `style().accentColorHex`) and the block font/size/weight to that section's effective values.

- [ ] **Step 6: Add the popover to each edit-mode section card**

In the edit-form section header, add the Style disclosure (repeat per section, passing its key):

```html
<button type="button" class="cvdetail__style-btn" (click)="toggleStylePopover('experience')">
  {{ t()('documents.cv_section_style') }}
</button>
@if (openStyleKey() === 'experience') {
<div class="cvdetail__style-pop">
  <label class="cvdetail__style-field">
    <span class="cvdetail__style-label">{{ t()('documents.cv_style_font') }}</span>
    <select
      [ngModel]="style().sectionStyles?.experience?.fontFamily ?? ''"
      (ngModelChange)="setSectionStyle('experience', { fontFamily: $event || undefined })"
    >
      <option value="">{{ t()('documents.cv_section_style_inherit') }}</option>
      @for (f of fonts; track f) {
      <option [value]="f">{{ f }}</option>
      }
    </select>
  </label>
  <label class="cvdetail__style-field">
    <span class="cvdetail__style-label">{{ t()('documents.cv_style_size') }}</span>
    <input
      type="number"
      min="8"
      max="14"
      step="0.5"
      [ngModel]="style().sectionStyles?.experience?.fontSizePt ?? null"
      [placeholder]="style().fontSizePt"
      (ngModelChange)="setSectionStyle('experience', { fontSizePt: $event ? +$event : undefined })"
    />
  </label>
  <label class="cvdetail__style-field">
    <span class="cvdetail__style-label">{{ t()('documents.cv_style_color') }}</span>
    <input
      type="color"
      [ngModel]="style().sectionStyles?.experience?.colorHex ?? style().accentColorHex"
      (ngModelChange)="setSectionStyle('experience', { colorHex: $event })"
    />
  </label>
  <label class="cvdetail__style-field">
    <span class="cvdetail__style-label">{{ t()('documents.cv_style_weight') }}</span>
    <select
      [ngModel]="style().sectionStyles?.experience?.fontWeight ?? null"
      (ngModelChange)="setSectionStyle('experience', { fontWeight: $event ? +$event : undefined })"
    >
      <option [ngValue]="null">{{ t()('documents.cv_section_style_inherit') }}</option>
      <option [ngValue]="300">{{ t()('documents.cv_style_weight_300') }}</option>
      <option [ngValue]="400">{{ t()('documents.cv_style_weight_400') }}</option>
      <option [ngValue]="600">{{ t()('documents.cv_style_weight_600') }}</option>
      <option [ngValue]="700">{{ t()('documents.cv_style_weight_700') }}</option>
    </select>
  </label>
  <button type="button" class="cvdetail__style-reset" (click)="resetSectionStyle('experience')">
    {{ t()('documents.cv_section_style_reset') }}
  </button>
</div>
}
```

Reuse `fonts` (the existing curated font array the global Font select iterates — confirm its member name in the component and reuse it). Add i18n keys (en + de): `cv_section_style` (“Style” / “Stil”), `cv_section_style_inherit` (“Inherit” / “Erben”), `cv_section_style_reset` (“Reset to common” / “Auf gemeinsam zurücksetzen”), and reuse existing `cv_style_font` / `cv_style_size` / `cv_style_color` if present (else add them).

- [ ] **Step 7: Popover styles**

In `cv-detail.component.scss`:

```scss
.cvdetail__style-btn {
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-tertiary);
  background: none;
  border: none;
  cursor: pointer;
}
.cvdetail__style-pop {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
  margin: 8px 0 12px;
  padding: 12px;
  background: var(--surface-sunken);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-input);
}
.cvdetail__style-reset {
  height: 36px;
  padding: 0 12px;
  background: none;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-input);
  color: var(--text-secondary);
  cursor: pointer;
}
```

- [ ] **Step 8: Run — verify tests + build**

Run: `npx nx test desktop --testPathPattern cv-detail`
Then: `npx nx build desktop`
Expected: PASS / clean build.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-detail/ libs/i18n/src/lib/translations/translations.ts
git commit -m "feat: per-section cv style popover with inherit and reset-to-common"
```

---

### Task 5: Carried Wave A minors (T3 + T6)

**Files:**

- Modify: `apps/desktop/src/app/pages/documents/cv-content.util.ts` (`closeOpenStructures` ~239)
- Modify: `apps/desktop/src/app/pages/documents/cv-detail/cv-detail.component.ts` (`pullFromProfile` ~380-388)
- Test: `apps/desktop/src/app/pages/documents/cv-content.util.spec.ts`, `.../cv-detail.component.spec.ts`

**Interfaces:** none new — bug fixes only.

- [ ] **Step 1: Write failing test for T3**

The current `closeOpenStructures` returns `null` for a truncated string value that legitimately ends in `:` or `,` inside the string, losing a boundary char. Add to `cv-content.util.spec.ts`:

```ts
it('repairTruncatedJson keeps a colon inside a truncated string value', () => {
  // string value cut off mid-word after a colon — the ":" is inside the string, not a dangling separator
  const raw = '{"summary":"Led migration: scale';
  const repaired = repairTruncatedJson(raw);
  expect(repaired).not.toBeNull();
  const obj = JSON.parse(repaired as string);
  expect(obj.summary).toBe('Led migration: scale');
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npx nx test desktop --testPathPattern cv-content.util`
Expected: FAIL — repaired string drops the `:` boundary / returns null.

- [ ] **Step 3: Fix the inStr guard**

In `closeOpenStructures`, change the dangling-separator guard so it only applies when **not** inside a string. Replace:

```ts
let out = s.replace(/\s+$/, '');
if (/[,:]$/.test(out)) return null; // dangling separator — caller trims further
if (inStr) out += '"';
```

with:

```ts
let out = s.replace(/\s+$/, '');
if (!inStr && /[,:]$/.test(out)) return null; // dangling separator outside a string
if (inStr) out += '"';
```

- [ ] **Step 4: Run — verify pass**

Run: `npx nx test desktop --testPathPattern cv-content.util`
Expected: PASS.

- [ ] **Step 5: Write failing test for T6**

`pullFromProfile` merges with `p.field ?? personal.field`, so an empty-string field from the model would overwrite an existing value. Add a focused unit around the merge rule. If the component spec cannot easily drive `pullFromProfile` (it calls `ai.run`), extract the merge into a pure helper and test that:

```ts
// helper to add to cv-detail.component.ts (exported or static) and test:
export function mergePersonalField(incoming: string | undefined, current: string): string {
  return incoming && incoming.trim() ? incoming : current;
}
```

```ts
it('mergePersonalField ignores empty/whitespace, keeps current', () => {
  expect(mergePersonalField('', 'Vitalii')).toBe('Vitalii');
  expect(mergePersonalField('   ', 'Vitalii')).toBe('Vitalii');
  expect(mergePersonalField(undefined, 'Vitalii')).toBe('Vitalii');
  expect(mergePersonalField('New', 'Vitalii')).toBe('New');
});
```

- [ ] **Step 6: Apply the helper in `pullFromProfile`**

Replace the seven `personal.X = p.X ?? personal.X;` lines with `mergePersonalField`:

```ts
personal.fullName = mergePersonalField(p.fullName, personal.fullName);
personal.title = mergePersonalField(p.title, personal.title);
personal.email = mergePersonalField(p.email, personal.email);
personal.phone = mergePersonalField(p.phone, personal.phone);
personal.address = mergePersonalField(p.address, personal.address);
personal.website = mergePersonalField(p.website, personal.website);
personal.linkedin = mergePersonalField(p.linkedin, personal.linkedin);
```

- [ ] **Step 7: Run — verify pass**

Run: `npx nx test desktop --testPathPattern "cv-content.util|cv-detail"`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/app/pages/documents/cv-content.util.ts apps/desktop/src/app/pages/documents/cv-detail/ apps/desktop/src/app/pages/documents/cv-content.util.spec.ts
git commit -m "fix: carried wave a minors — truncated-string boundary and empty-string profile overwrite"
```

---

## Self-Review

**Spec coverage:**

- Data model (CvFontWeight/CvSectionStyle/CvStyle + default) → Task 1 ✓
- effectiveSectionStyle + inheritance/reset → Task 1 (util) + Task 4 (component reset) ✓
- Preview binding (whole-section font/size/weight, heading colour) → Task 3 (global) + Task 4 (per-section) ✓
- Weight control + style safety (per-section + weight note) → Task 2 (Rust) + Task 3 (global control/i18n) + Task 4 (per-section control) ✓
- Editor shell reconcile → Task 3 ✓
- Per-section popover UI → Task 4 ✓
- Carried Wave A minors (T3, T6) → Task 5 ✓
- Testing coverage → each task's TDD steps ✓
- Out of scope (export, heading/body split, template features, 100–900) → not implemented ✓

**Placeholder scan:** each code step carries real code; test steps carry assertions; commands are exact. Two flagged verification points for the implementer (not placeholders): confirm the curated font array member name in the component (`fonts`) and the model import path used by the spec — both are "confirm existing name," not "write later."

**Type consistency:** `effectiveSectionStyle` return shape identical across Task 1/4; `CvFontWeight` domain consistent; Rust `font_weight: i64` vs TS `300|400|600|700` numeric — compatible over JSON; note kind `weight_unavailable_risk` spelled identically in model, Rust, and i18n map.
