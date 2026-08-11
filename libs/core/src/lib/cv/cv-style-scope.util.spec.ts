import { CV_STYLE_DEFAULT, type CvStyle } from '../models/document.model';
import type { CvPreviewSelection, CvStylePanelChange } from './cv-selection.util';
import { routeCvStyleChange } from './cv-style-scope.util';

const titleSel = (sectionKey: CvPreviewSelection['sectionKey']): CvPreviewSelection => ({
  sectionKey,
  part: 'title',
});
const bodySel = (
  sectionKey: CvPreviewSelection['sectionKey'],
  elementPath?: string,
): CvPreviewSelection => ({ sectionKey, part: 'body', elementPath });

const change = (c: Partial<CvStylePanelChange>): CvStylePanelChange =>
  ({ scope: 'element', ...c }) as CvStylePanelChange;

describe('routeCvStyleChange - title selections', () => {
  // Asymmetric on purpose: experience and education carry DIFFERENT title
  // colours and only experience carries a title size. A mutation that clears
  // every title property, or clears none, is invisible against two sections
  // whose overrides agree.
  const twoStyledTitles: CvStyle = {
    ...CV_STYLE_DEFAULT,
    sectionStyles: {
      experience: { title: { colorHex: '#aa0000', fontSizePt: 20 } },
      education: { title: { colorHex: '#00aa00' } },
    },
  };

  it('this-title writes only the selected section, leaving its sibling alone', () => {
    const next = routeCvStyleChange(
      twoStyledTitles,
      titleSel('experience'),
      change({ scope: 'section', patch: { colorHex: '#0000ff' } }),
    );
    expect(next.sectionStyles?.experience?.title?.colorHex).toBe('#0000ff');
    expect(next.sectionStyles?.education?.title?.colorHex).toBe('#00aa00');
    expect(next.titleStyle).toBeUndefined();
  });

  it('all-titles clears the SAME property everywhere, then writes the document value', () => {
    const next = routeCvStyleChange(
      twoStyledTitles,
      titleSel('experience'),
      change({ scope: 'document', patch: { colorHex: '#0000ff' } }),
    );
    expect(next.titleStyle?.colorHex).toBe('#0000ff');
    expect(next.sectionStyles?.experience?.title?.colorHex).toBeUndefined();
    expect(next.sectionStyles?.education?.title?.colorHex).toBeUndefined();
    // Sibling property survives: only what this control wrote is made uniform.
    expect(next.sectionStyles?.experience?.title?.fontSizePt).toBe(20);
  });

  it('all-titles merges into an existing titleStyle instead of replacing it', () => {
    const withTitleStyle: CvStyle = {
      ...twoStyledTitles,
      titleStyle: { fontFamily: 'Georgia', colorHex: '#111111' },
    };
    const next = routeCvStyleChange(
      withTitleStyle,
      titleSel('experience'),
      change({ scope: 'document', patch: { colorHex: '#0000ff' } }),
    );
    expect(next.titleStyle).toEqual({ fontFamily: 'Georgia', colorHex: '#0000ff' });
  });

  it('this-title reset clears the four text properties but keeps the title border', () => {
    const styled: CvStyle = {
      ...CV_STYLE_DEFAULT,
      sectionStyles: { experience: { title: { colorHex: '#aa0000' }, titleBorder: 'solid' } },
    };
    const next = routeCvStyleChange(
      styled,
      titleSel('experience'),
      change({ scope: 'section', reset: true }),
    );
    expect(next.sectionStyles?.experience?.title).toBeUndefined();
    expect(next.sectionStyles?.experience?.titleBorder).toBe('solid');
  });

  it('all-titles reset drops the document titleStyle and leaves sections alone', () => {
    const next = routeCvStyleChange(
      { ...twoStyledTitles, titleStyle: { colorHex: '#111111' } },
      titleSel('experience'),
      change({ scope: 'document', reset: true }),
    );
    expect(next.titleStyle).toBeUndefined();
    expect(next.sectionStyles?.experience?.title?.colorHex).toBe('#aa0000');
  });

  // The three rule controls differ only by which property they write. Asserting
  // each one's target explicitly is what makes a swapped property name fail.
  it.each([
    ['titleBorder' as const, 'dashed' as const, 'titleBorder' as const],
    ['titleRuleWidth' as const, 1.5, 'titleRuleWidthPt' as const],
    ['titleRuleColor' as const, '#123456', 'titleRuleColorHex' as const],
  ])('this-title %s writes %s to the section', (field, value, target) => {
    const next = routeCvStyleChange(
      CV_STYLE_DEFAULT,
      titleSel('skills'),
      change({ scope: 'section', [field]: value }),
    );
    expect(next.sectionStyles?.skills?.[target]).toBe(value);
    expect(next[target]).toBeUndefined();
  });

  it.each([
    ['titleBorder' as const, 'dashed' as const, 'titleBorder' as const],
    ['titleRuleWidth' as const, 1.5, 'titleRuleWidthPt' as const],
    ['titleRuleColor' as const, '#123456', 'titleRuleColorHex' as const],
  ])(
    'all-titles %s writes the document value and clears the section one',
    (field, value, target) => {
      const styled: CvStyle = {
        ...CV_STYLE_DEFAULT,
        sectionStyles: {
          skills: { titleBorder: 'solid', titleRuleWidthPt: 9, titleRuleColorHex: '#999999' },
        },
      };
      const next = routeCvStyleChange(
        styled,
        titleSel('skills'),
        change({ scope: 'document', [field]: value }),
      );
      expect(next[target]).toBe(value);
      expect(next.sectionStyles?.skills?.[target]).toBeUndefined();
    },
  );

  it('a null rule value clears rather than writing null', () => {
    const styled: CvStyle = {
      ...CV_STYLE_DEFAULT,
      sectionStyles: { skills: { titleRuleWidthPt: 9 } },
    };
    const next = routeCvStyleChange(
      styled,
      titleSel('skills'),
      change({ scope: 'section', titleRuleWidth: null }),
    );
    expect(next.sectionStyles?.skills?.titleRuleWidthPt).toBeUndefined();
  });

  it('returns the style untouched when a title change carries nothing to write', () => {
    const next = routeCvStyleChange(twoStyledTitles, titleSel('experience'), change({}));
    expect(next).toBe(twoStyledTitles);
  });
});

