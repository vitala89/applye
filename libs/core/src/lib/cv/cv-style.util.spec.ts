import {
  clearSectionElementOverrides,
  effectiveLeafStyle,
  effectiveSectionStyle,
  effectiveTitleBorder,
  effectiveTitleRuleColor,
  effectiveTitleRuleWidth,
  effectiveTitleStyle,
  patchCvDocumentBody,
  patchCvElementStyle,
  patchCvSectionStyle,
  resetCvElementStyle,
  resetCvSectionStyle,
} from './cv-style.util';
import { CV_STYLE_DEFAULT, CvStyle } from '../models/cv-style.model';

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

  it('preserves the CSS baseline when line height is absent and resolves an explicit override', () => {
    expect(effectiveSectionStyle(base, 'summary').lineHeight).toBeUndefined();
    const s: CvStyle = { ...base, sectionStyles: { summary: { lineHeight: 1.6 } } };
    expect(effectiveSectionStyle(s, 'summary').lineHeight).toBe(1.6);
  });

  it('ignores loaded line heights outside the supported 1.0-2.0 range', () => {
    const low: CvStyle = { ...base, sectionStyles: { summary: { lineHeight: 0.9 } } };
    const high: CvStyle = { ...base, sectionStyles: { summary: { lineHeight: 2.1 } } };
    const nonFinite: CvStyle = {
      ...base,
      sectionStyles: { summary: { lineHeight: Number.NaN } },
    };
    expect(effectiveSectionStyle(low, 'summary').lineHeight).toBeUndefined();
    expect(effectiveSectionStyle(high, 'summary').lineHeight).toBeUndefined();
    expect(effectiveSectionStyle(nonFinite, 'summary').lineHeight).toBeUndefined();
  });

  it('legacy style_json (no fontWeight) defaults to 400 after CV_STYLE_DEFAULT merge', () => {
    const legacy = { fontFamily: 'Arial', fontSizePt: 10, accentColorHex: '#111111' };
    const merged: CvStyle = { ...CV_STYLE_DEFAULT, ...legacy };
    expect(effectiveSectionStyle(merged, 'summary').fontWeight).toBe(400);
    expect(effectiveSectionStyle(merged, 'summary').fontFamily).toBe('Arial');
  });
});

describe('patchCvSectionStyle', () => {
  it('deep-merges title changes and recursively prunes inherited empty overrides', () => {
    const original: CvStyle = {
      ...CV_STYLE_DEFAULT,
      sectionStyles: {
        summary: {
          fontFamily: 'Arial',
          colorHex: '#111111',
          title: { fontSizePt: 14, colorHex: '#222222' },
        },
      },
    };

    const changed = patchCvSectionStyle(original, 'summary', {
      fontFamily: undefined,
      title: { colorHex: undefined, fontWeight: 700 },
    });
    expect(changed.sectionStyles?.summary).toEqual({
      colorHex: '#111111',
      title: { fontSizePt: 14, fontWeight: 700 },
    });
    expect(original.sectionStyles?.summary).toEqual({
      fontFamily: 'Arial',
      colorHex: '#111111',
      title: { fontSizePt: 14, colorHex: '#222222' },
    });

    const pruned = patchCvSectionStyle(changed, 'summary', {
      colorHex: undefined,
      title: { fontSizePt: undefined, fontWeight: undefined },
    });
    expect(pruned.sectionStyles).toBeUndefined();
  });

  it('prunes an invalid line-height patch instead of persisting it', () => {
    const original: CvStyle = {
      ...CV_STYLE_DEFAULT,
      sectionStyles: { summary: { lineHeight: 1.6, fontFamily: 'Arial' } },
    };
    expect(patchCvSectionStyle(original, 'summary', { lineHeight: 3 }).sectionStyles).toEqual({
      summary: { fontFamily: 'Arial' },
    });
    expect(patchCvSectionStyle(original, 'summary', { colorHex: '#111111' }).sectionStyles).toEqual(
      {
        summary: { fontFamily: 'Arial', lineHeight: 1.6, colorHex: '#111111' },
      },
    );
  });

  it('resets one section without disturbing other overrides', () => {
    const original: CvStyle = {
      ...CV_STYLE_DEFAULT,
      sectionStyles: { summary: { lineHeight: 1.6 }, skills: { fontFamily: 'Arial' } },
    };
    expect(resetCvSectionStyle(original, 'summary').sectionStyles).toEqual({
      skills: { fontFamily: 'Arial' },
    });
    expect(
      resetCvSectionStyle(
        { ...original, sectionStyles: { summary: { lineHeight: 1.6 } } },
        'summary',
      ).sectionStyles,
    ).toBeUndefined();
  });
});

