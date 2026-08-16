import { effectiveTitleRuleColor, effectiveTitleRuleWidth } from '@applye/core';
import type {
  CvBorderStyle,
  CvElementStyle,
  CvPreviewSelection,
  CvStyle,
  CvStyleScope,
  CvTextStyle,
} from '@applye/core';
import { isBulletPath, isEntryPath, isExperienceEntryPath } from './cv-style-panel-selection';

/**
 * What a style control should *show* at the active scope.
 *
 * **This is the control-facing twin of `libs/core`'s `cv-style.util.ts`, not a
 * duplicate of it, and the difference is the whole reason it exists.** Both walk
 * the same cascades. `effectiveLeafStyle` and `effectiveTitleStyle` end them
 * with a concrete value (`?? style.accentColorHex`, `?? 1`) because a renderer
 * has to draw something. Every function here ends them with `undefined` /
 * `null` / `''`, because a control that fell through to the accent would tell
 * the user a colour had been set when none had - the no-accent-leak rule the
 * panel was fixed for. Calling core's from the panel reintroduces that bug.
 *
 * Two further differences: core resolves at a fixed leaf, while these take the
 * active `CvStyleScope`; and core has no `bullets` scope at all.
 *
 * Page-local by decision, not by accident. Putting these in `libs/core` beside
 * their twin would make the drift between the two visible in review, and that
 * is the cost being accepted here: a change to how a section override cascades
 * has to be made on both sides, and nothing catches the second.
 */

type ThemeRule = { widthPt: number; colorHex: string } | null;

/** Normalise a computed `rgb()/rgba()` colour to `#rrggbb` for `<input
 * type="color">` (which only accepts hex). Passes through an existing hex;
 * returns null when it can't parse. */
export function rgbToHex(value: string | undefined): string | null {
  if (!value) return null;
  if (value.startsWith('#')) return value;
  const m = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return null;
  const h = (n: string) => Number(n).toString(16).padStart(2, '0');
  return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
}

/** Body values for the active scope - feeds the control models so each shows the
 * value the selection actually RENDERS with, not a blank: an unset property
 * falls through the same cascade the preview draws with, so the control never
 * contradicts the page (see `titleOverrideAt`).
 *
 * Each scope walks its own chain, because the renderer does:
 * - `element` - the leaf's own override, then what it inherits: the shared
 *   bullet style for a bullet (`<ul>` `bulletListCss`), the section override for
 *   anything else (`bodyCss`/`entryCss`), then the document.
 * - `bullets` - the shared bullet style over the DOCUMENT: bullets skip the
 *   section scope by design (that scope styles the entry heads only).
 * - `section` - the section override, then the document.
 * - `document` - the always-present root values.
 *
 * Colour never falls back to `accentColorHex` at any scope (no-accent-leak):
 * body text reads `bodyColorHex`, which is unset unless the user picks one, and
 * bullets have no colour base at all - both correctly read as Inherit. */
export function bodyOverrideAt(
  style: CvStyle,
  sel: CvPreviewSelection | null,
  scope: CvStyleScope,
): Partial<CvElementStyle> {
  if (!sel) return {};
  const section = style.sectionStyles?.[sel.sectionKey] ?? {};
  const bullet = section.bulletStyle ?? {};
  const doc = {
    fontFamily: style.fontFamily,
    fontSizePt: style.fontSizePt,
    fontWeight: style.fontWeight,
    colorHex: style.bodyColorHex,
    lineHeight: undefined,
  };
  const sectionOver: Partial<CvElementStyle> = {
    fontFamily: section.fontFamily ?? doc.fontFamily,
    fontSizePt: section.fontSizePt ?? doc.fontSizePt,
    fontWeight: section.fontWeight ?? doc.fontWeight,
    colorHex: section.colorHex ?? doc.colorHex,
    lineHeight: section.lineHeight,
  };
  const bulletOver: Partial<CvElementStyle> = {
    fontFamily: bullet.fontFamily ?? doc.fontFamily,
    fontSizePt: bullet.fontSizePt ?? doc.fontSizePt,
    fontWeight: bullet.fontWeight ?? doc.fontWeight,
    // No colour in the bullet base - an unset colour keeps the muted default, so
    // it reads as Inherit rather than the body colour.
    colorHex: bullet.colorHex,
    lineHeight: bullet.lineHeight,
  };
  switch (scope) {
    case 'section':
      return sectionOver;
    case 'bullets':
      return bulletOver;
    case 'document':
      return doc;
    case 'element':
    default: {
      const own = (sel.elementPath ? style.elementStyles?.[sel.elementPath] : undefined) ?? {};
      const base = isBulletPath(sel.elementPath) ? bulletOver : sectionOver;
      return {
        fontFamily: own.fontFamily ?? base.fontFamily,
        fontSizePt: own.fontSizePt ?? base.fontSizePt,
        fontWeight: own.fontWeight ?? base.fontWeight,
        colorHex: own.colorHex ?? base.colorHex,
        lineHeight: own.lineHeight ?? base.lineHeight,
      };
    }
  }
}

