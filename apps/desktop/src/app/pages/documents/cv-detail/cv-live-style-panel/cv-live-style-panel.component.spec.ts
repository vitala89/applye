import { CV_STYLE_DEFAULT } from '@applye/core';
import { ComponentFixture } from '@angular/core/testing';
import { CvLiveStylePanelComponent } from './cv-live-style-panel.component';
import { createPanel } from './cv-live-style-panel.harness';

describe('CvLiveStylePanelComponent', () => {
  let component: CvLiveStylePanelComponent;
  let fixture: ComponentFixture<CvLiveStylePanelComponent>;

  beforeEach(async () => {
    ({ component, fixture } = await createPanel());
  });

  describe('title controls reflect the value actually applied to the selection', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('selection', { sectionKey: 'experience', part: 'title' });
    });

    it('this title shows the all-titles line colour it inherits, not the accent', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        accentColorHex: '#00ff00',
        titleRuleColorHex: '#ff0000',
      });
      fixture.detectChanges();

      component.setScope('section');
      expect(component.activeTitleRuleColor()).toBe('#ff0000');
    });

    it('this title shows the all-titles line style and width it inherits', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        titleBorder: 'dashed',
        titleRuleWidthPt: 2,
      });
      fixture.detectChanges();

      component.setScope('section');
      expect(component.activeTitleBorder()).toBe('dashed');
      expect(component.activeTitleRuleWidth()).toBe(2);
    });

    it('this title shows the all-titles font/colour it inherits', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        titleStyle: { fontFamily: 'Georgia', fontSizePt: 15, fontWeight: 700, colorHex: '#ff00ff' },
      });
      fixture.detectChanges();

      component.setScope('section');
      expect(component.activeTitleOverride()).toEqual({
        fontFamily: 'Georgia',
        fontSizePt: 15,
        fontWeight: 700,
        colorHex: '#ff00ff',
      });
    });

    it("this title's OWN value still wins over the inherited one", () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        titleBorder: 'dashed',
        titleRuleColorHex: '#ff0000',
        titleStyle: { colorHex: '#ff00ff' },
        sectionStyles: {
          experience: {
            titleBorder: 'dotted',
            titleRuleColorHex: '#0000ff',
            title: { colorHex: '#00ffff' },
          },
        },
      });
      fixture.detectChanges();

      component.setScope('section');
      expect(component.activeTitleBorder()).toBe('dotted');
      expect(component.activeTitleRuleColor()).toBe('#0000ff');
      expect(component.activeTitleOverride().colorHex).toBe('#00ffff');
    });

    it('all titles never shows a sibling section override', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        titleBorder: 'dashed',
        sectionStyles: { experience: { titleBorder: 'dotted', titleRuleColorHex: '#0000ff' } },
      });
      fixture.detectChanges();

      component.setScope('document');
      expect(component.activeTitleBorder()).toBe('dashed');
      expect(component.activeTitleRuleColor()).toBeNull();
    });

    it('an unset control still reads as Inherit at both scopes', () => {
      fixture.componentRef.setInput('style', { ...CV_STYLE_DEFAULT });
      fixture.detectChanges();

      component.setScope('section');
      expect(component.activeTitleBorder()).toBe('');
      expect(component.activeTitleRuleWidth()).toBeNull();
      component.setScope('document');
      expect(component.activeTitleBorder()).toBe('');
    });

    it("with no override, the line size/colour show the theme's own rule", () => {
      // The exact size the title renders at, rather than a blank Inherit the
      // user has to guess at.
      fixture.componentRef.setInput('style', { ...CV_STYLE_DEFAULT });
      fixture.componentRef.setInput('themeRule', { widthPt: 0.8, colorHex: '#1B7464' });
      fixture.detectChanges();

      component.setScope('section');
      expect(component.activeTitleRuleWidth()).toBe(0.8);
      expect(component.activeTitleRuleColor()).toBe('#1B7464');
      component.setScope('document');
      expect(component.activeTitleRuleWidth()).toBe(0.8);
      expect(component.activeTitleRuleColor()).toBe('#1B7464');
    });

    it("a user's own line size/colour wins over the theme rule", () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        titleRuleWidthPt: 3,
        titleRuleColorHex: '#ff0000',
      });
      fixture.componentRef.setInput('themeRule', { widthPt: 0.8, colorHex: '#1B7464' });
      fixture.detectChanges();

      component.setScope('section');
      expect(component.activeTitleRuleWidth()).toBe(3);
      expect(component.activeTitleRuleColor()).toBe('#ff0000');
    });

    it("the line swatch shows the rule's rendered colour when neither the user nor the theme set one", () => {
      // Classic draws no rule, so the line falls back to a neutral CSS token.
      // That value only exists in the DOM - reading it back is the only way the
      // swatch can avoid showing a colour the line does not have.
      fixture.componentRef.setInput('style', { ...CV_STYLE_DEFAULT, accentColorHex: '#333333' });
      fixture.componentRef.setInput('themeRule', null);
      fixture.componentRef.setInput('sampleBaseStyle', {
        'border-bottom-color': 'rgb(236, 236, 238)',
      });
      fixture.detectChanges();

      component.setScope('section');
      expect(component.titleRuleColorSwatch()).toBe('#ececee');
    });

    it("the line swatch prefers the user's own colour over the rendered one", () => {
      fixture.componentRef.setInput('style', { ...CV_STYLE_DEFAULT, titleRuleColorHex: '#ff0000' });
      fixture.componentRef.setInput('sampleBaseStyle', {
        'border-bottom-color': 'rgb(236, 236, 238)',
      });
      fixture.detectChanges();

      component.setScope('section');
      expect(component.titleRuleColorSwatch()).toBe('#ff0000');
    });

    it('a theme that draws no rule leaves the controls at Inherit', () => {
      fixture.componentRef.setInput('style', { ...CV_STYLE_DEFAULT });
      fixture.componentRef.setInput('themeRule', null);
      fixture.detectChanges();

      component.setScope('section');
      expect(component.activeTitleRuleWidth()).toBeNull();
      expect(component.activeTitleRuleColor()).toBeNull();
    });
  });

  // Same rule as the title controls, one layer down: a body control shows what
  // the element actually renders with, not a blank. Each scope walks the cascade
  // the RENDERER uses - which is not the same for a bullet as for a field.

  describe('body controls reflect the value actually applied to the selection', () => {
    const DOC = {
      ...CV_STYLE_DEFAULT,
      fontFamily: 'Calibri',
      fontSizePt: 11,
      fontWeight: 400 as const,
    };

    it('an element with no override of its own shows the section value it inherits', () => {
      fixture.componentRef.setInput('style', {
        ...DOC,
        bodyColorHex: '#111111',
        sectionStyles: { experience: { fontSizePt: 13, colorHex: '#ff0000' } },
      });
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.role',
      });
      fixture.detectChanges();

      component.setScope('element');
      expect(component.activeBodyOverride()).toMatchObject({
        fontFamily: 'Calibri',
        fontSizePt: 13,
        colorHex: '#ff0000',
      });
    });

    it("an element's own override still wins over the inherited value", () => {
      fixture.componentRef.setInput('style', {
        ...DOC,
        sectionStyles: { experience: { fontSizePt: 13 } },
        elementStyles: { 'exp.0.role': { fontSizePt: 20 } },
      });
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.role',
      });
      fixture.detectChanges();

      component.setScope('element');
      expect(component.activeBodyOverride().fontSizePt).toBe(20);
    });

    it('a BULLET inherits the shared bullet style, never the section (the renderer skips it)', () => {
      fixture.componentRef.setInput('style', {
        ...DOC,
        // The section value styles the entry heads only - a bullet must not
        // report a size it does not render at.
        sectionStyles: {
          experience: { fontSizePt: 13, bulletStyle: { fontSizePt: 9, colorHex: '#00ff00' } },
        },
      });
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.bullet.1',
      });
      fixture.detectChanges();

      component.setScope('element');
      expect(component.activeBodyOverride()).toMatchObject({
        fontSizePt: 9,
        colorHex: '#00ff00',
      });
    });

    it('a bullet with no shared style falls back to the document, not the section', () => {
      fixture.componentRef.setInput('style', {
        ...DOC,
        sectionStyles: { experience: { fontSizePt: 13 } },
      });
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.bullet.0',
      });
      fixture.detectChanges();

      component.setScope('element');
      expect(component.activeBodyOverride().fontSizePt).toBe(11);
    });

    it('the section scope shows the document value it inherits', () => {
      fixture.componentRef.setInput('style', { ...DOC, bodyColorHex: '#111111' });
      fixture.componentRef.setInput('selection', { sectionKey: 'experience', part: 'body' });
      fixture.detectChanges();

      component.setScope('section');
      expect(component.activeBodyOverride()).toMatchObject({
        fontFamily: 'Calibri',
        fontSizePt: 11,
        colorHex: '#111111',
      });
    });

    it('no body scope ever reports the accent as a colour (no-accent-leak)', () => {
      // `bodyColorHex` unset = no forced body colour anywhere in the cascade.
      fixture.componentRef.setInput('style', {
        ...DOC,
        accentColorHex: '#00ff00',
        sectionStyles: { experience: { bulletStyle: { fontSizePt: 9 } } },
      });
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.bullet.0',
      });
      fixture.detectChanges();

      for (const scope of ['element', 'bullets', 'section', 'document'] as const) {
        component.setScope(scope);
        expect(component.activeBodyOverride().colorHex).toBeUndefined();
      }
    });

    it('the bullets scope shows the shared bullet style over the document', () => {
      fixture.componentRef.setInput('style', {
        ...DOC,
        sectionStyles: { experience: { fontSizePt: 13, bulletStyle: { fontWeight: 700 } } },
      });
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.bullet.0',
      });
      fixture.detectChanges();

      component.setScope('bullets');
      expect(component.activeBodyOverride()).toMatchObject({
        fontWeight: 700,
        fontSizePt: 11,
      });
    });
  });

  // "This experience" must style THIS entry's line; the section divider is what
  // "All experiences" means. Before the entry had a rule of its own, the panel
  // showed it the section's - so a line edit under "This experience" silently
  // restyled every entry.

  describe('edit text + word-bold hint', () => {
    it('shows "Edit text" for a body selection and hides it for a title', () => {
      fixture.componentRef.setInput('selection', {
        sectionKey: 'summary',
        part: 'body',
        elementPath: 'summary',
      });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.cvlive__edit-text')).toBeTruthy();

      fixture.componentRef.setInput('selection', { sectionKey: 'summary', part: 'title' });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.cvlive__edit-text')).toBeNull();
    });

    it('emits editText when "Edit text" is clicked', () => {
      fixture.componentRef.setInput('selection', {
        sectionKey: 'summary',
        part: 'body',
        elementPath: 'summary',
      });
      fixture.detectChanges();
      let fired = 0;
      component.editText.subscribe(() => (fired += 1));
      fixture.nativeElement.querySelector('.cvlive__edit-text').click();
      expect(fired).toBe(1);
    });

    it('shows the word-bold hint for summary/experience body, not skills or titles', () => {
      fixture.componentRef.setInput('selection', {
        sectionKey: 'summary',
        part: 'body',
        elementPath: 'summary',
      });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.cvlive__hint')).toBeTruthy();

      fixture.componentRef.setInput('selection', { sectionKey: 'skills', part: 'body' });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.cvlive__hint')).toBeNull();
    });
  });
});