describe('patchCvElementStyle', () => {
  it('writes a new element override', () => {
    const original: CvStyle = { ...CV_STYLE_DEFAULT };
    const changed = patchCvElementStyle(original, 'summary.body', {
      fontFamily: 'Arial',
      fontSizePt: 12,
    });
    expect(changed.elementStyles).toEqual({
      'summary.body': { fontFamily: 'Arial', fontSizePt: 12 },
    });
    expect(original.elementStyles).toBeUndefined();
  });

  it('merges into an existing override and prunes inherited (undefined) fields', () => {
    const original: CvStyle = {
      ...CV_STYLE_DEFAULT,
      elementStyles: { 'summary.body': { fontFamily: 'Arial', colorHex: '#111111' } },
    };
    const originalElementStyles = original.elementStyles;
    const originalOverride = original.elementStyles!['summary.body'];
    const changed = patchCvElementStyle(original, 'summary.body', {
      fontFamily: undefined,
      fontWeight: 700,
    });
    expect(changed.elementStyles).toEqual({
      'summary.body': { colorHex: '#111111', fontWeight: 700 },
    });
    // Ref-equality immutability (T1 review minor): `original` and its nested
    // `elementStyles`/override objects must be untouched by the merge - a
    // mutating implementation would still pass the `toEqual` above (it reads
    // the mutated `original` back) but fail these reference checks.
    expect(changed).not.toBe(original);
    expect(changed.elementStyles).not.toBe(originalElementStyles);
    expect(original.elementStyles).toBe(originalElementStyles);
    expect(original.elementStyles!['summary.body']).toBe(originalOverride);
    expect(originalOverride).toEqual({ fontFamily: 'Arial', colorHex: '#111111' });
  });

  it('removes the element override once every field is pruned, and drops an emptied elementStyles map', () => {
    const original: CvStyle = {
      ...CV_STYLE_DEFAULT,
      elementStyles: { 'summary.body': { fontFamily: 'Arial' } },
    };
    const pruned = patchCvElementStyle(original, 'summary.body', { fontFamily: undefined });
    expect(pruned.elementStyles).toBeUndefined();
  });

  it('preserves sibling element overrides untouched', () => {
    const original: CvStyle = {
      ...CV_STYLE_DEFAULT,
      elementStyles: {
        'summary.body': { fontFamily: 'Arial' },
        'experience.0.bullet.0': { colorHex: '#0a5' },
      },
    };
    const changed = patchCvElementStyle(original, 'summary.body', { fontSizePt: 13 });
    expect(changed.elementStyles).toEqual({
      'summary.body': { fontFamily: 'Arial', fontSizePt: 13 },
      'experience.0.bullet.0': { colorHex: '#0a5' },
    });
    // Ref-equality (T1 review minor): the untouched sibling override object
    // itself is carried over, not just value-equal to it.
    expect(changed.elementStyles!['experience.0.bullet.0']).toBe(
      original.elementStyles!['experience.0.bullet.0'],
    );
  });

  it('prunes an invalid line-height patch instead of persisting it', () => {
    const original: CvStyle = { ...CV_STYLE_DEFAULT };
    const changed = patchCvElementStyle(original, 'summary.body', {
      fontFamily: 'Arial',
      lineHeight: 3,
    });
    expect(changed.elementStyles).toEqual({ 'summary.body': { fontFamily: 'Arial' } });
  });
});

