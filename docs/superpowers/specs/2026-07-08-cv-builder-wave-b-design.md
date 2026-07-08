# CV Builder — Wave B: Per-Section Style Constructor

Status: Approved (design)
Date: 2026-07-08
Branch base: `feat/cv-default-template` (continues after Phase 1 + Wave A, PR #59)
Scope owner: CV builder

## Goal

Give each CV section its own style — font family, size, colour, and weight —
layered over a global default with inheritance and a per-section "reset to
common". Add a font-weight control (new, both global and per-section). Reconcile
the CV editor shell to the approved `CV Editor.dc.html` layout.

## Decisions (locked in brainstorming)

- **Scope:** preview only. Exported PDF/DOCX stay ATS-plain (`documents.rs`
  markdown/LaTeX renderers untouched). Per-section styling in export is deferred.
- **Granularity:** whole section. Each of the 6 `CvSectionKey`s
  (`personal_details`, `summary`, `experience`, `education`, `skills`,
  `languages`) has one override set. Font/size/weight apply to the whole
  section; colour applies to the section heading only (readability/ATS-safe),
  matching how accent colour behaves today.
- **Font weight:** four steps — Light (300) / Normal (400) / Semibold (600) /
  Bold (700). Global default 400.
- **UI:** inline per-section "Style" popover in the edit form; global defaults
  stay in the top style row; per-section "Reset to common".
- **Editor shell:** reconcile `cv-detail` to the mock's layout. **Not** in scope:
  net-new template features the mock shows (photo / birth date / marital-status
  toggles as real features, save-as-template backend, default-for-region).

## Data model — `libs/core/src/lib/models/document.model.ts`

Extend the persisted `document_library.style_json` shape. Backward-compatible:
old flat objects still parse and get defaults on load.

```ts
export type CvFontWeight = 300 | 400 | 600 | 700; // Light / Normal / Semibold / Bold

export interface CvStyle {
  // global default — persisted flat, as today
  fontFamily: string;
  fontSizePt: number;
  accentColorHex: string;
  fontWeight: CvFontWeight; // NEW, default 400
  sectionStyles?: Partial<Record<CvSectionKey, CvSectionStyle>>; // NEW, optional
}

export interface CvSectionStyle {
  // every field optional → undefined = inherit
  fontFamily?: string;
  fontSizePt?: number;
  colorHex?: string;
  fontWeight?: CvFontWeight;
}
```

Update `CV_STYLE_DEFAULT` to include `fontWeight: 400`. No migration needed:
load already does `{ ...CV_STYLE_DEFAULT, ...JSON.parse(styleJson) }`, so
`fontWeight` defaults into legacy docs and `sectionStyles` stays `undefined`
(all sections inherit).

## Inheritance & reset semantics

- **Effective style for a section** = field-by-field merge of the global default
  with that section's override; any `undefined` override field falls back to the
  global value. Implemented as a pure util:

  ```ts
  export function effectiveSectionStyle(
    style: CvStyle,
    key: CvSectionKey,
  ): { fontFamily: string; fontSizePt: number; fontWeight: CvFontWeight; colorHex: string };
  ```

  `colorHex` resolves to the override's `colorHex` if set, else
  `style.accentColorHex`.

- **Reset to common** deletes `sectionStyles[key]` entirely → the section fully
  inherits again.

- In the popover, each control shows the inherited (global) value as its
  placeholder/initial; editing a control writes the override field; reset clears
  the whole section override.

## Preview binding — `cv-detail.component.{html,ts,scss}`

- Component exposes `effectiveSectionStyle(key)` (delegates to the util over the
  current `style()` signal).
- Each rendered section wrapper binds effective **font-family**, **font-size**,
  and **font-weight** via `[style.*]`.
- The section **heading** binds effective **colour** (`[style.color]`), replacing
  today's blanket `accentColorHex` on headings; body text colour is left to the
  readable default. Name in `personal_details` uses that section's effective
  colour (still defaults to accent).

## Font weight + style safety — `documents.rs` (Rust)

- Add the weight control to the global style row and the per-section popover.
  Preview uses the numeric weight directly.
- Extend `check_style_safety_core`:
  - Run the existing font / size / colour checks over **each** per-section
    override too (a bad per-section colour or out-of-range size still warns).
  - Add a new `StyleNoteKind` value `weight_unavailable_risk`, emitted when a
    curated font lacks the chosen weight.
- **Impl caveat:** if per-font weight-availability metadata is not cheaply
  available in the curated list, the `weight_unavailable_risk` note ships
  best-effort or is deferred to a follow-up. The per-section font/size/colour
  safety checks land regardless. New `StyleNoteKind` must be mirrored in the TS
  model + the i18n note-message map.

## Editor shell reconcile — `CV Editor.dc.html`

Mock layout (self-contained token-based HTML):

- App shell already provides the 240px sidebar; no change there.
- Restructure the `cv-detail` body from today's single stacked column into the
  mock's grid: **`editor-form 1fr | live-preview 540px`**. Preview column sticky.
- Restyle the global style row (Font / Size / Accent / **Weight**) to the mock's
  token language: mono uppercase field labels, `--surface-sunken` control
  backgrounds, `--border-default`, `--radius-input`, focus ring
  (`--border-accent` / `--shadow-ring`). Keep existing meta/region + toggles.
- This is layout/SCSS reconciliation plus the one new Weight control — no content
  or persistence-logic change.

## Per-section UI — inline "Style" popover

- Each section card header (edit mode) gets a **Style** disclosure button →
  popover with four controls: font select · size (pt) · colour · weight, plus a
  **Reset to common** button.
- Controls read effective values; changing one writes into
  `style().sectionStyles[key]`; reset clears the section override.
- Re-emit through `style.set({ ...style() })` (OnPush signal update, same pattern
  as Wave A's `sections.set([...])`), then debounce the existing
  `refreshStyleNotes()` call.
- i18n: new keys en + de (single `translations.ts`): style-popover label, the
  four control labels, reset-to-common, and the `weight_*` option labels +
  `weight_unavailable_risk` note.

## Carried Wave A minors (fold in, low-risk)

- **T3** `closeOpenStructures` `/[,:]$/` dangling-separator guard ignores
  `inStr` → a truncated string value ending in `:`/`,` loses one boundary char.
  Fix: apply the guard only when `!inStr`; add a regression test.
- **T6** `pullFromProfile` `??` treats only `null` as "no update"; an empty
  string would overwrite an inherited value. Fix: treat empty string as
  no-update too.

(Other Wave A minors — T5 fixture under-assert, soft profile round-trip — remain
deferred; not in this wave.)

## Testing

- **TS unit** (`cv-content.util` / model specs):
  - `effectiveSectionStyle` — inherit (no override), per-field override, mixed,
    and colour→accent fallback.
  - `fontWeight` default applied to legacy `style_json`.
  - Backward-compat: old flat `style_json` parses; `sectionStyles` absent → all
    inherit; serialize → parse round-trip preserves overrides.
- **Rust** (`documents.rs` tests): `check_style_safety_core` flags a bad
  per-section override; safe global + safe overrides stays quiet;
  `weight_unavailable_risk` note when applicable.
- **Component**: popover set writes override + re-emits; reset clears override;
  preview binds effective per-section styles.
- **Carried fixes**: T3 truncated-string boundary test; T6 empty-string
  no-overwrite test.
- **No export tests** — out of scope.

## Out of scope / deferred

- Per-section styling in exported PDF/DOCX.
- Heading-vs-body independent styling within a section.
- Net-new template features from the mock (photo / birth / marital toggles,
  save-as-template, default-for-region).
- Numeric 100–900 weight range.