/** Title text values for the active title scope (this title vs. all titles) -
 * feeds the title control models. At "this title" a property with no override of
 * its own shows the all-titles value it INHERITS, not a blank: the control must
 * read as what the title actually renders, so switching scope after an
 * all-titles edit never leaves a stale value on screen. A property set here
 * still wins, and one set nowhere still reads as Inherit. */
export function titleOverrideAt(
  style: CvStyle,
  sel: CvPreviewSelection | null,
  scope: CvStyleScope,
): CvTextStyle {
  if (!sel) return {};
  const doc = style.titleStyle ?? {};
  if (scope === 'document') return doc;
  const own = style.sectionStyles?.[sel.sectionKey]?.title ?? {};
  return {
    fontFamily: own.fontFamily ?? doc.fontFamily,
    fontSizePt: own.fontSizePt ?? doc.fontSizePt,
    fontWeight: own.fontWeight ?? doc.fontWeight,
    colorHex: own.colorHex ?? doc.colorHex,
  };
}

/** Title-underline value for the active title scope ('' = Inherit; "this title"
 * falls back to the all-titles line - see `titleOverrideAt`). */
export function titleBorderAt(
  style: CvStyle,
  sel: CvPreviewSelection | null,
  scope: CvStyleScope,
): string {
  if (!sel) return '';
  return scope === 'document'
    ? (style.titleBorder ?? '')
    : (style.sectionStyles?.[sel.sectionKey]?.titleBorder ?? style.titleBorder ?? '');
}

/** Title-underline thickness (pt) for the active title scope. Falls through the
 * same cascade the title renders with - this title → all titles → the theme's
 * own rule - so the control shows the size actually on the page. `null`
 * (Inherit) only when the theme draws no rule either: that neutral default lives
 * in CSS tokens, which must not be forked into TS. */
export function titleRuleWidthAt(
  style: CvStyle,
  sel: CvPreviewSelection | null,
  scope: CvStyleScope,
  themeRule: ThemeRule,
): number | null {
  if (!sel) return null;
  const user =
    scope === 'document' ? style.titleRuleWidthPt : effectiveTitleRuleWidth(style, sel.sectionKey);
  return user ?? themeRule?.widthPt ?? null;
}

/** Title-underline colour for the active title scope - same cascade as
 * `titleRuleWidthAt`. */
export function titleRuleColorAt(
  style: CvStyle,
  sel: CvPreviewSelection | null,
  scope: CvStyleScope,
  themeRule: ThemeRule,
): string | null {
  if (!sel) return null;
  const user =
    scope === 'document' ? style.titleRuleColorHex : effectiveTitleRuleColor(style, sel.sectionKey);
  return user ?? themeRule?.colorHex ?? null;
}

/** Swatch colour for an underline control. `<input type="color">` cannot show
 * "unset", so an unset rule must still resolve to the colour on the page: after
 * the style model (the user's own value, then the theme's rule) comes the rule
 * colour read from the rendered host, which is the only way to see a neutral
 * default that lives in CSS tokens. The accent is the last resort, for a
 * selection whose host was not read.
 *
 * Only for rules the SELECTED host itself draws (a title's, a leaf's). The
 * section body rule and the languages separator are drawn by other elements, so
 * their swatches must not read this. */
export function ruleColorSwatch(
  value: string | null,
  sampleBaseStyle: Record<string, string>,
  accentColorHex: string,
): string {
  return value ?? rgbToHex(sampleBaseStyle['border-bottom-color']) ?? accentColorHex;
}

/** Sections that draw a BODY divider the user can size/colour: the
 * personal-details header underline and the experience entry rule.
 *
 * Section scope ONLY: an entry now has a rule of its own (`entryCss` re-points
 * the head's vars at it), so at element scope the entry's own line group is the
 * honest control. Showing this one there is what made a "This experience" line
 * edit restyle every entry - the write lands on the section, which is where this
 * rule lives. Also hidden for a single FIELD (`exp.0.role`, `pd.name`), which
 * likewise has its own per-leaf line group. */
export function showsBodyRule(sel: CvPreviewSelection | null, scope: CvStyleScope): boolean {
  if (!sel || sel.part !== 'body') return false;
  if (sel.sectionKey !== 'personal_details' && sel.sectionKey !== 'experience') return false;
  return scope === 'section';
}

/** Raw section body-rule style ('' = Inherit → the theme's rule). */
export function sectionBodyBorder(style: CvStyle, sel: CvPreviewSelection | null): string {
  return sel ? (style.sectionStyles?.[sel.sectionKey]?.bodyBorder ?? '') : '';
}