describe('routeCvStyleChange - body selections', () => {
  // Asymmetric on purpose: an ENTRY override (exp.0), a FIELD override under
  // that same entry (exp.0.role) and a BULLET override (exp.0.bullet.0), each
  // with a different colour, plus a sibling section. A mutation that swaps the
  // bullets flag, or widens the clear to fields, changes exactly one of these.
  const mixedOverrides: CvStyle = {
    ...CV_STYLE_DEFAULT,
    elementStyles: {
      'exp.0': {
        colorHex: '#111111',
        ruleWidthPt: 3,
        borderStyle: 'solid',
        ruleColorHex: '#aaaaaa',
      },
      'exp.0.role': { colorHex: '#222222' },
      'exp.0.bullet.0': { colorHex: '#333333' },
      'edu.0': { colorHex: '#444444' },
    },
  };

  it.each([
    ['bodyBorder' as const, 'dashed' as const, 'bodyBorder' as const, 'borderStyle' as const],
    ['bodyRuleWidth' as const, 2, 'bodyRuleWidthPt' as const, 'ruleWidthPt' as const],
    ['bodyRuleColor' as const, '#654321', 'bodyRuleColorHex' as const, 'ruleColorHex' as const],
  ])(
    '%s writes the section property and clears only that rule property on entries',
    (field, value, sectionProp, entryProp) => {
      const next = routeCvStyleChange(
        mixedOverrides,
        bodySel('experience'),
        change({ scope: 'section', [field]: value }),
      );
      expect(next.sectionStyles?.experience?.[sectionProp]).toBe(value);
      expect(next.elementStyles?.['exp.0']?.[entryProp]).toBeUndefined();
      // Siblings on the same entry survive - only this control's property went.
      expect(next.elementStyles?.['exp.0']?.colorHex).toBe('#111111');
      // A FIELD's own line is not the entry rule.
      expect(next.elementStyles?.['exp.0.role']?.colorHex).toBe('#222222');
      expect(next.elementStyles?.['edu.0']?.colorHex).toBe('#444444');
    },
  );

  it.each([
    ['separatorColor' as const, '#abcdef', 'separatorColorHex' as const],
    ['separatorSize' as const, 8, 'separatorSizePt' as const],
  ])('%s is section-level and touches no element override', (field, value, target) => {
    const next = routeCvStyleChange(
      mixedOverrides,
      bodySel('languages'),
      change({ scope: 'element', [field]: value }),
    );
    expect(next.sectionStyles?.languages?.[target]).toBe(value);
    expect(next.elementStyles).toEqual(mixedOverrides.elementStyles);
  });

  it('applying "all achievements" wipes bullet overrides but keeps entry and field ones', () => {
    const next = routeCvStyleChange(
      mixedOverrides,
      bodySel('experience'),
      change({ scope: 'bullets', patch: { colorHex: '#0000ff' } }),
    );
    expect(next.sectionStyles?.experience?.bulletStyle?.colorHex).toBe('#0000ff');
    expect(next.elementStyles?.['exp.0.bullet.0']).toBeUndefined();
    expect(next.elementStyles?.['exp.0']?.colorHex).toBe('#111111');
    expect(next.elementStyles?.['exp.0.role']?.colorHex).toBe('#222222');
  });

  it('resetting "all achievements" drops the shared bullet style and KEEPS per-bullet overrides', () => {
    const withBulletStyle: CvStyle = {
      ...mixedOverrides,
      sectionStyles: { experience: { bulletStyle: { colorHex: '#0000ff' } } },
    };
    const next = routeCvStyleChange(
      withBulletStyle,
      bodySel('experience'),
      change({ scope: 'bullets', reset: true }),
    );
    expect(next.sectionStyles?.experience?.bulletStyle).toBeUndefined();
    expect(next.elementStyles?.['exp.0.bullet.0']?.colorHex).toBe('#333333');
  });

  it('applying to the whole section wipes head/field overrides but NOT bullets', () => {
    const next = routeCvStyleChange(
      mixedOverrides,
      bodySel('experience'),
      change({ scope: 'section', patch: { colorHex: '#0000ff' } }),
    );
    expect(next.sectionStyles?.experience?.colorHex).toBe('#0000ff');
    expect(next.elementStyles?.['exp.0']).toBeUndefined();
    expect(next.elementStyles?.['exp.0.role']).toBeUndefined();
    expect(next.elementStyles?.['exp.0.bullet.0']?.colorHex).toBe('#333333');
    expect(next.elementStyles?.['edu.0']?.colorHex).toBe('#444444');
  });

  it('resetting the section drops its override and leaves element overrides alone', () => {
    const styled: CvStyle = {
      ...mixedOverrides,
      sectionStyles: { experience: { colorHex: '#0000ff' }, education: { colorHex: '#00ff00' } },
    };
    const next = routeCvStyleChange(
      styled,
      bodySel('experience'),
      change({ scope: 'section', reset: true }),
    );
    expect(next.sectionStyles?.experience).toBeUndefined();
    expect(next.sectionStyles?.education?.colorHex).toBe('#00ff00');
    expect(next.elementStyles?.['exp.0']?.colorHex).toBe('#111111');
  });

  it('element scope writes only the selected leaf', () => {
    const next = routeCvStyleChange(
      mixedOverrides,
      bodySel('experience', 'exp.0.role'),
      change({ scope: 'element', patch: { colorHex: '#0000ff' } }),
    );
    expect(next.elementStyles?.['exp.0.role']?.colorHex).toBe('#0000ff');
    expect(next.elementStyles?.['exp.0']?.colorHex).toBe('#111111');
  });

  it('element scope reset drops only the selected leaf', () => {
    const next = routeCvStyleChange(
      mixedOverrides,
      bodySel('experience', 'exp.0.role'),
      change({ scope: 'element', reset: true }),
    );
    expect(next.elementStyles?.['exp.0.role']).toBeUndefined();
    expect(next.elementStyles?.['exp.0']?.colorHex).toBe('#111111');
  });

  it('element scope with no selected leaf is a no-op', () => {
    const next = routeCvStyleChange(
      mixedOverrides,
      bodySel('experience'),
      change({ scope: 'element', patch: { colorHex: '#0000ff' } }),
    );
    expect(next).toBe(mixedOverrides);
  });

  it('document scope writes the document body', () => {
    const next = routeCvStyleChange(
      CV_STYLE_DEFAULT,
      bodySel('summary'),
      change({ scope: 'document', patch: { colorHex: '#0000ff', fontSizePt: 13 } }),
    );
    expect(next.bodyColorHex).toBe('#0000ff');
    expect(next.fontSizePt).toBe(13);
  });

  it('document-scope reset is deferred to the global reset - no-op here', () => {
    const next = routeCvStyleChange(
      mixedOverrides,
      bodySel('summary'),
      change({ scope: 'document', reset: true }),
    );
    expect(next).toBe(mixedOverrides);
  });
});

