// Routes a scope-tagged live-style-panel change to the correct write target.
//
// Split out of `cv-detail.component.ts` (962 lines against a 400 budget), where
// these four routers were methods that each called `this.style.set` one or more
// times. Here every one of them is a `(style, ...) => CvStyle` transform and the
// caller commits the result once. A path that writes twice in sequence composes
// instead - the final value is identical, because each write only ever read the
// style the previous one had just produced.
//
// It lives beside `cv-style.util.ts` rather than in `libs/core` on purpose. The
// only input these functions accept is `CvStylePanelChange`, the wire format of
// one widget (`CvLiveStylePanelComponent`), and every helper they delegate to is
// already in `cv-style.util.ts`. ADR-0005 amendment two's "domain or format"
// test puts a widget protocol on the format side, so promoting this to a
// `libs/core` public API would export a panel's emission shape as domain
// vocabulary. `CvStyleStore` therefore does not call this module - the page
// does, and hands the resulting style to the store (see ADR-0005, amendment
// five).
//
// The mapping, unchanged from the Phase D.2 table:
//   title + document -> the document-wide `titleStyle` / title rule
//   title + section  -> that section's title override
//   body  + bullets  -> the section-shared bullet style
//   body  + section  -> the whole section
//   body  + element  -> the one selected leaf
//   body  + document -> the document body

import type {
  CvElementStyle,
  CvSectionKey,
  CvSectionStyle,
  CvStyle,
  CvTextStyle,
} from '../models/document.model';
import type { CvPreviewSelection, CvStylePanelChange } from './cv-selection.util';
import {
  clearSectionElementOverrides,
  clearSectionEntryRuleOverrides,
  clearSectionTitleOverrides,
  patchCvDocumentBody,
  patchCvElementStyle,
  patchCvSectionStyle,
  resetCvElementStyle,
  resetCvSectionStyle,
} from './cv-style.util';

/** The text properties a per-section title override can carry, all cleared at
 * once when a title reset asks to inherit again. */
const TITLE_INHERIT: CvTextStyle = {
  fontFamily: undefined,
  fontSizePt: undefined,
  fontWeight: undefined,
  colorHex: undefined,
};

/** The body properties the shared bullet style can carry, all cleared at once
 * when "All achievements" is reset. `patchCvSectionStyle` drops an all-undefined
 * patch, so merging this is what removes the override. */
const BULLET_INHERIT: Partial<CvElementStyle> = {
  fontFamily: undefined,
  fontSizePt: undefined,
  fontWeight: undefined,
  colorHex: undefined,
  lineHeight: undefined,
};

/** Writes an "all titles" (document-scope) title property. The per-section
 * overrides of that SAME property are cleared first, so a title the user styled
 * on its own adopts the new value instead of silently keeping its old one - the
 * title-layer counterpart of the `clearSectionElementOverrides` step in
 * `applyBodyScopeChange`. Sibling properties survive: only what this control
 * writes is made uniform. */
function applyToAllTitles(
  style: CvStyle,
  inherit: Partial<CvSectionStyle>,
  patch: Partial<CvStyle>,
): CvStyle {
  return { ...clearSectionTitleOverrides(style, inherit), ...patch };
}

/** Merges a patch into the document-wide title style. Reads the title style off
 * the style passed in, which on the "all titles" path is the already-cleared
 * one - never the original. */
function mergeTitleStyle(style: CvStyle, patch: Partial<CvTextStyle>): CvStyle {
  return { ...style, titleStyle: { ...(style.titleStyle ?? {}), ...patch } };
}

/** Title selections: "this title" writes the section override, "all titles"
 * writes the document-wide value after clearing the section overrides of the
 * same property. */
function applyTitleScopeChange(
  style: CvStyle,
  key: CvSectionKey,
  change: CvStylePanelChange,
): CvStyle {
  const allTitles = change.scope === 'document';
  if (change.reset) {
    // Clear only the title override for this scope; body/border untouched.
    return allTitles
      ? { ...style, titleStyle: undefined }
      : patchCvSectionStyle(style, key, { title: TITLE_INHERIT });
  }
  if (change.titleBorder !== undefined) {
    const border = change.titleBorder ?? undefined;
    return allTitles
      ? applyToAllTitles(style, { titleBorder: undefined }, { titleBorder: border })
      : patchCvSectionStyle(style, key, { titleBorder: border });
  }
  if (change.titleRuleWidth !== undefined) {
    const width = change.titleRuleWidth ?? undefined;
    return allTitles
      ? applyToAllTitles(style, { titleRuleWidthPt: undefined }, { titleRuleWidthPt: width })
      : patchCvSectionStyle(style, key, { titleRuleWidthPt: width });
  }
  if (change.titleRuleColor !== undefined) {
    const color = change.titleRuleColor ?? undefined;
    return allTitles
      ? applyToAllTitles(style, { titleRuleColorHex: undefined }, { titleRuleColorHex: color })
      : patchCvSectionStyle(style, key, { titleRuleColorHex: color });
  }
  if (!change.patch) return style;
  if (!allTitles) return patchCvSectionStyle(style, key, { title: change.patch });
  // Clear the SAME text properties this patch writes (font, size, weight, or
  // colour) from every section's title override, then write the new
  // document-wide value.
  const inherit = Object.fromEntries(
    Object.keys(change.patch).map((k) => [k, undefined]),
  ) as CvTextStyle;
  return mergeTitleStyle(clearSectionTitleOverrides(style, { title: inherit }), change.patch);
}

