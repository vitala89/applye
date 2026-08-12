import { Injectable, type Signal } from '@angular/core';
import type {
  CvPreviewSelection,
  CvSectionKey,
  CvStyle,
  CvThemeDescriptor,
  PhotoPlacement,
} from '@applye/core';
import {
  effectiveSectionStyle,
  effectiveTitleBorder,
  effectiveTitleRuleColor,
  effectiveTitleRuleWidth,
  effectiveTitleStyle,
  themeTitleRule,
} from '@applye/core';

/** What the CSS rules are computed from. Passed in rather than injected: these
 * are the host component's own inputs, and a second source of them would be a
 * second truth. */
export interface CvPreviewStyleDeps {
  style: Signal<CvStyle>;
  selection: Signal<CvPreviewSelection | null>;
  theme: Signal<CvThemeDescriptor>;
  host: () => HTMLElement;
}

/**
 * Every CSS object the CV preview renders: the effective per-section style and
 * the `[ngStyle]` maps for bodies, leaves, entries, bullets and titles.
 *
 * Split out of `cv-preview.component.ts` when it was still 816/400 after the
 * editing cut (ADR-0005, level three). Thirteen of its reads are the document
 * style, so it is nearly a pure function of it - but `readSelectedHostStyle`
 * measures the live DOM, which is why this is a service in the app rather than
 * anything in `libs/application`.
 *
 * Provided by `CvPreviewComponent`, which binds its inputs once.
 */
@Injectable()
export class CvPreviewStyleService {
  private deps!: CvPreviewStyleDeps;

  bind(deps: CvPreviewStyleDeps): void {
    this.deps = deps;
  }

  /** Effective font/size/weight/colour for a section - its own override
   * merged over the document-wide style (`effectiveSectionStyle`). */
  effStyle(key: CvSectionKey) {
    return effectiveSectionStyle(this.deps.style(), key);
  }

  /** Body-text style for a section wrapper. `color` resolves section colour
   * over the document-wide `bodyColorHex` (element → section → document →
   * none, per the no-accent-leak rule) - emitted ONLY when one of those two
   * is actually set, so an untouched document/section never picks up
   * `accentColorHex` via `effStyle`'s (title-oriented) fallback. */
  bodyCss(key: CvSectionKey): Record<string, string> {
    const s = this.effStyle(key);
    const css: Record<string, string> = {
      'font-family': s.fontFamily,
      'font-size': `${s.fontSizePt}pt`,
      'font-weight': String(s.fontWeight),
    };
    if (s.lineHeight !== undefined) {
      css['line-height'] = String(s.lineHeight);
      css['--cv-section-line-height'] = String(s.lineHeight);
    }
    const color =
      this.deps.style().sectionStyles?.[key]?.colorHex ?? this.deps.style().bodyColorHex;
    if (color) {
      css['color'] = color;
      css['--cv-section-body-color'] = color;
    }
    // User overrides for the section's body divider (the personal-details
    // header underline / an experience entry's role-dates rule). Both rule
    // families read the SAME override - a section only draws one of them, so
    // setting both here is harmless and keeps this generic. Unset → the theme
    // rule (or none) stands.
    const sec = this.deps.style().sectionStyles?.[key];
    if (sec?.bodyRuleWidthPt != null) {
      const w = `${sec.bodyRuleWidthPt}pt`;
      css['--cv-header-rule-width'] = w;
      css['--cv-entry-rule-width'] = w;
    }
    if (sec?.bodyRuleColorHex) {
      css['--cv-header-rule-color'] = sec.bodyRuleColorHex;
      css['--cv-entry-rule-color'] = sec.bodyRuleColorHex;
    }
    // Divider style. 'none' must win over any theme width, so zero the width
    // too - a themed rule sets its width from the root and would otherwise
    // keep drawing a solid line through `border-style: none`'s zero-height box
    // in some engines. Unset → the theme's (solid) rule stands.
    if (sec?.bodyBorder) {
      if (sec.bodyBorder === 'none') {
        css['--cv-header-rule-width'] = '0';
        css['--cv-entry-rule-width'] = '0';
      } else {
        css['--cv-header-rule-style'] = sec.bodyBorder;
        css['--cv-entry-rule-style'] = sec.bodyBorder;
      }
    }
    // In-line item separators (the `|` between languages, etc.). Scoped to the
    // section wrapper, so a section only styles its own separators.
    if (sec?.separatorColorHex) css['--cv-sep-color'] = sec.separatorColorHex;
    if (sec?.separatorSizePt != null) css['--cv-sep-size'] = `${sec.separatorSizePt}pt`;
    return css;
  }