describe('routeCvStyleChange - selection part routing', () => {
  // The same section-scope colour change lands in two different places
  // depending on `part`. A mutation that reads the wrong branch is invisible
  // unless both are asserted against the same input.
  it('sends a title selection to the title override and a body one to the section', () => {
    const c = change({ scope: 'section', patch: { colorHex: '#0000ff' } });
    const asTitle = routeCvStyleChange(CV_STYLE_DEFAULT, titleSel('summary'), c);
    const asBody = routeCvStyleChange(CV_STYLE_DEFAULT, bodySel('summary'), c);
    expect(asTitle.sectionStyles?.summary?.title?.colorHex).toBe('#0000ff');
    expect(asTitle.sectionStyles?.summary?.colorHex).toBeUndefined();
    expect(asBody.sectionStyles?.summary?.colorHex).toBe('#0000ff');
    expect(asBody.sectionStyles?.summary?.title).toBeUndefined();
  });

  it('never mutates the style it is given', () => {
    const before = JSON.stringify(CV_STYLE_DEFAULT);
    routeCvStyleChange(
      CV_STYLE_DEFAULT,
      bodySel('experience'),
      change({ scope: 'section', patch: { colorHex: '#0000ff' } }),
    );
    expect(JSON.stringify(CV_STYLE_DEFAULT)).toBe(before);
  });
});