/** Raw section body-rule width (pt) (`null` = Inherit → theme rule). */
export function sectionBodyRuleWidth(
  style: CvStyle,
  sel: CvPreviewSelection | null,
): number | null {
  return sel ? (style.sectionStyles?.[sel.sectionKey]?.bodyRuleWidthPt ?? null) : null;
}

/** Raw section body-rule colour (`null` = Inherit → theme rule colour). */
export function sectionBodyRuleColor(
  style: CvStyle,
  sel: CvPreviewSelection | null,
): string | null {
  return sel ? (style.sectionStyles?.[sel.sectionKey]?.bodyRuleColorHex ?? null) : null;
}

/** Sections that draw in-line item separators the user can size/colour - the `|`
 * between languages. */
export function showsSeparator(sel: CvPreviewSelection | null): boolean {
  return !!sel && sel.part === 'body' && sel.sectionKey === 'languages';
}

export function sectionSeparatorColor(
  style: CvStyle,
  sel: CvPreviewSelection | null,
): string | null {
  return sel ? (style.sectionStyles?.[sel.sectionKey]?.separatorColorHex ?? null) : null;
}

export function sectionSeparatorSize(
  style: CvStyle,
  sel: CvPreviewSelection | null,
): number | null {
  return sel ? (style.sectionStyles?.[sel.sectionKey]?.separatorSizePt ?? null) : null;
}

/** A single leaf, styled at element scope, can carry its own bottom rule
 * (underline). Excluded: the composed contact line (`pd.contact`), a
 * multi-field wrapper with no single baseline; and an education/skills ENTRY,
 * whose head draws no rule at all, so the control would do nothing.
 *
 * An EXPERIENCE entry (`exp.0`) is included: its head is the one entry head that
 * draws a rule, and `entryCss` re-points that rule's vars at the entry's own
 * override. The border still never lands on the container itself (it would draw
 * under the bullets) - see `entryCss`. */
export function showsElementLine(sel: CvPreviewSelection | null, scope: CvStyleScope): boolean {
  const p = sel?.elementPath;
  if (scope !== 'element' || !p || p === 'pd.contact') return false;
  return !isEntryPath(p) || isExperienceEntryPath(p);
}

/** The selected element's line, as it RENDERS. An experience entry with no
 * override of its own inherits its section's divider, then the theme's own entry
 * rule - reporting "None" while the head draws one is the whole point of walking
 * this (see `titleOverrideAt` for the same rule on titles). A plain leaf has no
 * such fallback by design: its underline is its own or absent. */
export function elementBorderAt(
  style: CvStyle,
  sel: CvPreviewSelection | null,
  themeEntryRule: ThemeRule,
): string {
  const p = sel?.elementPath;
  const own = p && style.elementStyles?.[p]?.borderStyle;
  if (own) return own;
  if (!isExperienceEntryPath(p)) return '';
  // The head's rule renders solid unless the section says otherwise - that is
  // the `--cv-entry-rule-style` default the theme's rule is drawn with.
  return sectionBodyBorder(style, sel) || (themeEntryRule ? 'solid' : '');
}

export function elementRuleWidthAt(
  style: CvStyle,
  sel: CvPreviewSelection | null,
  themeEntryRule: ThemeRule,
): number | null {
  const p = sel?.elementPath;
  const own = p ? style.elementStyles?.[p]?.ruleWidthPt : undefined;
  if (!isExperienceEntryPath(p)) return own ?? null;
  return own ?? sectionBodyRuleWidth(style, sel) ?? themeEntryRule?.widthPt ?? null;
}

export function elementRuleColorAt(
  style: CvStyle,
  sel: CvPreviewSelection | null,
  themeEntryRule: ThemeRule,
): string | null {
  const p = sel?.elementPath;
  const own = p ? style.elementStyles?.[p]?.ruleColorHex : undefined;
  if (!isExperienceEntryPath(p)) return own ?? null;
  return own ?? sectionBodyRuleColor(style, sel) ?? themeEntryRule?.colorHex ?? null;
}

/** The patch a line-style pick emits. '' (Inherit) clears the whole rule (style
 * + width + colour) so nothing stray is kept.
 *
 * 'none' clears it too for a plain leaf, where absent IS off. For an experience
 * entry the two differ: absent means it inherits the section's divider, so an
 * explicit 'none' has to be stored, or turning this entry's line off would just
 * hand it back the section's. */
export function elementBorderPatch(
  sel: CvPreviewSelection | null,
  value: string,
): Partial<CvElementStyle> {
  const off = { borderStyle: undefined, ruleWidthPt: undefined, ruleColorHex: undefined };
  if (!value) return off;
  if (value === 'none') {
    return isExperienceEntryPath(sel?.elementPath) ? { borderStyle: 'none' } : { ...off };
  }
  return { borderStyle: value as CvBorderStyle };
}