  /** Element-scope style DELTA for a single body leaf (Phase D.2's per-element
   * cascade layer) - ONLY the CSS properties actually SET in
   * `style().elementStyles[path]`, mapped 1:1: `fontFamily`→`font-family`,
   * `fontSizePt`→`font-size:<n>pt`, `fontWeight`→`font-weight`,
   * `colorHex`→`color`, `lineHeight`→`line-height`. Deliberately NOT the full
   * resolved cascade (`effectiveLeafStyle`): a leaf with no override returns
   * `{}` so it renders with no leaf-level inline style at all (byte-identical
   * resting output to before this task) and keeps inheriting the section's
   * `bodyCss`, already applied on the section wrapper, through normal CSS
   * inheritance. `color` therefore only ever appears here when the ELEMENT
   * override itself set it - this layer never falls back to the section or
   * document accent colour (mirrors the no-accent-leak rule already enforced
   * by `bodyCss`/`effectiveLeafStyle`, see `015c2e3`). Bound on the leaf
   * element itself (not the wrapper) in both the resting `@else` branch
   * (rendered in the page card AND the hidden measurement mirror - pure
   * typography, so it must affect pagination) and the inline editor branch,
   * so an editing leaf looks the same as its resting counterpart. */
  leafCss(path: string): Record<string, string> {
    const o = this.deps.style().elementStyles?.[path];
    if (!o) return {};
    const css: Record<string, string> = {};
    if (o.fontFamily !== undefined) css['font-family'] = o.fontFamily;
    if (o.fontSizePt !== undefined) css['font-size'] = `${o.fontSizePt}pt`;
    if (o.fontWeight !== undefined) css['font-weight'] = String(o.fontWeight);
    if (o.colorHex !== undefined) css['color'] = o.colorHex;
    if (o.lineHeight !== undefined) css['line-height'] = String(o.lineHeight);
    // Per-leaf bottom rule (underline). 'none'/unset draws nothing; a set
    // style turns it on with a 1pt/accent default so a leaf with only a style
    // picked still shows a line.
    if (o.borderStyle && o.borderStyle !== 'none') {
      const w = o.ruleWidthPt ?? 1;
      const c = o.ruleColorHex ?? this.deps.style().accentColorHex;
      css['border-bottom'] = `${w}pt ${o.borderStyle} ${c}`;
      css['padding-bottom'] = '2px';
      // The selectable/selected 4px `border-radius` would curve the rule's
      // ends inward - square them, matching the section-title/header fix.
      css['border-bottom-left-radius'] = '0';
      css['border-bottom-right-radius'] = '0';
    }
    return css;
  }

  /** Live typography of the currently-selected host on the VISIBLE page -
   * read straight from the rendered DOM (never the hidden `aria-hidden`
   * measurement pass) so the live-style panel's "Ag" swatch mirrors exactly
   * what's on the paper, including class/theme styling the `CvStyle` model
   * doesn't carry (the name's uppercase bold monospace, a title's casing, an
   * accent colour applied via a CSS var). Font SIZE is intentionally omitted
   * - the swatch has its own fixed sizing. Returns `null` with nothing
   * selected or before the node has rendered. */
  readSelectedHostStyle(): Record<string, string> | null {
    if (!this.deps.selection()) return null;
    const nodes = this.deps
      .host()
      .querySelectorAll<HTMLElement>('.cvpreview__element-selected, .cvpreview__selected');
    const host = Array.from(nodes).find((n) => !n.closest('.paginated-sheet__measure'));
    if (!host) return null;
    const cs = getComputedStyle(host);
    return {
      'font-family': cs.fontFamily,
      'font-weight': cs.fontWeight,
      color: cs.color,
      'font-style': cs.fontStyle,
      'text-transform': cs.textTransform,
      'letter-spacing': cs.letterSpacing,
      // The host IS the element carrying the underline (a title, a leaf), so
      // this is the rule's real colour - including the neutral CSS default,
      // which the panel cannot resolve from the style model alone.
      'border-bottom-color': cs.borderBottomColor,
    };
  }