describe('resetCvElementStyle', () => {
  it('removes only the targeted path, preserving siblings', () => {
    const original: CvStyle = {
      ...CV_STYLE_DEFAULT,
      elementStyles: {
        'summary.body': { fontFamily: 'Arial' },
        'experience.0.bullet.0': { colorHex: '#0a5' },
      },
    };
    expect(resetCvElementStyle(original, 'summary.body').elementStyles).toEqual({
      'experience.0.bullet.0': { colorHex: '#0a5' },
    });
  });

  it('drops the elementStyles map once it becomes empty', () => {
    const original: CvStyle = {
      ...CV_STYLE_DEFAULT,
      elementStyles: { 'summary.body': { fontFamily: 'Arial' } },
    };
    expect(resetCvElementStyle(original, 'summary.body').elementStyles).toBeUndefined();
  });
});

describe('patchCvDocumentBody', () => {
  it('maps colorHex to bodyColorHex (NOT accentColorHex) and applies the other root fields', () => {
    // Regression: the "Whole document" body colour scope used to write
    // accentColorHex, which body text never reads (no-accent-leak rule) - so
    // it recoloured titles/name instead of the body it was meant to target.
    const original: CvStyle = { ...CV_STYLE_DEFAULT };
    const changed = patchCvDocumentBody(original, {
      fontFamily: 'Georgia',
      fontSizePt: 12,
      fontWeight: 700,
      colorHex: '#123456',
    });
    expect(changed).toEqual({
      ...CV_STYLE_DEFAULT,
      fontFamily: 'Georgia',
      fontSizePt: 12,
      fontWeight: 700,
      bodyColorHex: '#123456',
    });
    // accentColorHex (title/rule colour) must stay untouched by a body edit.
    expect(changed.accentColorHex).toBe(CV_STYLE_DEFAULT.accentColorHex);
  });

  it('ignores lineHeight (no root field for it) and leaves other maps untouched', () => {
    const original: CvStyle = {
      ...CV_STYLE_DEFAULT,
      sectionStyles: { summary: { fontFamily: 'Arial' } },
      elementStyles: { 'summary.body': { colorHex: '#0a5' } },
      titleStyle: { fontSizePt: 14 },
    };
    const changed = patchCvDocumentBody(original, { fontSizePt: 13, lineHeight: 1.6 });
    expect(changed.fontSizePt).toBe(13);
    expect(changed.sectionStyles).toBe(original.sectionStyles);
    expect(changed.elementStyles).toBe(original.elementStyles);
    expect(changed.titleStyle).toBe(original.titleStyle);
    expect('lineHeight' in changed).toBe(false);
  });

  it('only applies provided keys, leaving the rest as-is', () => {
    const original: CvStyle = { ...CV_STYLE_DEFAULT };
    const changed = patchCvDocumentBody(original, { fontSizePt: 13 });
    expect(changed.fontFamily).toBe(original.fontFamily);
    expect(changed.accentColorHex).toBe(original.accentColorHex);
    expect(changed.fontWeight).toBe(original.fontWeight);
    expect(changed.fontSizePt).toBe(13);
  });
});