/** Clears one rule property from every entry in a section before its
 * section-wide ("All experiences") value is written, so an entry the user styled
 * on its own adopts the new line instead of silently keeping the old. The title
 * layer's `applyToAllTitles` does the same one level up. */
function applyToAllEntries(
  style: CvStyle,
  key: CvSectionKey,
  inherit: Partial<CvElementStyle>,
  patch: Partial<CvSectionStyle>,
): CvStyle {
  return patchCvSectionStyle(clearSectionEntryRuleOverrides(style, key, inherit), key, patch);
}

/** Body selections: the section rule/separator properties are section-level
 * whatever the font scope selector says; everything else follows the scope. */
function applyBodyScopeChange(
  style: CvStyle,
  sel: CvPreviewSelection,
  change: CvStylePanelChange,
): CvStyle {
  const key = sel.sectionKey;
  // Section body-rule (divider) is a section-level property - written at section
  // scope regardless of the font scope selector.
  if (change.bodyBorder !== undefined) {
    return applyToAllEntries(
      style,
      key,
      { borderStyle: undefined },
      { bodyBorder: change.bodyBorder ?? undefined },
    );
  }
  if (change.bodyRuleWidth !== undefined) {
    return applyToAllEntries(
      style,
      key,
      { ruleWidthPt: undefined },
      { bodyRuleWidthPt: change.bodyRuleWidth ?? undefined },
    );
  }
  if (change.bodyRuleColor !== undefined) {
    return applyToAllEntries(
      style,
      key,
      { ruleColorHex: undefined },
      { bodyRuleColorHex: change.bodyRuleColor ?? undefined },
    );
  }
  if (change.separatorColor !== undefined) {
    return patchCvSectionStyle(style, key, {
      separatorColorHex: change.separatorColor ?? undefined,
    });
  }
  if (change.separatorSize !== undefined) {
    return patchCvSectionStyle(style, key, { separatorSizePt: change.separatorSize ?? undefined });
  }
  if (change.scope === 'bullets') {
    // "All achievements": the section-shared bullet style. Applying it wipes the
    // per-bullet overrides so every bullet adopts the shared value uniformly; a
    // reset has nothing to make uniform, so it leaves them alone.
    const bulletStyle = change.reset ? BULLET_INHERIT : (change.patch ?? {});
    const base = change.reset ? style : clearSectionElementOverrides(style, key, true);
    return patchCvSectionStyle(base, key, { bulletStyle });
  }
  if (change.scope === 'section') {
    if (change.reset) return resetCvSectionStyle(style, key);
    // Applying to the whole section (e.g. "All experiences") first wipes the
    // per-entry/field overrides in it (bullets excepted - their own scope), so
    // EVERY entry adopts the section value uniformly instead of the
    // individually-styled ones silently keeping their old colour.
    return patchCvSectionStyle(clearSectionElementOverrides(style, key), key, change.patch ?? {});
  }
  if (change.scope === 'element') {
    const path = sel.elementPath;
    if (!path) return style;
    return change.reset
      ? resetCvElementStyle(style, path)
      : patchCvElementStyle(style, path, change.patch ?? {});
  }
  // document scope: reset is deferred to the global "reset all styling".
  if (change.reset) return style;
  return patchCvDocumentBody(style, change.patch ?? {});
}

/**
 * The style a scope-tagged panel change produces, for the current live
 * selection. Returns the style unchanged when the change has nothing to write
 * (an element-scope change with no selected leaf, a document-scope body reset,
 * or a title change carrying no patch), so the caller can commit
 * unconditionally.
 */
export function routeCvStyleChange(
  style: CvStyle,
  sel: CvPreviewSelection,
  change: CvStylePanelChange,
): CvStyle {
  return sel.part === 'title'
    ? applyTitleScopeChange(style, sel.sectionKey, change)
    : applyBodyScopeChange(style, sel, change);
}
