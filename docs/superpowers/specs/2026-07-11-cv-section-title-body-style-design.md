# CV Section Style — Title / Body split

Date: 2026-07-11
Status: Approved (design), pending implementation plan
Scope: Preview + WYSIWYG PDF only (frontend). No Rust / DOCX changes.

## Problem

The CV editor's per-section style is a single `CvSectionStyle` applied to the
whole section — title and body share one font/size/weight/color. Two concrete
consequences:

1. **No title control.** A section's heading (SUMMARY, EXPERIENCE, …) can't be
   styled independently of its body. Users want to change the heading font,
   size, weight, colour, and its underline separately.
2. **Inconsistent body sizing.** Body text size is a mix of hardcoded CSS and
   inherited style: `.cvpreview__summary`, `.cvpreview__languages`, and
   experience bullets are pinned to `font-size: var(--text-sm)`, while
   `.cvpreview__skill-row` inherits the section's `fontSizePt`. Different
   sections therefore render body text at different sizes and the style's size
   value is ignored for some of them.

This feature splits each section's style into an independent **Title** group and
**Body** group, adds a configurable title underline, and removes the hardcoded
font overrides so both groups are fully style-driven.

## Decisions (from brainstorming)

- **Structure:** full Title + Body split; each group has `fontFamily`,
  `fontSizePt`, `fontWeight`, `colorHex`. Title additionally has an underline
  (bottom-border) style.
- **Export scope:** preview + WYSIWYG detail PDF only (the WYSIWYG PDF _is_ the
  preview via `window.print()`). Library DOCX/TeX and the Rust PDF path keep
  using the document-wide style — unchanged. This keeps the feature
  frontend-only.
- **Underline options:** `none | solid | dotted | dashed`.
- **Cascade:** document-wide default + per-section override, for every property
  including size (both title-size and body-size).

## Model (`libs/core/src/lib/models/document.model.ts`)

Preview-only: the persisted `style_json` still passes through the Rust
`check_style_safety` command and exporters. Those Rust structs do **not** use
`#[serde(deny_unknown_fields)]`, so the new nested fields are ignored on the
Rust side — verified. No Rust changes required.

```ts
export type CvBorderStyle = 'none' | 'solid' | 'dotted' | 'dashed';

/** Font properties for one text group (title or body). All optional; an unset
 * field inherits its parent in the cascade. */
export interface CvTextStyle {
  fontFamily?: string;
  fontSizePt?: number;
  fontWeight?: CvFontWeight;
  colorHex?: string;
}
```

Document-wide `CvStyle` — the existing top-level `fontFamily`, `fontSizePt`,
`fontWeight`, `accentColorHex` **remain the BODY defaults** (no migration; body
already used them). Additions:

```ts
interface CvStyle {
  // …existing fields = body defaults…
  titleStyle?: CvTextStyle; // document-wide title defaults
  titleBorder?: CvBorderStyle; // document-wide title underline; default 'solid'
}
```

Per-section `CvSectionStyle` — the existing optional fields **become the BODY
override**. Additions:

```ts
interface CvSectionStyle {
  // …existing fields = body override…
  title?: CvTextStyle; // per-section title override
  titleBorder?: CvBorderStyle; // per-section title underline override
}
```

`CoverLetterStyle.sectionStyles` reuses `CvSectionStyle`, so the new optional
`title` / `titleBorder` fields become available on cover-letter section styles
too. Cover letters are out of scope: they simply never set or render these
fields (extra optional fields are inert). No cover-letter code changes.

## Resolution (`cv-content.util` / component)

Two effective styles per section plus a border resolution:

- `effectiveBodyStyle(style, key)` = section body-fields over document
  body-fields. This is today's `effectiveSectionStyle`, kept (optionally
  renamed for clarity).
- `effectiveTitleStyle(style, key)` = `section.title` over `document.titleStyle`
  over document body-fields (ultimate fallback so every property always
  resolves to a concrete value).
- `effectiveTitleBorder(style, key)` = `section.titleBorder ?? document.titleBorder ?? 'solid'`.

## Preview (`cv-detail.component`)

- Replace `sectionCss(key)` with `titleCss(key)`, `bodyCss(key)`, and
  `titleBorderCss(key)`. `titleBorderCss` maps the resolved `CvBorderStyle` to a
  `border-bottom` value: `none → 'none'`, otherwise
  `var(--border-width) <style> var(--border-subtle)` (border colour stays
  `--border-subtle` as today; only the line style is user-selectable).
- Templates:
  - Section title `<h3 class="cvpreview__section-title">` → `[ngStyle]` merges
    `titleCss(key)` and `titleBorderCss(key)`; colour from title style.
  - Section body root (`.cvpreview__section` wrapper for summary/skills/
    languages; entry wrappers for experience/education) → `[ngStyle]="bodyCss(key)"`.
- Keep the `cvpreview__section-start` spacing class from the prior fix.

### SCSS cleanup (`cv-detail.component.scss`)

- `.cvpreview__section-title`: remove hardcoded `font-family: var(--font-mono)`,
  `font-size: var(--text-xs)`, and `border-bottom` (now style-driven). Keep
  `text-transform: uppercase`, `letter-spacing`, and padding as fixed design
  constants (not user-configurable — YAGNI).
- Remove `font-size: var(--text-sm)` from `.cvpreview__summary`,
  `.cvpreview__languages`, and `.cvpreview__entry ul` so body size comes from
  `bodyCss`.

## Style editor UI (`cv-detail.component.html`)

- **Global "Document style" card** → two labelled groups:
  - **Body:** font, size, weight, colour.
  - **Section titles:** font, size, weight, colour, **Line** (none/solid/
    dotted/dashed).
  - Keep page size.
- **Per-section popover** → **Title** group + **Body** group, each with font,
  size, weight, colour (with an "inherit" empty option), plus Title **Line**.

## i18n (`libs/i18n`)

New keys (EN + DE parity): group labels (title / body / section titles), Line
label and its four options, and the title font/size/weight/colour field labels.
Reuse existing body field-label keys where possible.

## Testing

- DOM tests (jsdom, via the paginated sheet's measure pass):
  - Section title element carries the resolved **title** font (distinct from
    body font when both set differently).
  - Section body element carries the resolved **body** font/size.
  - `titleBorder` value maps to the expected `border-bottom` style; `none`
    yields no border.
  - Per-section override wins over the document-wide default for both groups.
- i18n key-parity spec stays green (new keys present in EN and DE).

## Non-goals

- DOCX / TeX / Rust-PDF export honouring the split (they keep the document-wide
  style).
- Uppercase / letter-spacing toggles for titles.
- Cover-letter title/body split.
