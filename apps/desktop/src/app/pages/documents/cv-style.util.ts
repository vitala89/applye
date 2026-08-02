// Immutable edits to a `CvStyle`, and the resolution that reads one back.
//
// Split out of `cv-content.util.ts`, which was 1245 lines against a 400 budget.
// Every function here takes a style and returns a new one, or resolves what a
// leaf actually renders as after section and document defaults are applied.
// None of them touches content.
//
// The rule they share, and the reason they belong together: the persisted
// override tree is kept minimal. Inherited values, empty title objects, empty
// section overrides and an empty map are all removed on the way out, so a style
// that has been set and unset again is byte-identical to one never touched.

import {
  CoverLetterBlockKey,
  CoverLetterStyle,
  CvBorderStyle,
  CvElementStyle,
  CvFontWeight,
  CvSectionKey,
  CvSectionStyle,
  CvStyle,
  CvTextStyle,
} from '@applye/core';

/** Applies an immutable per-section style patch while keeping the persisted
 * override tree minimal. Nested title fields are deep-merged; inherited
 * (`undefined`/`null`) values, empty title objects, empty section overrides,
 * and an empty `sectionStyles` map are removed. */
export function patchCvSectionStyle(
  style: CvStyle,
  key: CvSectionKey,
  patch: Partial<CvSectionStyle>,
): CvStyle {
  const current = style.sectionStyles?.[key] ?? {};
  const normalizedPatch = { ...patch };
  if ('lineHeight' in patch && !isValidCvLineHeight(patch.lineHeight)) {
    normalizedPatch.lineHeight = undefined;
  }
  const title =
    normalizedPatch.title === undefined
      ? current.title
      : Object.fromEntries(
          Object.entries({ ...(current.title ?? {}), ...normalizedPatch.title }).filter(
            ([, value]) => value != null,
          ),
        );
  // Deep-merge the shared bullet style (the "all achievements" scope), same as
  // `title`: inherited (null/undefined) keys are dropped so an emptied override
  // disappears.
  const bulletStyle =
    normalizedPatch.bulletStyle === undefined
      ? current.bulletStyle
      : Object.fromEntries(
          Object.entries({ ...(current.bulletStyle ?? {}), ...normalizedPatch.bulletStyle }).filter(
            ([, value]) => value != null,
          ),
        );
  const merged = Object.fromEntries(
    Object.entries({ ...current, ...normalizedPatch, title, bulletStyle }).filter(
      ([, value]) => value != null && !(typeof value === 'object' && !Object.keys(value).length),
    ),
  ) as CvSectionStyle;
  const sectionStyles = { ...(style.sectionStyles ?? {}) };
  if (Object.keys(merged).length) sectionStyles[key] = merged;
  else delete sectionStyles[key];
  return {
    ...style,
    sectionStyles: Object.keys(sectionStyles).length ? sectionStyles : undefined,
  };
}

/** Leaf-path prefix for a section (`exp`, `edu`, `skills`, `pd`, `lang`,
 * `summary`) - the head of every `elementStyles` key inside that section. */
function sectionPathPrefix(key: CvSectionKey): string | null {
  switch (key) {
    case 'personal_details':
      return 'pd';
    case 'experience':
      return 'exp';
    case 'education':
      return 'edu';
    case 'skills':
      return 'skills';
    case 'languages':
      return 'lang';
    case 'summary':
      return 'summary';
    default:
      return null;
  }
}

/** Drops per-element overrides inside a section so a section-wide change ("All
 * experiences", "All achievements") applies UNIFORMLY - an individual entry's
 * override no longer wins and silently gets skipped. `bullets: true` targets
 * only that section's bullet overrides (the "All achievements" scope);
 * otherwise it targets the heads/fields (everything except bullets). Sibling
 * sections and the section/document styles are untouched. */
export function clearSectionElementOverrides(
  style: CvStyle,
  key: CvSectionKey,
  bullets = false,
): CvStyle {
  const prefix = sectionPathPrefix(key);
  if (!prefix || !style.elementStyles) return style;
  const next = Object.fromEntries(
    Object.entries(style.elementStyles).filter(([path]) => {
      const inSection = path === prefix || path.startsWith(prefix + '.');
      if (!inSection) return true;
      const isBullet = path.includes('.bullet.');
      return !(bullets ? isBullet : !isBullet);
    }),
  );
  return { ...style, elementStyles: Object.keys(next).length ? next : undefined };
}

/** Drops TITLE properties from EVERY per-section override so an "all titles"
 * change applies UNIFORMLY - the counterpart of `clearSectionElementOverrides`
 * one layer up. Without this, a title styled on its own ("this title") keeps
 * winning the cascade and silently ignores the new all-titles value while its
 * siblings adopt it.
 *
 * Only the properties present in `patch` are cleared (pass each as `undefined`,
 * the same "inherit" convention `patchCvSectionStyle` already uses): changing
 * the all-titles line must not also drop a section's own title colour. */
