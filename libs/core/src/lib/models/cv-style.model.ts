// The CV style model: the typed shape of `document_library.style_json`, its
// three nesting levels (document, section, element), the curated ATS-safe font
// list and the notes `check_style_safety` returns.

import { CvSectionKey } from './cv-content.model';
import { PAGE_SETTINGS_DEFAULT, PageSettings } from './page-settings.model';

export type CvFontWeight = 300 | 400 | 600 | 700; // Light / Normal / Semibold / Bold

export type CvBorderStyle = 'none' | 'solid' | 'dotted' | 'dashed';

/** Font properties for one text group (a section's title or its body). All
 * optional; an unset field inherits its parent in the style cascade. */
export interface CvTextStyle {
  fontFamily?: string;
  fontSizePt?: number;
  fontWeight?: CvFontWeight;
  colorHex?: string;
}

export interface CvSectionStyle {
  fontFamily?: string;
  fontSizePt?: number;
  colorHex?: string;
  fontWeight?: CvFontWeight;
  /** Optional unitless body leading. Unset preserves the renderer's existing
   * per-element line-height instead of imposing a document-wide baseline. */
  lineHeight?: number;
  /** Per-section title override; unset fields inherit the document title style. */
  title?: CvTextStyle;
  /** Per-section title underline; unset inherits the document title border. */
  titleBorder?: CvBorderStyle;
  /** Per-section title-underline thickness in points; unset inherits the
   * document value, then the active theme's rule weight. */
  titleRuleWidthPt?: number;
  /** Per-section title-underline colour; unset inherits the document value,
   * then the active theme's rule colour. */
  titleRuleColorHex?: string;
  /** Per-section BODY rule style - lets the user turn the section's divider
   * off (`'none'`) or switch it to dotted/dashed. Unset inherits the theme's
   * rule (which is solid when it draws one). */
  bodyBorder?: CvBorderStyle;
  /** Per-section BODY rule thickness in points - the divider a section draws
   * around its body (the personal-details header underline, an experience
   * entry's role/dates rule). Unset inherits the active theme's rule. */
  bodyRuleWidthPt?: number;
  /** Per-section BODY rule colour (see `bodyRuleWidthPt`). Unset inherits the
   * active theme's rule colour. */
  bodyRuleColorHex?: string;
  /** Colour of the in-line separators a section draws between items (e.g. the
   * `|` between languages). Unset inherits the muted default. */
  separatorColorHex?: string;
  /** Size (pt) of those in-line separators - makes the `|` taller/heavier.
   * Unset inherits the surrounding text size. */
  separatorSizePt?: number;
  /** Shared style for ALL of a section's bullet lines (the "all achievements"
   * scope) - layered under each bullet's own per-leaf override. */
  bulletStyle?: CvElementStyle;
}

/** Per-leaf (single-element) style override - the most specific layer of the
 * CV style cascade (element → section → document → theme). Same optional
 * shape as `CvSectionStyle`'s body fields, minus the section-only `title` /
 * `titleBorder` nesting: an individual leaf (e.g. one bullet, one contact
 * field) has no title of its own. */
export interface CvElementStyle {
  fontFamily?: string;
  fontSizePt?: number;
  fontWeight?: CvFontWeight;
  colorHex?: string;
  lineHeight?: number;
  /** Per-leaf bottom rule (underline) drawn under THIS element only. `'none'`
   * or unset = no line (the default/off state); `'solid' | 'dotted' | 'dashed'`
   * turns it on. Independent of the section's structural body divider. */
  borderStyle?: CvBorderStyle;
  /** Thickness (pt) of the per-leaf bottom rule; unset falls back to a 1pt
   * default when `borderStyle` is set. */
  ruleWidthPt?: number;
  /** Colour of the per-leaf bottom rule; unset falls back to the accent. */
  ruleColorHex?: string;
}

/** CV style choices (ROADMAP §16.5) - typed shape of `document_library.style_json`.
 * Deliberately small: font, size, an accent colour, and an optional body-text
 * colour. Layout/order lives in `CvTemplate` instead. Safe default: Calibri
 * 11pt, dark-grey (#333333). */
export interface CvStyle {
  fontFamily: string;
  fontSizePt: number;
  accentColorHex: string;
  fontWeight: CvFontWeight;
  /** Document-wide body-text colour - distinct from `accentColorHex` (which
   * stays the accent/title/rule colour body text never reads, by the
   * no-accent-leak rule). Additive/optional: absent means no forced body
   * colour at the document layer, so un-overridden body text keeps
   * inheriting its theme/dark colour. Neither `CV_STYLE_DEFAULT` nor
   * `themeStyleSeed` sets this - a fresh or reset document never forces a
   * body colour until the user explicitly picks one at the "Whole document"
   * scope. */
  bodyColorHex?: string;
  sectionStyles?: Partial<Record<CvSectionKey, CvSectionStyle>>;
  /** Document-wide defaults for section titles; unset fields inherit the body. */
  titleStyle?: CvTextStyle;
  /** Document-wide title underline style; defaults to 'solid' when unset. */
  titleBorder?: CvBorderStyle;
  /** Document-wide title-underline thickness in points; unset falls back to
   * the active theme's rule weight. */
  titleRuleWidthPt?: number;
  /** Document-wide title-underline colour; unset falls back to the active
   * theme's rule colour. */
  titleRuleColorHex?: string;
  /** Page geometry (size + margin preset); absent → A4 / normal. */
  page?: PageSettings;
  /** Per-element (single-leaf) style overrides, keyed by a positional path
   * (e.g. `summary.body`, `experience.0.bullet.1`) - most specific layer of
   * the style cascade, resolved over `sectionStyles` then the document
   * defaults above. Additive-only storage; absent → no per-leaf overrides. */
  elementStyles?: Record<string, CvElementStyle>;
}

export const CV_STYLE_DEFAULT: CvStyle = {
  fontFamily: 'Calibri',
  fontSizePt: 11,
  accentColorHex: '#333333',
  fontWeight: 400,
  page: PAGE_SETTINGS_DEFAULT,
};

/** Curated ATS-safe font list (ROADMAP §16.5), mirrors the Rust
 * `ATS_SAFE_FONTS` constant - for populating a suggestions list in the UI,
 * not for client-side validation (that's `check_style_safety`). */
export const CV_ATS_SAFE_FONTS = [
  'Arial',
  'Calibri',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Lato',
  'Open Sans',
  'Verdana',
  'Tahoma',
  'Garamond',
];

/** One ATS/readability note from `check_style_safety` - `kind` selects the
 * (translated) message; `detail` is the value to interpolate. */
export type StyleNoteKind =
  'font_ats_risk' | 'size_out_of_range' | 'color_readability_risk' | 'weight_unavailable_risk';

export interface StyleNote {
  kind: StyleNoteKind;
  detail: string;
}
