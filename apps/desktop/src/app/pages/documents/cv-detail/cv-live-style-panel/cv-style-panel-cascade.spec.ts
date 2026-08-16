import { CV_STYLE_DEFAULT } from '@applye/core';
import type { CvPreviewSelection, CvStyle } from '@applye/core';

import {
  bodyOverrideAt,
  elementBorderAt,
  elementBorderPatch,
  elementRuleColorAt,
  elementRuleWidthAt,
  rgbToHex,
  ruleColorSwatch,
  showsBodyRule,
  showsElementLine,
  titleOverrideAt,
  titleRuleWidthAt,
} from './cv-style-panel-cascade';

/**
 * These pin the property that separates this module from its twin in
 * `libs/core`: every cascade here ends in `undefined` / `null` / `''` so a
 * control reads "Inherit", where `effectiveLeafStyle` and `effectiveTitleStyle`
 * end in a concrete value so a renderer can draw. Swapping one for the other is
 * the mistake these tests exist to fail on.
 */

const body = (sectionKey: CvPreviewSelection['sectionKey'], elementPath?: string) =>
  ({ part: 'body', sectionKey, elementPath }) as CvPreviewSelection;
const title = (sectionKey: CvPreviewSelection['sectionKey']) =>
  ({ part: 'title', sectionKey }) as CvPreviewSelection;

describe('cv-style-panel-cascade: no value is invented', () => {
  it('leaves body colour unset when nobody has picked one', () => {
    // The no-accent-leak rule. `effectiveLeafStyle` would answer
    // `accentColorHex` here, and the picker would show a colour the user never
    // chose over text that is not that colour.
    const o = bodyOverrideAt(CV_STYLE_DEFAULT, body('experience', 'exp.0.role'), 'element');
    expect(o.colorHex).toBeUndefined();
  });

  it('leaves a bullet colourless even when the section and document set one', () => {
    const style: CvStyle = {
      ...CV_STYLE_DEFAULT,
      // BOTH levels are set on purpose. With only the section set, the document
      // fallback is undefined anyway and the assertion below passes whether or
      // not the bullet base is allowed to reach it - which is exactly what a
      // mutation of that line proved.
      bodyColorHex: '#445566',
      sectionStyles: { experience: { colorHex: '#112233' } },
    };
    // A bullet's base is the shared bullet style, which has no colour of its
    // own and must not fall through to either.
    expect(bodyOverrideAt(style, body('experience', 'exp.0.bullet.1'), 'element').colorHex).toBe(
      undefined,
    );
    expect(bodyOverrideAt(style, body('experience', 'exp.0.bullet.1'), 'bullets').colorHex).toBe(
      undefined,
    );
    // The same section, on a non-bullet leaf, does inherit it.
    expect(bodyOverrideAt(style, body('experience', 'exp.0.role'), 'element').colorHex).toBe(
      '#112233',
    );
    // And with no section colour, a non-bullet leaf reaches the document one -
    // the fallback the bullet is denied.
    expect(
      bodyOverrideAt({ ...style, sectionStyles: {} }, body('experience', 'exp.0.role'), 'element')
        .colorHex,
    ).toBe('#445566');
  });

  it('skips the section scope for the bullets scope', () => {
    const style: CvStyle = {
      ...CV_STYLE_DEFAULT,
      sectionStyles: { experience: { fontSizePt: 99, bulletStyle: {} } },
    };
    // Bullets inherit the DOCUMENT, not the section - that scope styles the
    // entry heads only.
    expect(bodyOverrideAt(style, body('experience', 'exp.0.bullet.1'), 'bullets').fontSizePt).toBe(
      CV_STYLE_DEFAULT.fontSizePt,
    );
    expect(bodyOverrideAt(style, body('experience', 'exp.0.role'), 'section').fontSizePt).toBe(99);
  });

  it('returns nothing at all for a null selection', () => {
    expect(bodyOverrideAt(CV_STYLE_DEFAULT, null, 'element')).toEqual({});
    expect(titleOverrideAt(CV_STYLE_DEFAULT, null, 'section')).toEqual({});
    expect(
      titleRuleWidthAt(CV_STYLE_DEFAULT, null, 'section', { widthPt: 3, colorHex: '#f00' }),
    ).toBeNull();
  });
});

describe('cv-style-panel-cascade: a scope shows what it inherits', () => {
  it('shows the all-titles value at "this title" when the section sets none', () => {
    const style: CvStyle = { ...CV_STYLE_DEFAULT, titleStyle: { fontSizePt: 21 } };
    // Otherwise switching scope after an all-titles edit leaves a stale blank.
    expect(titleOverrideAt(style, title('experience'), 'section').fontSizePt).toBe(21);
  });

  it('lets a per-section title override win over the all-titles one', () => {
    const style: CvStyle = {
      ...CV_STYLE_DEFAULT,
      titleStyle: { fontSizePt: 21 },
      sectionStyles: { experience: { title: { fontSizePt: 9 } } },
    };
    expect(titleOverrideAt(style, title('experience'), 'section').fontSizePt).toBe(9);
    expect(titleOverrideAt(style, title('experience'), 'document').fontSizePt).toBe(21);
  });

  it('falls through to the theme rule for a title underline nobody overrode', () => {
    const themed = titleRuleWidthAt(CV_STYLE_DEFAULT, title('experience'), 'section', {
      widthPt: 2,
      colorHex: '#abcdef',
    });
    expect(themed).toBe(2);
    // With no theme rule either, the neutral default lives in CSS tokens and
    // must read as Inherit rather than be forked into TS.
    expect(titleRuleWidthAt(CV_STYLE_DEFAULT, title('experience'), 'section', null)).toBeNull();
  });
});