export function clearSectionTitleOverrides(
  style: CvStyle,
  patch: Partial<CvSectionStyle>,
): CvStyle {
  const keys = Object.keys(style.sectionStyles ?? {}) as CvSectionKey[];
  return keys.reduce((acc, key) => patchCvSectionStyle(acc, key, patch), style);
}

/** Drops RULE properties from every per-ENTRY override in a section so an "All
 * experiences" line change applies UNIFORMLY - the entry-line counterpart of
 * `clearSectionTitleOverrides`. Without it, an entry whose line the user styled
 * on its own keeps winning and ignores the section's new rule.
 *
 * Only the properties present in `patch` are cleared (pass each as `undefined`),
 * and only on ENTRY paths (`exp.0`): a FIELD's underline (`exp.0.role`) is its
 * own line, not the entry rule, so a section-rule edit must leave it alone. */
export function clearSectionEntryRuleOverrides(
  style: CvStyle,
  key: CvSectionKey,
  patch: Partial<CvElementStyle>,
): CvStyle {
  const prefix = sectionPathPrefix(key);
  if (!prefix || !style.elementStyles) return style;
  const isEntry = new RegExp(`^${prefix}\\.\\d+$`);
  return Object.keys(style.elementStyles)
    .filter((path) => isEntry.test(path))
    .reduce((acc, path) => patchCvElementStyle(acc, path, patch), style);
}

/** Removes one complete per-section override and omits the map when it becomes
 * empty. Document defaults and sibling section overrides are preserved. */
export function resetCvSectionStyle(style: CvStyle, key: CvSectionKey): CvStyle {
  const sectionStyles = { ...(style.sectionStyles ?? {}) };
  delete sectionStyles[key];
  return {
    ...style,
    sectionStyles: Object.keys(sectionStyles).length ? sectionStyles : undefined,
  };
}

export function effectiveSectionStyle(
  style: CvStyle,
  key: CvSectionKey,
): {
  fontFamily: string;
  fontSizePt: number;
  fontWeight: CvFontWeight;
  colorHex: string;
  lineHeight?: number;
} {
  const o = style.sectionStyles?.[key] ?? {};
  return {
    fontFamily: o.fontFamily ?? style.fontFamily,
    fontSizePt: o.fontSizePt ?? style.fontSizePt,
    fontWeight: o.fontWeight ?? style.fontWeight,
    colorHex: o.colorHex ?? style.accentColorHex,
    lineHeight: isValidCvLineHeight(o.lineHeight) ? o.lineHeight : undefined,
  };
}

function isValidCvLineHeight(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 1 && value <= 2;
}

/** Applies an immutable per-element style patch while keeping the persisted
 * override tree minimal. Mirrors `patchCvSectionStyle` at the leaf level:
 * inherited (`undefined`/`null`) values, an emptied element override, and an
 * emptied `elementStyles` map are all removed; sibling paths are untouched. */
export function patchCvElementStyle(
  style: CvStyle,
  path: string,
  patch: Partial<CvElementStyle>,
): CvStyle {
  const current = style.elementStyles?.[path] ?? {};
  const normalizedPatch = { ...patch };
  if ('lineHeight' in patch && !isValidCvLineHeight(patch.lineHeight)) {
    normalizedPatch.lineHeight = undefined;
  }
  const merged = Object.fromEntries(
    Object.entries({ ...current, ...normalizedPatch }).filter(([, value]) => value != null),
  ) as CvElementStyle;
  const elementStyles = { ...(style.elementStyles ?? {}) };
  if (Object.keys(merged).length) elementStyles[path] = merged;
  else delete elementStyles[path];
  return {
    ...style,
    elementStyles: Object.keys(elementStyles).length ? elementStyles : undefined,
  };
}

/** Removes one complete per-element override and omits the map when it
 * becomes empty. Document defaults, section overrides, and sibling element
 * overrides are preserved. */
export function resetCvElementStyle(style: CvStyle, path: string): CvStyle {
  const elementStyles = { ...(style.elementStyles ?? {}) };
  delete elementStyles[path];
  return {
    ...style,
    elementStyles: Object.keys(elementStyles).length ? elementStyles : undefined,
  };
}

/** Applies an element-style patch onto the `CvStyle` root/document-wide body
 * fields (`fontFamily`/`fontSizePt`/`fontWeight`/`bodyColorHex`) - the
 * least-specific layer of the cascade. Only the provided keys are written;
 * `sectionStyles`/`elementStyles`/`titleStyle` are left untouched.
 * `colorHex` maps to `bodyColorHex` - the document-wide BODY text colour -
 * NOT `accentColorHex` (the accent/title/rule colour body text never reads;
 * writing `accentColorHex` here was the Phase D.2 bug this fixes, since it
 * recoloured titles instead of the body it was meant to target).
 * `lineHeight` has no document-body root field, so it is intentionally
 * ignored here. */