  /** Style for a whole experience/education ENTRY head element: the entry's
   * own leaf override PLUS its colour mirrored into `--cv-entry-color`, so the
   * head sub-parts that carry their own colour by default (the company accent,
   * the muted dates) follow the per-entry override too - i.e. an element-scope
   * colour recolours the whole framed head line, not the bullets below it. */
  entryCss(path: string): Record<string, string> {
    const css = this.leafCss(path);
    if (css['color']) css['--cv-entry-color'] = css['color'];
    // An entry wraps its head AND its bullets, so a bottom rule HERE would draw
    // under the bullets rather than under the head - reading as a stray second
    // line. Strip it, and re-express the entry's stored rule as the head's own
    // vars below: `bodyCss` sets those on the section, so setting them again on
    // this entry overrides the section's rule for this entry ALONE. That is
    // what "This experience" means, as against "All experiences".
    delete css['border-bottom'];
    delete css['padding-bottom'];
    delete css['border-bottom-left-radius'];
    delete css['border-bottom-right-radius'];

    const o = this.deps.style().elementStyles?.[path];
    if (o?.borderStyle === 'none') {
      // Zeroing the WIDTH is what turns a rule off: the theme/section sets the
      // width from its own vars, so `border-style: none` alone would leave it.
      css['--cv-entry-rule-width'] = '0pt';
    } else {
      if (o?.borderStyle) css['--cv-entry-rule-style'] = o.borderStyle;
      if (o?.ruleWidthPt != null) css['--cv-entry-rule-width'] = `${o.ruleWidthPt}pt`;
      if (o?.ruleColorHex) css['--cv-entry-rule-color'] = o.ruleColorHex;
    }
    return css;
  }

  /** CSS for a section's SHARED bullet style (the "all achievements" scope),
   * layered on the bullet list under each bullet's own per-leaf override. */
  bulletCss(key: CvSectionKey): Record<string, string> {
    const o = this.deps.style().sectionStyles?.[key]?.bulletStyle;
    if (!o) return {};
    const css: Record<string, string> = {};
    if (o.fontFamily !== undefined) css['font-family'] = o.fontFamily;
    if (o.fontSizePt !== undefined) css['font-size'] = `${o.fontSizePt}pt`;
    if (o.fontWeight !== undefined) css['font-weight'] = String(o.fontWeight);
    if (o.colorHex !== undefined) css['color'] = o.colorHex;
    if (o.lineHeight !== undefined) css['line-height'] = String(o.lineHeight);
    return css;
  }

  /** Full style for the bullet list. Bullets are DELIBERATELY independent of
   * the section-body ("All experiences") scope - that scope styles the entry
   * heads only. So the base here is the DOCUMENT typography (never the section
   * override), with the shared bullet style ("All achievements") layered on
   * top; each bullet's own per-leaf override still wins on its `<li>`. No
   * colour in the base, so bullets keep their muted default unless a bullet or
   * "All achievements" override sets one. */
  bulletListCss(key: CvSectionKey): Record<string, string> {
    const s = this.deps.style();
    return {
      'font-family': s.fontFamily,
      'font-size': `${s.fontSizePt}pt`,
      'font-weight': String(s.fontWeight),
      ...this.bulletCss(key),
    };
  }

  /** Title style for a section heading. */
  titleCss(key: CvSectionKey): Record<string, string> {
    const s = effectiveTitleStyle(this.deps.style(), key);
    return {
      'font-family': s.fontFamily,
      'font-size': `${s.fontSizePt}pt`,
      'font-weight': String(s.fontWeight),
      color: s.colorHex,
    };
  }

  /** Title underline as a `border-bottom` string for `[style.borderBottom]`.
   * When the active theme defines an accent/muted section rule and the user
   * hasn't explicitly set their own title border, the theme's colour/weight
   * wins (Aurora); otherwise falls back to the neutral default (Classic,
   * whose `ruleColor` is `'none'`, always takes this branch). */
  titleBorderCss(key: CvSectionKey): string {
    const b = effectiveTitleBorder(this.deps.style(), key);
    if (b === 'none') return 'none';
    // User overrides (live-style "line size"/"line colour") win over the theme;
    // each falls back independently to the theme's own rule, then to the
    // neutral CSS default for a theme that draws none (Classic).
    //
    // Picking a line STYLE does not drop the theme's weight/colour: choosing
    // "dashed" must change the dashes only, or the line silently thins to 1pt
    // and fades to the neutral grey - and the panel could then never show the
    // size it renders at.
    const userW = effectiveTitleRuleWidth(this.deps.style(), key);
    const userC = effectiveTitleRuleColor(this.deps.style(), key);
    const rule = themeTitleRule(this.deps.theme());
    const width = userW ?? rule?.widthPt;
    const color = userC ?? rule?.colorHex;
    return `${width != null ? `${width}pt` : 'var(--border-width)'} ${b} ${
      color ?? 'var(--border-subtle)'
    }`;
  }

  headerPlacementClass(placement: PhotoPlacement): string {
    const suffix =
      placement === 'above_center' ? 'center' : placement === 'above_right' ? 'right' : 'left';
    return `cvpreview__header--${suffix}`;
  }
}