describe('cv-style-panel-cascade: an experience entry inherits its line, a leaf does not', () => {
  const theme = { widthPt: 4, colorHex: '#00ff00' };

  it('reports the theme rule an entry head actually draws', () => {
    expect(elementBorderAt(CV_STYLE_DEFAULT, body('experience', 'exp.0'), theme)).toBe('solid');
    expect(elementRuleWidthAt(CV_STYLE_DEFAULT, body('experience', 'exp.0'), theme)).toBe(4);
    expect(elementRuleColorAt(CV_STYLE_DEFAULT, body('experience', 'exp.0'), theme)).toBe(
      '#00ff00',
    );
  });

  it('reports nothing for a plain leaf, which has no such fallback', () => {
    expect(elementBorderAt(CV_STYLE_DEFAULT, body('experience', 'exp.0.role'), theme)).toBe('');
    expect(
      elementRuleWidthAt(CV_STYLE_DEFAULT, body('experience', 'exp.0.role'), theme),
    ).toBeNull();
  });

  it('prefers the section divider over the theme for an entry', () => {
    const style: CvStyle = {
      ...CV_STYLE_DEFAULT,
      sectionStyles: { experience: { bodyBorder: 'dashed', bodyRuleWidthPt: 7 } },
    };
    expect(elementBorderAt(style, body('experience', 'exp.0'), theme)).toBe('dashed');
    expect(elementRuleWidthAt(style, body('experience', 'exp.0'), theme)).toBe(7);
  });

  it('stores an explicit none for an entry and clears for a leaf', () => {
    // They differ because absent means "inherit the section's divider" for an
    // entry: clearing would hand the line straight back.
    expect(elementBorderPatch(body('experience', 'exp.0'), 'none')).toEqual({
      borderStyle: 'none',
    });
    expect(elementBorderPatch(body('experience', 'exp.0.role'), 'none')).toEqual({
      borderStyle: undefined,
      ruleWidthPt: undefined,
      ruleColorHex: undefined,
    });
  });

  it('clears the whole rule for Inherit, whatever is selected', () => {
    expect(elementBorderPatch(body('experience', 'exp.0'), '')).toEqual({
      borderStyle: undefined,
      ruleWidthPt: undefined,
      ruleColorHex: undefined,
    });
  });
});

describe('cv-style-panel-cascade: which controls are offered', () => {
  it('offers the section body rule only at section scope, and only where one is drawn', () => {
    expect(showsBodyRule(body('experience'), 'section')).toBe(true);
    expect(showsBodyRule(body('personal_details'), 'section')).toBe(true);
    // At element scope the entry's own line group is the honest control -
    // showing this one there is what made a "This experience" edit restyle
    // every entry.
    expect(showsBodyRule(body('experience'), 'element')).toBe(false);
    expect(showsBodyRule(body('languages'), 'section')).toBe(false);
    expect(showsBodyRule(title('experience'), 'section')).toBe(false);
  });

  it('offers a per-leaf line except where the head draws none', () => {
    expect(showsElementLine(body('experience', 'exp.0.role'), 'element')).toBe(true);
    expect(showsElementLine(body('experience', 'exp.0'), 'element')).toBe(true);
    // An education or skills entry head draws no rule, so the control would do
    // nothing; the composed contact line has no single baseline.
    expect(showsElementLine(body('education', 'edu.0'), 'element')).toBe(false);
    expect(showsElementLine(body('personal_details', 'pd.contact'), 'element')).toBe(false);
    expect(showsElementLine(body('experience', 'exp.0.role'), 'section')).toBe(false);
  });
});

describe('cv-style-panel-cascade: colour parsing for <input type="color">', () => {
  it('converts a computed rgb() to hex and passes hex through', () => {
    expect(rgbToHex('rgb(0, 128, 255)')).toBe('#0080ff');
    expect(rgbToHex('rgba(1, 2, 3, 0.5)')).toBe('#010203');
    expect(rgbToHex('#abcdef')).toBe('#abcdef');
  });

  it('returns null rather than guessing when it cannot parse', () => {
    expect(rgbToHex(undefined)).toBeNull();
    expect(rgbToHex('currentColor')).toBeNull();
  });

  it('falls back through the rendered host before the accent', () => {
    const host = { 'border-bottom-color': 'rgb(17, 34, 51)' };
    expect(ruleColorSwatch(null, host, '#ff0000')).toBe('#112233');
    expect(ruleColorSwatch('#0000ff', host, '#ff0000')).toBe('#0000ff');
    // The accent is the last resort, for a selection whose host was not read.
    expect(ruleColorSwatch(null, {}, '#ff0000')).toBe('#ff0000');
  });
});