export function patchCvDocumentBody(style: CvStyle, patch: Partial<CvElementStyle>): CvStyle {
  const next: CvStyle = { ...style };
  if (patch.fontFamily !== undefined) next.fontFamily = patch.fontFamily;
  if (patch.fontSizePt !== undefined) next.fontSizePt = patch.fontSizePt;
  if (patch.fontWeight !== undefined) next.fontWeight = patch.fontWeight;
  if (patch.colorHex !== undefined) next.bodyColorHex = patch.colorHex;
  return next;
}

/** Resolved style for a single body leaf: `elementStyles[elementPath]`
 * layered over `effectiveSectionStyle(style, key)` - element → section →
 * document → none, most-specific first. An absent `elementPath` (or one with
 * no override) resolves to the section/document colour cascade unchanged.
 * `colorHex` stays `undefined` unless explicitly overridden at the element,
 * section, OR document (`bodyColorHex`) scope - it must NOT fall back to
 * `accentColorHex` (the no-accent-leak rule from `015c2e3`); un-overridden
 * body text keeps its inherited/theme colour. `lineHeight` is validated
 * 1.0-2.0, falling back to the section's (already-validated) value when the
 * element override is out of range. */
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
  /** Per-leaf bottom rule (underline). Element-only - no section fallback: the
   * section's structural body divider is a separate concept. `undefined`/'none'
   * → no line. */
  borderStyle?: CvBorderStyle;
  ruleWidthPt?: number;
  ruleColorHex?: string;
} {
  const section = effectiveSectionStyle(style, key);
  const sectionOverride = style.sectionStyles?.[key] ?? {};
  const element: CvElementStyle = (elementPath && style.elementStyles?.[elementPath]) || {};
  const hasLine = !!element.borderStyle && element.borderStyle !== 'none';
  return {
    fontFamily: element.fontFamily ?? section.fontFamily,
    fontSizePt: element.fontSizePt ?? section.fontSizePt,
    fontWeight: element.fontWeight ?? section.fontWeight,
    colorHex: element.colorHex ?? sectionOverride.colorHex ?? style.bodyColorHex ?? undefined,
    lineHeight: isValidCvLineHeight(element.lineHeight) ? element.lineHeight : section.lineHeight,
    borderStyle: hasLine ? element.borderStyle : undefined,
    ruleWidthPt: hasLine ? (element.ruleWidthPt ?? 1) : undefined,
    ruleColorHex: hasLine ? (element.ruleColorHex ?? style.accentColorHex) : undefined,
  };
}

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

/** Effective title-underline thickness (pt) for a section: per-section, then
 * document. `undefined` means "no user override" - the renderer falls back to
 * the active theme's rule weight (or the neutral default). */
export function effectiveTitleRuleWidth(style: CvStyle, key: CvSectionKey): number | undefined {
  return style.sectionStyles?.[key]?.titleRuleWidthPt ?? style.titleRuleWidthPt;
}

/** Effective title-underline colour for a section: per-section, then document.
 * `undefined` means "no user override" - the renderer falls back to the theme
 * rule colour (accent/muted) or the neutral default. */
export function effectiveTitleRuleColor(style: CvStyle, key: CvSectionKey): string | undefined {
  return style.sectionStyles?.[key]?.titleRuleColorHex ?? style.titleRuleColorHex;
}

/** Effective per-block cover-letter style - the block's override merged over
 * the document-wide style. Mirrors `effectiveSectionStyle` for CVs. */
export function effectiveCoverLetterBlockStyle(
  style: CoverLetterStyle,
  key: CoverLetterBlockKey,
): { fontFamily: string; fontSizePt: number; fontWeight: CvFontWeight; colorHex: string } {
  const o = style.sectionStyles?.[key] ?? {};
  return {
    fontFamily: o.fontFamily ?? style.fontFamily,
    fontSizePt: o.fontSizePt ?? style.fontSizePt,
    fontWeight: o.fontWeight ?? style.fontWeight,
    colorHex: o.colorHex ?? style.accentColorHex,
  };
}

/** Effective style for a single body paragraph - its `body_<i>` override
 * merged over the `body` block style, merged over the document-wide style. */
export function effectiveCoverLetterParagraphStyle(
  style: CoverLetterStyle,
  index: number,
): { fontFamily: string; fontSizePt: number; fontWeight: CvFontWeight; colorHex: string } {
  const base = effectiveCoverLetterBlockStyle(style, 'body');
  const o = style.sectionStyles?.[`body_${index}`] ?? {};
  return {
    fontFamily: o.fontFamily ?? base.fontFamily,
    fontSizePt: o.fontSizePt ?? base.fontSizePt,
    fontWeight: o.fontWeight ?? base.fontWeight,
    colorHex: o.colorHex ?? base.colorHex,
  };
}
