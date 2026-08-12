import { ComponentFixture } from '@angular/core/testing';
import { CV_STYLE_DEFAULT } from '@applye/core';
import { CvPreviewComponent } from './cv-preview.component';
import { CvPreviewStyleService } from './cv-preview-style.service';
import { createCvPreview } from './cv-preview.harness';

describe('CvPreviewComponent styling', () => {
  let component: CvPreviewComponent;
  let styles: CvPreviewStyleService;
  let fixture: ComponentFixture<CvPreviewComponent>;

  beforeEach(async () => {
    ({ component, fixture, styles } = await createCvPreview());
  });

  describe('leafCss - per-element style override (Phase D.2)', () => {
    it('returns an empty style object for a leaf with no elementStyles override', () => {
      expect(styles.leafCss('summary')).toEqual({});
      expect(styles.leafCss('pd.fullName')).toEqual({});
    });

    it('an empty-string path returns no leaf-level style, even when an UNRELATED path has an override (T1 review minor)', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        elementStyles: { summary: { fontFamily: 'Georgia', fontSizePt: 16 } },
      });
      expect(styles.leafCss('')).toEqual({});
    });

    it('returns only the CSS properties actually set on the element override - not the full resolved cascade', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        elementStyles: { summary: { fontFamily: 'Georgia', fontSizePt: 14 } },
      });
      // fontWeight/colorHex/lineHeight were never set on the override, so they
      // must be absent here even though the section/document cascade has
      // concrete values for them (effectiveLeafStyle would fill them in).
      expect(styles.leafCss('summary')).toEqual({
        'font-family': 'Georgia',
        'font-size': '14pt',
      });
    });

    it('maps every element-style field to its CSS property when all are set', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        elementStyles: {
          'exp.0.role': {
            fontFamily: 'Arial',
            fontSizePt: 12,
            fontWeight: 700,
            colorHex: '#123456',
            lineHeight: 1.5,
          },
        },
      });
      expect(styles.leafCss('exp.0.role')).toEqual({
        'font-family': 'Arial',
        'font-size': '12pt',
        'font-weight': '700',
        color: '#123456',
        'line-height': '1.5',
      });
    });

    it('entryCss strips a stored bottom rule - an entry wraps its bullets, so it would draw under them', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        elementStyles: { 'exp.0': { borderStyle: 'solid', colorHex: '#123456' } },
      });
      const css = styles.entryCss('exp.0');
      expect(css['border-bottom']).toBeUndefined();
      expect(css['padding-bottom']).toBeUndefined();
      // Non-line element styling on the entry still applies.
      expect(css['color']).toBe('#123456');
      expect(css['--cv-entry-color']).toBe('#123456');
    });

    it('squares the rule ends so the selected border-radius cannot curve them', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        elementStyles: { 'pd.name': { borderStyle: 'solid' } },
      });
      const css = styles.leafCss('pd.name');
      expect(css['border-bottom-left-radius']).toBe('0');
      expect(css['border-bottom-right-radius']).toBe('0');
    });

    it('renders a per-leaf bottom rule from borderStyle, defaulting width/colour', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        accentColorHex: '#1B7464',
        elementStyles: { 'pd.name': { borderStyle: 'dotted' } },
      });
      expect(styles.leafCss('pd.name')['border-bottom']).toBe('1pt dotted #1B7464');
    });

    it("draws no border-bottom when borderStyle is 'none'", () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        elementStyles: { 'pd.name': { borderStyle: 'none', ruleWidthPt: 2 } },
      });
      expect(styles.leafCss('pd.name')['border-bottom']).toBeUndefined();
    });

    it('never falls back to the section or document accent colour - only an explicit element colorHex appears', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        accentColorHex: '#1B7464',
        sectionStyles: { summary: { colorHex: '#111111' } },
        elementStyles: { summary: { fontSizePt: 13 } },
      });
      expect(styles.leafCss('summary')['color']).toBeUndefined();
    });

    it('renders the element override as inline style on the summary leaf in BOTH the page card and the hidden measurement mirror (typography parity for pagination)', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        elementStyles: { summary: { fontFamily: 'Georgia', fontSizePt: 16, colorHex: '#1b7464' } },
      });
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text: 'Hello world' },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const page = root.querySelector('.page-card .cvpreview__summary') as HTMLElement;
      const measured = root.querySelector(
        '.paginated-sheet__measure .cvpreview__summary',
      ) as HTMLElement;
      expect(page).toBeTruthy();
      expect(measured).toBeTruthy();
      for (const el of [page, measured]) {
        expect(el.style.fontFamily).toContain('Georgia');
        expect(el.style.fontSize).toBe('16pt');
        expect(el.style.color).not.toBe('');
      }
    });

    it('renders the element override as inline style on an experience company leaf in BOTH the page card and the hidden measurement mirror (typography parity for pagination)', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        elementStyles: {
          'exp.0.company': { fontFamily: 'Georgia', fontSizePt: 16, colorHex: '#1b7464' },
        },
      });
      fixture.componentRef.setInput('sections', [
        {
          key: 'experience',
          order: 0,
          visible: true,
          entries: [{ company: 'Acme', role: 'Engineer', startDate: '2020', bullets: [] }],
        },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const page = root.querySelector('.page-card .cvpreview__entry-company') as HTMLElement;
      const measured = root.querySelector(
        '.paginated-sheet__measure .cvpreview__entry-company',
      ) as HTMLElement;
      expect(page).toBeTruthy();
      expect(measured).toBeTruthy();
      for (const el of [page, measured]) {
        expect(el.style.fontFamily).toContain('Georgia');
        expect(el.style.fontSize).toBe('16pt');
        expect(el.style.color).not.toBe('');
      }
    });

    it('renders the element override as inline style on a skills VALUES leaf in BOTH the page card and the hidden measurement mirror (T3 review minor - typography parity beyond summary/exp-company)', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        elementStyles: {
          'skills.0.values': { fontFamily: 'Georgia', fontSizePt: 16, colorHex: '#1b7464' },
        },
      });
      fixture.componentRef.setInput('sections', [
        {
          key: 'skills',
          order: 0,
          visible: true,
          groups: [{ label: 'Languages', values: ['TypeScript'] }],
        },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const page = root.querySelector('.page-card .cvpreview__skill-values-view') as HTMLElement;
      const measured = root.querySelector(
        '.paginated-sheet__measure .cvpreview__skill-values-view',
      ) as HTMLElement;
      expect(page).toBeTruthy();
      expect(measured).toBeTruthy();
      for (const el of [page, measured]) {
        expect(el.style.fontFamily).toContain('Georgia');
        expect(el.style.fontSize).toBe('16pt');
        expect(el.style.color).not.toBe('');
      }
    });

    it('renders the element override as inline style on a language VALUE leaf in BOTH the page card and the hidden measurement mirror (T3 review minor - typography parity beyond summary/exp-company)', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        elementStyles: {
          'lang.0.language': { fontFamily: 'Georgia', fontSizePt: 16, colorHex: '#1b7464' },
        },
      });
      fixture.componentRef.setInput('sections', [
        {
          key: 'languages',
          order: 0,
          visible: true,
          items: [{ language: 'English', level: 'C1' }],
        },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const page = root.querySelector('.page-card .cvpreview__language-value') as HTMLElement;
      const measured = root.querySelector(
        '.paginated-sheet__measure .cvpreview__language-value',
      ) as HTMLElement;
      expect(page).toBeTruthy();
      expect(measured).toBeTruthy();
      for (const el of [page, measured]) {
        expect(el.style.fontFamily).toContain('Georgia');
        expect(el.style.fontSize).toBe('16pt');
        expect(el.style.color).not.toBe('');
      }
    });

    it('a leaf without an element override renders no leaf-level inline style (resting output unchanged) while still inheriting the section wrapper body style', () => {
      fixture.componentRef.setInput('style', { ...CV_STYLE_DEFAULT, fontFamily: 'Georgia' });
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text: 'Hello world' },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const page = root.querySelector('.page-card .cvpreview__summary') as HTMLElement;
      // No leaf-level override was ever set - leafCss must contribute nothing.
      expect(page.style.fontFamily).toBe('');
      expect(page.style.fontSize).toBe('');
      expect(page.style.color).toBe('');
      // The section wrapper (bodyCss) still carries the effective font -
      // inheritance, not the new element layer, gives the leaf its font.
      const wrapper = page.closest('.cvpreview__section') as HTMLElement;
      expect(wrapper.style.fontFamily).toContain('Georgia');
    });

    it('an un-overridden leaf has no inline colour (no accent leak); an element colorHex override shows colour', () => {
      fixture.componentRef.setInput('style', { ...CV_STYLE_DEFAULT, accentColorHex: '#1B7464' });
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text: 'Hello world' },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      let page = root.querySelector('.page-card .cvpreview__summary') as HTMLElement;
      expect(page.style.color).toBe('');

      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        accentColorHex: '#1B7464',
        elementStyles: { summary: { colorHex: '#222222' } },
      });
      fixture.detectChanges();
      page = root.querySelector('.page-card .cvpreview__summary') as HTMLElement;
      expect(page.style.color).not.toBe('');
    });

    it('a document-wide bodyColorHex colours the section wrapper (inherited by every un-overridden leaf) in both the measure and page passes', () => {
      fixture.componentRef.setInput('style', { ...CV_STYLE_DEFAULT, bodyColorHex: '#204060' });
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text: 'Hello world' },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      // The leaf itself gets no per-leaf inline colour (leafCss is untouched
      // by the document layer) - colour comes from the wrapper via CSS
      // inheritance, which is what actually shows on screen.
      const page = root.querySelector('.page-card .cvpreview__summary') as HTMLElement;
      expect(page.style.color).toBe('');
      const wrapper = page.closest('.cvpreview__section') as HTMLElement;
      // jsdom normalizes the inline hex to an rgb() triplet - assert it's set
      // rather than comparing string formats.
      expect(wrapper.style.color).not.toBe('');
    });

    it('an element override on the inline editor renders the same style while the leaf is being edited', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'summary',
        part: 'body',
        elementPath: 'summary',
      });
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        elementStyles: { summary: { fontFamily: 'Georgia', fontSizePt: 15 } },
      });
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text: 'Hello world' },
      ]);
      component.startEditing();
      fixture.detectChanges();
      const textarea = (fixture.nativeElement as HTMLElement).querySelector(
        '.page-card textarea.cvpreview__summary',
      ) as HTMLTextAreaElement;
      expect(textarea.style.fontFamily).toContain('Georgia');
      expect(textarea.style.fontSize).toBe('15pt');
    });

    it('an element colorHex override on personal-details fullName wins over the section colour on the same leaf', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        sectionStyles: { personal_details: { colorHex: '#111111' } },
        elementStyles: { 'pd.fullName': { colorHex: '#ff0000' } },
      });
      fixture.componentRef.setInput('sections', [
        { key: 'personal_details', order: 0, visible: true, fullName: 'Ada Lovelace' },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const name = root.querySelector('.page-card h2.cvpreview__name') as HTMLElement;
      expect(name.style.color).not.toBe('');
      expect(name.style.color).not.toBe('#111111');
    });

    it('resolves pd.fullName colour precedence deterministically: element colorHex always wins over the section colour, regardless of NgStyle/style-binding evaluation order (regression)', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        sectionStyles: { personal_details: { colorHex: '#111111' } },
        elementStyles: { 'pd.fullName': { colorHex: '#ff0000' } },
      });
      fixture.componentRef.setInput('sections', [
        { key: 'personal_details', order: 0, visible: true, fullName: 'Ada Lovelace' },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      // Resting <h2>.
      const name = root.querySelector('.page-card h2.cvpreview__name') as HTMLElement;
      expect(name.style.color).toBe('rgb(255, 0, 0)');

      // Editor <input> - select the fullName leaf and switch into edit mode.
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'personal_details',
        part: 'body',
        elementPath: 'pd.fullName',
      });
      component.startEditing();
      fixture.detectChanges();
      const nameInput = root.querySelector('.page-card input.cvpreview__name') as HTMLInputElement;
      expect(nameInput.style.color).toBe('rgb(255, 0, 0)');
    });
  });

  describe('an experience entry draws its OWN head rule', () => {
    it("maps the entry's stored rule onto the head's vars, overriding the section's", () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        sectionStyles: { experience: { bodyRuleWidthPt: 1.5, bodyRuleColorHex: '#ff0000' } },
        elementStyles: {
          'exp.0': { borderStyle: 'dashed', ruleWidthPt: 3, ruleColorHex: '#0000ff' },
        },
      });
      const css = styles.entryCss('exp.0');
      expect(css['--cv-entry-rule-style']).toBe('dashed');
      expect(css['--cv-entry-rule-width']).toBe('3pt');
      expect(css['--cv-entry-rule-color']).toBe('#0000ff');
    });

    it('leaves a sibling entry on the section rule', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        sectionStyles: { experience: { bodyRuleWidthPt: 1.5 } },
        elementStyles: { 'exp.0': { borderStyle: 'dashed', ruleWidthPt: 3 } },
      });
      expect(styles.entryCss('exp.1')['--cv-entry-rule-width']).toBeUndefined();
    });

    it('turns just this entry\'s rule off with an explicit "none"', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        sectionStyles: { experience: { bodyRuleWidthPt: 1.5 } },
        elementStyles: { 'exp.0': { borderStyle: 'none' } },
      });
      // Zeroing the WIDTH is what turns a themed rule off - `border-style: none`
      // alone would leave the inherited width drawing.
      expect(styles.entryCss('exp.0')['--cv-entry-rule-width']).toBe('0pt');
    });

    it('still never puts a border on the entry container itself (it would land under the bullets)', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        elementStyles: { 'exp.0': { borderStyle: 'dashed', ruleWidthPt: 3 } },
      });
      const css = styles.entryCss('exp.0');
      expect(css['border-bottom']).toBeUndefined();
      expect(css['padding-bottom']).toBeUndefined();
    });

    it('an entry with only a width set keeps the inherited style', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        sectionStyles: { experience: { bodyBorder: 'dotted', bodyRuleWidthPt: 1 } },
        elementStyles: { 'exp.0': { ruleWidthPt: 4 } },
      });
      const css = styles.entryCss('exp.0');
      expect(css['--cv-entry-rule-width']).toBe('4pt');
      expect(css['--cv-entry-rule-style']).toBeUndefined();
    });
  });

  describe('word bold + edit mode', () => {
    it('toggleSummaryWord emits a section with the word wrapped in **', () => {
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((s) => emitted.push(s));
      const section = { key: 'summary', order: 0, visible: true, text: 'cut size by 25%' };
      component.toggleSummaryWord(
        section as never,
        3,
        new MouseEvent('click', { cancelable: true }),
      );
      expect(emitted).toEqual([{ ...section, text: 'cut size by **25%**' }]);
    });

    it('startEditing enters edit mode only when something is selected', () => {
      fixture.componentRef.setInput('interactive', true);
      component.startEditing();
      expect(component.editing()).toBe(false);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'summary',
        part: 'body',
        elementPath: 'summary',
      });
      component.startEditing();
      expect(component.editing()).toBe(true);
    });

    it('drops back to view mode when the selected section+part changes', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'summary',
        part: 'body',
        elementPath: 'summary',
      });
      component.startEditing();
      expect(component.editing()).toBe(true);
      fixture.componentRef.setInput('selection', { sectionKey: 'skills', part: 'body' });
      expect(component.editing()).toBe(false);
    });
  });

  it('renders section title in the title font and body in the body font', () => {
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      fontFamily: 'Calibri', // body
      titleStyle: { fontFamily: 'Georgia' }, // title
      titleBorder: 'none',
    });
    fixture.componentRef.setInput('sections', [
      { key: 'skills', order: 0, visible: true, groups: [{ label: 'L', values: ['TS'] }] },
    ]);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const title = root.querySelector('.cvpreview__section-title') as HTMLElement;
    const body = root.querySelector('.cvpreview__section') as HTMLElement;
    expect(title.style.fontFamily).toContain('Georgia');
    expect(body.style.fontFamily).toContain('Calibri');
    expect(title.style.borderBottom === '' || title.style.borderBottom === 'none').toBe(true);
  });

  it('bodyCss emits the section body-rule vars (header + entry) from the override', () => {
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      sectionStyles: { personal_details: { bodyRuleWidthPt: 2, bodyRuleColorHex: '#123456' } },
    });
    fixture.componentRef.setInput('sections', [
      { key: 'personal_details', order: 0, visible: true, fullName: 'V' },
    ]);
    fixture.detectChanges();
    const css = styles.bodyCss('personal_details');
    expect(css['--cv-header-rule-width']).toBe('2pt');
    expect(css['--cv-header-rule-color']).toBe('#123456');
    expect(css['--cv-entry-rule-width']).toBe('2pt');
    // A section without its own override emits no rule vars.
    expect(styles.bodyCss('summary')['--cv-header-rule-width']).toBeUndefined();
  });

  it('entryCss mirrors the entry colour into --cv-entry-color (head), and bullets stay bodyCss-only', () => {
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      elementStyles: { 'exp.0': { colorHex: '#ff00ff' } },
    });
    fixture.componentRef.setInput('sections', [
      {
        key: 'experience',
        order: 0,
        visible: true,
        entries: [{ company: 'Acme', role: 'Eng', startDate: '2020', bullets: ['x'] }],
      },
    ]);
    fixture.detectChanges();
    // Head element carries the colour AND the --cv-entry-color var (so the
    // company/dates follow it); the bullet <ul> does NOT (element colour must
    // not leak to bullets below the framed head).
    const head = fixture.nativeElement.querySelector('.page-card .cvpreview__entry') as HTMLElement;
    expect(head.style.getPropertyValue('--cv-entry-color')).toBe('#ff00ff');
    const bullets = fixture.nativeElement.querySelector(
      '.page-card ul.cvpreview__bullets',
    ) as HTMLElement;
    expect(bullets.style.getPropertyValue('--cv-entry-color')).toBe('');
    expect(bullets.style.color).toBe('');
  });

  it('bulletCss applies the shared bullet style ("all achievements") to the bullet list', () => {
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      sectionStyles: { experience: { bulletStyle: { colorHex: '#abcdef', fontSizePt: 11 } } },
    });
    fixture.componentRef.setInput('sections', [
      {
        key: 'experience',
        order: 0,
        visible: true,
        entries: [{ company: 'Acme', role: 'Eng', startDate: '2020', bullets: ['x'] }],
      },
    ]);
    fixture.detectChanges();
    const css = styles.bulletCss('experience');
    expect(css['color']).toBe('#abcdef');
    expect(css['font-size']).toBe('11pt');
    // Empty for a section with no shared bullet style.
    expect(styles.bulletCss('education')).toEqual({});
  });

  it('bulletListCss ignores the section-body ("All experiences") colour - bullets stay independent', () => {
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      // "All experiences" colour override on the experience section.
      sectionStyles: { experience: { colorHex: '#ff0000' } },
    });
    fixture.componentRef.setInput('sections', [
      {
        key: 'experience',
        order: 0,
        visible: true,
        entries: [{ company: 'Acme', role: 'Eng', startDate: '2020', bullets: ['x'] }],
      },
    ]);
    fixture.detectChanges();
    const css = styles.bulletListCss('experience');
    // Bullets carry no colour and no --cv-section-body-color from the section
    // scope - only "All achievements" / per-bullet overrides colour them.
    expect(css['color']).toBeUndefined();
    expect(css['--cv-section-body-color']).toBeUndefined();
  });

  it('bodyCss emits separator vars for a section that overrides them', () => {
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      sectionStyles: { languages: { separatorColorHex: '#abcdef', separatorSizePt: 12 } },
    });
    fixture.componentRef.setInput('sections', [
      { key: 'languages', order: 0, visible: true, items: [{ language: 'English', level: '' }] },
    ]);
    fixture.detectChanges();
    const css = styles.bodyCss('languages');
    expect(css['--cv-sep-color']).toBe('#abcdef');
    expect(css['--cv-sep-size']).toBe('12pt');
  });

  it('titleCss and bodyCss resolve independent fonts; titleBorderCss maps the line', () => {
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      fontFamily: 'Calibri',
      titleStyle: { fontFamily: 'Georgia' },
      titleBorder: 'dotted',
    });
    expect(styles.bodyCss('summary')['font-family']).toBe('Calibri');
    expect(styles.titleCss('summary')['font-family']).toBe('Georgia');
    expect(styles.titleBorderCss('summary')).toContain('dotted');

    fixture.componentRef.setInput('style', { ...CV_STYLE_DEFAULT, titleBorder: 'none' });
    expect(styles.titleBorderCss('summary')).toBe('none');
  });

  it('bodyCss applies explicit section colour and line height without imposing a baseline', () => {
    expect(styles.bodyCss('summary')['line-height']).toBeUndefined();
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      sectionStyles: { summary: { colorHex: '#1b7464', lineHeight: 1.6 } },
    });
    expect(styles.bodyCss('summary')).toMatchObject({
      color: '#1b7464',
      'line-height': '1.6',
    });
  });

  it('applies an explicit line height to rendered summary text', () => {
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      sectionStyles: { summary: { lineHeight: 1.6 } },
    });
    fixture.componentRef.setInput('sections', [
      { key: 'summary', order: 0, visible: true, text: 'Summary text' },
    ]);
    fixture.detectChanges();
    const summarySection = fixture.nativeElement.querySelector('.cvpreview__summary')
      .parentElement as HTMLElement;
    expect(summarySection.style.getPropertyValue('--cv-section-line-height')).toBe('1.6');
  });

  it('applies an explicit section colour to rendered languages without changing inheritance', () => {
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      sectionStyles: { languages: { colorHex: '#1b7464' } },
    });
    fixture.componentRef.setInput('sections', [
      {
        key: 'languages',
        order: 0,
        visible: true,
        items: [{ language: 'English', level: 'C1' }],
      },
    ]);
    fixture.detectChanges();
    const languagesSection = fixture.nativeElement.querySelector('.cvpreview__languages')
      .parentElement as HTMLElement;
    expect(languagesSection.style.getPropertyValue('--cv-section-body-color')).toBe('#1b7464');
  });
});