describe('effectiveLeafStyle', () => {
  const base: CvStyle = { ...CV_STYLE_DEFAULT };

  it('with no elementPath, returns the section resolution unchanged (colorHex undefined when un-overridden)', () => {
    expect(effectiveLeafStyle(base, 'summary', undefined)).toEqual({
      fontFamily: 'Calibri',
      fontSizePt: 11,
      fontWeight: 400,
      colorHex: undefined,
      lineHeight: undefined,
    });
  });

  it('an empty-string elementPath resolves the same as no elementPath at all (T1 review minor)', () => {
    // An empty path must fall through to the section resolution exactly like
    // `undefined` - and must NOT accidentally hit an unrelated real override
    // keyed by some other path (e.g. if a caller ever passed '' by mistake,
    // it must not silently pick up '' as a literal elementStyles key either).
    const s: CvStyle = {
      ...base,
      sectionStyles: { summary: { fontSizePt: 13 } },
      elementStyles: {
        'summary.body': { fontSizePt: 99 },
        '': { fontSizePt: 77 },
      },
    };
    expect(effectiveLeafStyle(s, 'summary', '')).toEqual(
      effectiveLeafStyle(s, 'summary', undefined),
    );
    expect(effectiveLeafStyle(s, 'summary', '').fontSizePt).toBe(13);
  });

  it('with an elementPath but no override at that path, returns the section resolution', () => {
    const s: CvStyle = { ...base, sectionStyles: { summary: { fontSizePt: 13 } } };
    expect(effectiveLeafStyle(s, 'summary', 'summary.body')).toEqual({
      fontFamily: 'Calibri',
      fontSizePt: 13,
      fontWeight: 400,
      colorHex: undefined,
      lineHeight: undefined,
    });
  });

  it('surfaces a per-leaf bottom rule with width/colour defaults when only the style is set', () => {
    const s: CvStyle = { ...base, elementStyles: { 'pd.name': { borderStyle: 'dashed' } } };
    const r = effectiveLeafStyle(s, 'personal_details', 'pd.name');
    expect(r.borderStyle).toBe('dashed');
    expect(r.ruleWidthPt).toBe(1);
    expect(r.ruleColorHex).toBe(base.accentColorHex);
  });

  it("draws no line when borderStyle is 'none' or unset - even with a stray width/colour", () => {
    const off: CvStyle = {
      ...base,
      elementStyles: {
        'pd.name': { borderStyle: 'none', ruleWidthPt: 3, ruleColorHex: '#ff0000' },
      },
    };
    const r = effectiveLeafStyle(off, 'personal_details', 'pd.name');
    expect(r.borderStyle).toBeUndefined();
    expect(r.ruleWidthPt).toBeUndefined();
    expect(r.ruleColorHex).toBeUndefined();
  });

  it('layers the element override over the section resolution', () => {
    const s: CvStyle = {
      ...base,
      sectionStyles: { summary: { fontSizePt: 13, fontFamily: 'Arial' } },
      elementStyles: { 'summary.body': { fontSizePt: 15 } },
    };
    expect(effectiveLeafStyle(s, 'summary', 'summary.body')).toEqual({
      fontFamily: 'Arial',
      fontSizePt: 15,
      fontWeight: 400,
      colorHex: undefined,
      lineHeight: undefined,
    });
  });

  it('colorHex stays undefined unless explicitly overridden at element, section, or document scope (no accent leak)', () => {
    expect(effectiveLeafStyle(base, 'summary', 'summary.body').colorHex).toBeUndefined();
    // An accent colour alone (no bodyColorHex) must never leak into the body.
    const accentOnly: CvStyle = { ...base, accentColorHex: '#1B7464' };
    expect(effectiveLeafStyle(accentOnly, 'summary', 'summary.body').colorHex).toBeUndefined();

    const sectionOverride: CvStyle = { ...base, sectionStyles: { summary: { colorHex: '#0a5' } } };
    expect(effectiveLeafStyle(sectionOverride, 'summary', 'summary.body').colorHex).toBe('#0a5');
    expect(effectiveLeafStyle(sectionOverride, 'summary', undefined).colorHex).toBe('#0a5');

    const elementOverride: CvStyle = {
      ...base,
      sectionStyles: { summary: { colorHex: '#0a5' } },
      elementStyles: { 'summary.body': { colorHex: '#123456' } },
    };
    expect(effectiveLeafStyle(elementOverride, 'summary', 'summary.body').colorHex).toBe('#123456');
  });

  it('resolves the document-wide bodyColorHex cascade layer (element > section > document > none)', () => {
    // Document bodyColorHex alone applies to every leaf with no section/
    // element override.
    const docOnly: CvStyle = { ...base, bodyColorHex: '#204060' };
    expect(effectiveLeafStyle(docOnly, 'summary', 'summary.body').colorHex).toBe('#204060');
    expect(effectiveLeafStyle(docOnly, 'skills', 'skills.0.values').colorHex).toBe('#204060');
    expect(effectiveLeafStyle(docOnly, 'summary', undefined).colorHex).toBe('#204060');

    // A section colorHex override beats the document bodyColorHex for that
    // section only; a sibling section still falls through to the document.
    const sectionBeatsDoc: CvStyle = {
      ...base,
      bodyColorHex: '#204060',
      sectionStyles: { summary: { colorHex: '#0a5' } },
    };
    expect(effectiveLeafStyle(sectionBeatsDoc, 'summary', 'summary.body').colorHex).toBe('#0a5');
    expect(effectiveLeafStyle(sectionBeatsDoc, 'skills', 'skills.0.values').colorHex).toBe(
      '#204060',
    );

    // An element colorHex override beats both the section and the document.
    const elementBeatsAll: CvStyle = {
      ...base,
      bodyColorHex: '#204060',
      sectionStyles: { summary: { colorHex: '#0a5' } },
      elementStyles: { 'summary.body': { colorHex: '#123456' } },
    };
    expect(effectiveLeafStyle(elementBeatsAll, 'summary', 'summary.body').colorHex).toBe('#123456');

    // Unset bodyColorHex (and no section/element override) never leaks the
    // accent colour into the body.
    expect(effectiveLeafStyle(base, 'summary', 'summary.body').colorHex).toBeUndefined();
  });

  it('validates lineHeight 1.0-2.0, falling back to the section value when the element override is invalid', () => {
    const s: CvStyle = {
      ...base,
      sectionStyles: { summary: { lineHeight: 1.6 } },
      elementStyles: { 'summary.body': { lineHeight: 3 } },
    };
    expect(effectiveLeafStyle(s, 'summary', 'summary.body').lineHeight).toBe(1.6);

    const validElement: CvStyle = {
      ...base,
      sectionStyles: { summary: { lineHeight: 1.6 } },
      elementStyles: { 'summary.body': { lineHeight: 1.8 } },
    };
    expect(effectiveLeafStyle(validElement, 'summary', 'summary.body').lineHeight).toBe(1.8);
  });
});

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

  it('clearSectionElementOverrides drops in-section head/field overrides, keeps bullets + siblings', () => {
    const style: CvStyle = {
      ...base,
      elementStyles: {
        'exp.0': { colorHex: '#111' },
        'exp.0.company': { colorHex: '#222' },
        'exp.0.bullet.1': { colorHex: '#333' },
        'edu.0': { colorHex: '#444' },
      },
    };
    // Heads/fields cleared for experience; the bullet and the education sibling stay.
    const heads = clearSectionElementOverrides(style, 'experience');
    expect(heads.elementStyles).toEqual({
      'exp.0.bullet.1': { colorHex: '#333' },
      'edu.0': { colorHex: '#444' },
    });
    // bullets:true clears ONLY the bullet override.
    const bullets = clearSectionElementOverrides(style, 'experience', true);
    expect(bullets.elementStyles?.['exp.0.bullet.1']).toBeUndefined();
    expect(bullets.elementStyles?.['exp.0']).toEqual({ colorHex: '#111' });
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

  it('title rule width/colour resolve section over document, undefined when unset', () => {
    expect(effectiveTitleRuleWidth(base, 'summary')).toBeUndefined();
    expect(effectiveTitleRuleColor(base, 'summary')).toBeUndefined();
    const doc: CvStyle = { ...base, titleRuleWidthPt: 3, titleRuleColorHex: '#111' };
    expect(effectiveTitleRuleWidth(doc, 'summary')).toBe(3);
    expect(effectiveTitleRuleColor(doc, 'summary')).toBe('#111');
    const sectioned: CvStyle = {
      ...doc,
      sectionStyles: { skills: { titleRuleWidthPt: 1.5, titleRuleColorHex: '#abc' } },
    };
    expect(effectiveTitleRuleWidth(sectioned, 'skills')).toBe(1.5);
    expect(effectiveTitleRuleColor(sectioned, 'skills')).toBe('#abc');
    // Section without its own override falls back to the document value.
    expect(effectiveTitleRuleWidth(sectioned, 'summary')).toBe(3);
  });
});
