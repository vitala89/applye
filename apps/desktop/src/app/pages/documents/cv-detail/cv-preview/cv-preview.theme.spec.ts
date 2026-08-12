import { ComponentFixture } from '@angular/core/testing';
import { CV_STYLE_DEFAULT } from '@applye/core';
import { CvPreviewStyleService } from './cv-preview-style.service';
import { createCvPreview } from './cv-preview.harness';

describe('CvPreviewComponent themes', () => {
  let styles: CvPreviewStyleService;
  let fixture: ComponentFixture<CvPreviewComponent>;

  beforeEach(async () => {
    ({ fixture, styles } = await createCvPreview());
  });

  it('titleBorderCss applies the user line size (pt) and colour over the theme default', () => {
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      titleBorder: 'solid',
      sectionStyles: { skills: { titleRuleWidthPt: 3, titleRuleColorHex: '#112233' } },
    });
    fixture.componentRef.setInput('sections', [
      { key: 'skills', order: 0, visible: true, groups: [{ label: 'L', values: ['TS'] }] },
    ]);
    fixture.detectChanges();
    const css = styles.titleBorderCss('skills');
    expect(css).toContain('3pt');
    expect(css).toContain('solid');
    expect(css).toContain('#112233');
    // A section without its own override doesn't pick up skills' rule.
    expect(styles.titleBorderCss('summary')).not.toContain('#112233');
  });

  it("bodyBorder 'none' zeroes the rule width so a themed divider cannot draw", () => {
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      sectionStyles: { personal_details: { bodyBorder: 'none', bodyRuleWidthPt: 2 } },
    });
    fixture.detectChanges();
    const css = styles.bodyCss('personal_details');
    expect(css['--cv-header-rule-width']).toBe('0');
    expect(css['--cv-entry-rule-width']).toBe('0');
  });

  it('bodyCss omits body colour for a themed document when the section has no override', () => {
    // Regression: an Aurora-like accent colour must not leak into body text via
    // the document-wide accentColorHex fallback in effectiveSectionStyle - only
    // an explicit per-section colorHex override should set body colour.
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      accentColorHex: '#1B7464',
    });
    const css = styles.bodyCss('summary');
    expect(css['color']).toBeUndefined();
    expect(css['--cv-section-body-color']).toBeUndefined();
  });

  it('bodyCss sets body colour only for the section with an explicit override', () => {
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      accentColorHex: '#1B7464',
      sectionStyles: { summary: { colorHex: '#1b7464' } },
    });
    expect(styles.bodyCss('summary')).toMatchObject({
      color: '#1b7464',
      '--cv-section-body-color': '#1b7464',
    });
    // A sibling section without its own override stays uncoloured.
    const skillsCss = styles.bodyCss('skills');
    expect(skillsCss['color']).toBeUndefined();
    expect(skillsCss['--cv-section-body-color']).toBeUndefined();
  });

  it('bodyCss applies the document-wide bodyColorHex to every section wrapper (Phase D.2 body colour)', () => {
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      accentColorHex: '#1B7464',
      bodyColorHex: '#204060',
    });
    expect(styles.bodyCss('summary')).toMatchObject({
      color: '#204060',
      '--cv-section-body-color': '#204060',
    });
    expect(styles.bodyCss('skills')).toMatchObject({
      color: '#204060',
      '--cv-section-body-color': '#204060',
    });
  });

  it('bodyCss lets a section colorHex override beat the document-wide bodyColorHex for that section only', () => {
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      bodyColorHex: '#204060',
      sectionStyles: { summary: { colorHex: '#0a5' } },
    });
    expect(styles.bodyCss('summary')).toMatchObject({
      color: '#0a5',
      '--cv-section-body-color': '#0a5',
    });
    // The sibling section falls through to the document colour, not to
    // accentColorHex and not to no-colour.
    expect(styles.bodyCss('skills')).toMatchObject({
      color: '#204060',
      '--cv-section-body-color': '#204060',
    });
  });

  it('Aurora theme exposes teal accent var and shows industry', () => {
    fixture.componentRef.setInput('themeId', 2);
    fixture.componentRef.setInput('sections', [
      {
        key: 'experience',
        order: 0,
        visible: true,
        entries: [
          {
            company: 'Acme',
            role: 'Engineer',
            startDate: '2020',
            industry: 'SaaS',
            bullets: [],
          },
        ],
      },
    ]);
    fixture.detectChanges();
    const viewport: HTMLElement = fixture.nativeElement.querySelector('.cvpreview-viewport');
    expect(viewport.style.getPropertyValue('--cv-accent')).toBe('#1B7464');
    expect(viewport.style.getPropertyValue('--cv-role-style')).toBe('italic');
    expect(fixture.nativeElement.textContent).toContain('SaaS');
  });

  it("an explicit titleBorder changes the dashes only - the Aurora theme's weight and colour stay", () => {
    fixture.componentRef.setInput('themeId', 2);
    fixture.componentRef.setInput('style', { ...CV_STYLE_DEFAULT, titleBorder: 'dotted' });
    const css = styles.titleBorderCss('summary');
    // Picking a style must not silently thin the line to the neutral 1px grey:
    // the theme's rule is what the panel shows as the line's size/colour.
    expect(css).toBe('0.8pt dotted #1B7464');
  });

  it('a theme that draws no rule (Classic) still falls back to the neutral CSS default', () => {
    fixture.componentRef.setInput('themeId', 1);
    fixture.componentRef.setInput('style', { ...CV_STYLE_DEFAULT, titleBorder: 'solid' });
    const css = styles.titleBorderCss('summary');
    expect(css).toBe('var(--border-width) solid var(--border-subtle)');
  });

  it('a user line size/colour still wins over the theme rule', () => {
    fixture.componentRef.setInput('themeId', 2);
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      titleBorder: 'solid',
      titleRuleWidthPt: 3,
      titleRuleColorHex: '#ff0000',
    });
    expect(styles.titleBorderCss('summary')).toBe('3pt solid #ff0000');
  });
});
