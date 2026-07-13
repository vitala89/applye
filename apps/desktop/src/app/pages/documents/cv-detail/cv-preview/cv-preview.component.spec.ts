import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CV_STYLE_DEFAULT } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import type { CvPreviewSelection } from '../../cv-content.util';
import { CvPreviewComponent } from './cv-preview.component';

describe('CvPreviewComponent', () => {
  let component: CvPreviewComponent;
  let fixture: ComponentFixture<CvPreviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CvPreviewComponent],
      providers: [TranslateService],
    }).compileComponents();

    fixture = TestBed.createComponent(CvPreviewComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('sections', []);
    fixture.componentRef.setInput('style', CV_STYLE_DEFAULT);
    fixture.componentRef.setInput('themeId', 1);
    fixture.componentRef.setInput('includePhoto', false);
    fixture.componentRef.setInput('photoDataUri', null);
    fixture.componentRef.setInput('photoPlacement', 'above_left');
    fixture.componentRef.setInput('includeBirthdate', false);
    fixture.componentRef.setInput('includeMaritalStatus', false);
  });

  it('exposes A4 sheet dimensions via geometry', () => {
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      page: { size: 'a4', margin: { top: 20, right: 20, bottom: 20, left: 20 } },
    });
    const g = component.geometry();
    expect(g.pageWidthPx).toBeCloseTo((210 * 96) / 25.4);
    expect(g.marginTopPx).toBeCloseTo((20 * 96) / 25.4);
  });

  it('produces different width for Letter', () => {
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      page: { size: 'letter', margin: { top: 20, right: 20, bottom: 20, left: 20 } },
    });
    expect(component.geometry().pageWidthPx).toBeCloseTo((215.9 * 96) / 25.4);
  });

  it('renders the paginated sheet', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('lib-paginated-sheet')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.cvpreview__pagebar')).toBeNull();
  });

  it('splits an experience entry into a head atom + one atom per bullet, head glued', () => {
    fixture.componentRef.setInput('sections', [
      {
        key: 'experience',
        order: 0,
        visible: true,
        entries: [
          { company: 'A', role: 'Dev', startDate: '2020', bullets: ['one', 'two', 'three'] },
          { company: 'B', role: 'Lead', startDate: '2022', bullets: [] },
        ],
      },
    ]);
    fixture.detectChanges();
    const atoms = component.atoms();
    const ids = atoms.map((a) => a.id);
    expect(ids).toContain('sec:experience:title');
    // Entry A: one head atom + three bullet atoms; entry B: head only (no bullets).
    expect(ids).toContain('sec:experience:e0:head');
    expect(ids.filter((id) => /^sec:experience:e0:b\d+$/.test(id)).length).toBe(3);
    expect(ids).toContain('sec:experience:e1:head');
    expect(ids.filter((id) => /^sec:experience:e1:b\d+$/.test(id)).length).toBe(0);
    // Head with bullets is glued to its first bullet; a bulletless head is not.
    expect(atoms.find((a) => a.id === 'sec:experience:e0:head')?.glueToNext).toBe(true);
    expect(atoms.find((a) => a.id === 'sec:experience:e1:head')?.glueToNext).toBe(false);
    // Bullets themselves are free to flow across a page break.
    expect(atoms.find((a) => a.id === 'sec:experience:e0:b0')?.glueToNext).toBeFalsy();
  });

  it('applies the effective font to every rendered section title (no mono fallback)', () => {
    // Regression: summary/skills/languages titles omitted a title-style binding
    // and fell back to the hardcoded `.cvpreview__section-title` mono font, while
    // experience/education titles (via #sectionTitleTpl) inherited the CV font.
    // All section titles must carry the effective font uniformly.
    fixture.componentRef.setInput('style', { ...CV_STYLE_DEFAULT, fontFamily: 'Georgia' });
    fixture.componentRef.setInput('sections', [
      {
        key: 'skills',
        order: 0,
        visible: true,
        groups: [{ label: 'Languages', values: ['TypeScript'] }],
      },
      {
        key: 'languages',
        order: 1,
        visible: true,
        items: [{ language: 'English', level: '' }],
      },
    ]);
    fixture.detectChanges();

    const titles = fixture.nativeElement.querySelectorAll('.cvpreview__section-title');
    expect(titles.length).toBeGreaterThan(0);
    titles.forEach((h3: HTMLElement) => expect(h3.style.fontFamily).toContain('Georgia'));
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

  it('marks every section start for spacing (measured padding, not sibling margin)', () => {
    // Regression: inter-section spacing relied on `.cvpreview__section +
    // .cvpreview__section` sibling adjacency, which never matches because the
    // paginated sheet wraps each atom separately. Each section root must carry
    // `cvpreview__section-start` so the padding-based gap applies (and is
    // measured by the sheet).
    fixture.componentRef.setInput('sections', [
      { key: 'summary', order: 0, visible: true, text: 'Hi' },
      {
        key: 'experience',
        order: 1,
        visible: true,
        entries: [{ company: 'A', role: 'Dev', startDate: '2020', bullets: [] }],
      },
      { key: 'skills', order: 2, visible: true, groups: [{ label: 'L', values: ['TS'] }] },
      { key: 'languages', order: 3, visible: true, items: [{ language: 'English', level: '' }] },
    ]);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    // summary/skills/languages section wrappers
    const sections = root.querySelectorAll('.cvpreview__section');
    expect(sections.length).toBeGreaterThan(0);
    sections.forEach((el) => expect(el.classList.contains('cvpreview__section-start')).toBe(true));
    // experience's standalone section title (not nested inside a section wrapper)
    const standaloneTitles = [...root.querySelectorAll('.cvpreview__section-title')].filter(
      (h) => !h.closest('.cvpreview__section'),
    );
    expect(standaloneTitles.length).toBeGreaterThan(0);
    standaloneTitles.forEach((h) =>
      expect(h.classList.contains('cvpreview__section-start')).toBe(true),
    );
  });

  it('summary preview renders **bold** as <strong>', () => {
    fixture.componentRef.setInput('sections', [
      { key: 'summary', order: 0, visible: true, text: 'A **Key** point' },
    ]);
    fixture.detectChanges();
    const strongs = fixture.nativeElement.querySelectorAll('.cvpreview__summary strong');
    expect(Array.from(strongs).some((s: HTMLElement) => s.textContent?.trim() === 'Key')).toBe(
      true,
    );
  });

  it('maps placement to a header modifier class', () => {
    expect(component.headerPlacementClass('above_left')).toBe('cvpreview__header--left');
    expect(component.headerPlacementClass('above_center')).toBe('cvpreview__header--center');
    expect(component.headerPlacementClass('above_right')).toBe('cvpreview__header--right');
  });

  it('titleCss and bodyCss resolve independent fonts; titleBorderCss maps the line', () => {
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      fontFamily: 'Calibri',
      titleStyle: { fontFamily: 'Georgia' },
      titleBorder: 'dotted',
    });
    expect(component.bodyCss('summary')['font-family']).toBe('Calibri');
    expect(component.titleCss('summary')['font-family']).toBe('Georgia');
    expect(component.titleBorderCss('summary')).toContain('dotted');

    fixture.componentRef.setInput('style', { ...CV_STYLE_DEFAULT, titleBorder: 'none' });
    expect(component.titleBorderCss('summary')).toBe('none');
  });

  it('bodyCss applies explicit section colour and line height without imposing a baseline', () => {
    expect(component.bodyCss('summary')['line-height']).toBeUndefined();
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      sectionStyles: { summary: { colorHex: '#1b7464', lineHeight: 1.6 } },
    });
    expect(component.bodyCss('summary')).toMatchObject({
      color: '#1b7464',
      'line-height': '1.6',
    });
  });

  it('bodyCss omits body colour for a themed document when the section has no override', () => {
    // Regression: an Aurora-like accent colour must not leak into body text via
    // the document-wide accentColorHex fallback in effectiveSectionStyle — only
    // an explicit per-section colorHex override should set body colour.
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      accentColorHex: '#1B7464',
    });
    const css = component.bodyCss('summary');
    expect(css['color']).toBeUndefined();
    expect(css['--cv-section-body-color']).toBeUndefined();
  });

  it('bodyCss sets body colour only for the section with an explicit override', () => {
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      accentColorHex: '#1B7464',
      sectionStyles: { summary: { colorHex: '#1b7464' } },
    });
    expect(component.bodyCss('summary')).toMatchObject({
      color: '#1b7464',
      '--cv-section-body-color': '#1b7464',
    });
    // A sibling section without its own override stays uncoloured.
    const skillsCss = component.bodyCss('skills');
    expect(skillsCss['color']).toBeUndefined();
    expect(skillsCss['--cv-section-body-color']).toBeUndefined();
  });

  it('bodyCss applies the document-wide bodyColorHex to every section wrapper (Phase D.2 body colour)', () => {
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      accentColorHex: '#1B7464',
      bodyColorHex: '#204060',
    });
    expect(component.bodyCss('summary')).toMatchObject({
      color: '#204060',
      '--cv-section-body-color': '#204060',
    });
    expect(component.bodyCss('skills')).toMatchObject({
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
    expect(component.bodyCss('summary')).toMatchObject({
      color: '#0a5',
      '--cv-section-body-color': '#0a5',
    });
    // The sibling section falls through to the document colour, not to
    // accentColorHex and not to no-colour.
    expect(component.bodyCss('skills')).toMatchObject({
      color: '#204060',
      '--cv-section-body-color': '#204060',
    });
  });

  describe('leafCss — per-element style override (Phase D.2)', () => {
    it('returns an empty style object for a leaf with no elementStyles override', () => {
      expect(component.leafCss('summary')).toEqual({});
      expect(component.leafCss('pd.fullName')).toEqual({});
    });

    it('an empty-string path returns no leaf-level style, even when an UNRELATED path has an override (T1 review minor)', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        elementStyles: { summary: { fontFamily: 'Georgia', fontSizePt: 16 } },
      });
      expect(component.leafCss('')).toEqual({});
    });

    it('returns only the CSS properties actually set on the element override — not the full resolved cascade', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        elementStyles: { summary: { fontFamily: 'Georgia', fontSizePt: 14 } },
      });
      // fontWeight/colorHex/lineHeight were never set on the override, so they
      // must be absent here even though the section/document cascade has
      // concrete values for them (effectiveLeafStyle would fill them in).
      expect(component.leafCss('summary')).toEqual({
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
      expect(component.leafCss('exp.0.role')).toEqual({
        'font-family': 'Arial',
        'font-size': '12pt',
        'font-weight': '700',
        color: '#123456',
        'line-height': '1.5',
      });
    });

    it('never falls back to the section or document accent colour — only an explicit element colorHex appears', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        accentColorHex: '#1B7464',
        sectionStyles: { summary: { colorHex: '#111111' } },
        elementStyles: { summary: { fontSizePt: 13 } },
      });
      expect(component.leafCss('summary')['color']).toBeUndefined();
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

    it('renders the element override as inline style on a skills VALUES leaf in BOTH the page card and the hidden measurement mirror (T3 review minor — typography parity beyond summary/exp-company)', () => {
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

    it('renders the element override as inline style on a language VALUE leaf in BOTH the page card and the hidden measurement mirror (T3 review minor — typography parity beyond summary/exp-company)', () => {
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
      // No leaf-level override was ever set — leafCss must contribute nothing.
      expect(page.style.fontFamily).toBe('');
      expect(page.style.fontSize).toBe('');
      expect(page.style.color).toBe('');
      // The section wrapper (bodyCss) still carries the effective font —
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
      // by the document layer) — colour comes from the wrapper via CSS
      // inheritance, which is what actually shows on screen.
      const page = root.querySelector('.page-card .cvpreview__summary') as HTMLElement;
      expect(page.style.color).toBe('');
      const wrapper = page.closest('.cvpreview__section') as HTMLElement;
      // jsdom normalizes the inline hex to an rgb() triplet — assert it's set
      // rather than comparing string formats.
      expect(wrapper.style.color).not.toBe('');
    });

    it('an element override on the inline editor renders the same style while the leaf is being edited', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', { sectionKey: 'summary', part: 'body' });
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        elementStyles: { summary: { fontFamily: 'Georgia', fontSizePt: 15 } },
      });
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text: 'Hello world' },
      ]);
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

      // Editor <input> — select the personal-details body to switch into edit mode.
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', { sectionKey: 'personal_details', part: 'body' });
      fixture.detectChanges();
      const nameInput = root.querySelector('.page-card input.cvpreview__name') as HTMLInputElement;
      expect(nameInput.style.color).toBe('rgb(255, 0, 0)');
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

  it('per-section title override renders over the document title style', () => {
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      titleStyle: { fontFamily: 'Georgia' },
      sectionStyles: { skills: { title: { fontFamily: 'Arial' } } },
    });
    fixture.componentRef.setInput('sections', [
      { key: 'skills', order: 0, visible: true, groups: [{ label: 'L', values: ['TS'] }] },
    ]);
    fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('.cvpreview__section-title') as HTMLElement;
    expect(title.style.fontFamily).toContain('Arial');
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

  it('explicit user titleBorder wins over the Aurora theme accent rule', () => {
    fixture.componentRef.setInput('themeId', 2);
    fixture.componentRef.setInput('style', { ...CV_STYLE_DEFAULT, titleBorder: 'dotted' });
    const css = component.titleBorderCss('summary');
    expect(css).toContain('dotted');
    expect(css).not.toContain('--cv-accent');
  });

  it('interactive page render marks body/title leaves selectable and emits semantic selection', () => {
    fixture.componentRef.setInput('interactive', true);
    fixture.componentRef.setInput('sections', [
      { key: 'summary', order: 0, visible: true, text: 'Hello' },
    ]);
    fixture.detectChanges();
    const emitted: (CvPreviewSelection | null)[] = [];
    component.selectionChange.subscribe((v) => emitted.push(v));

    const root = fixture.nativeElement as HTMLElement;
    const body = root.querySelector('.page-card .cvpreview__summary') as HTMLElement;
    const title = root.querySelector('.page-card .cvpreview__section-title') as HTMLElement;
    expect(body.classList.contains('cvpreview__selectable')).toBe(true);
    expect(body.getAttribute('role')).toBe('button');
    expect(title.classList.contains('cvpreview__selectable')).toBe(true);

    body.click();
    title.click();
    expect(emitted).toEqual([
      // The summary body atom is exactly one leaf, so its click carries that
      // leaf's elementPath directly (see `selectPart(..., 'summary')` in the
      // template) — same string `leafDraft('summary', ...)` uses.
      { sectionKey: 'summary', part: 'body', elementPath: 'summary' },
      { sectionKey: 'summary', part: 'title' },
    ]);
  });

  it('reflects the active selection as a selected outline on the matching leaf', () => {
    fixture.componentRef.setInput('interactive', true);
    fixture.componentRef.setInput('selection', { sectionKey: 'summary', part: 'title' });
    fixture.componentRef.setInput('sections', [
      { key: 'summary', order: 0, visible: true, text: 'Hello' },
    ]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const title = root.querySelector('.page-card .cvpreview__section-title') as HTMLElement;
    const body = root.querySelector('.page-card .cvpreview__summary') as HTMLElement;
    expect(title.classList.contains('cvpreview__selected')).toBe(true);
    expect(body.classList.contains('cvpreview__selected')).toBe(false);
  });

  it('non-interactive render exposes no selection affordance', () => {
    fixture.componentRef.setInput('sections', [
      { key: 'summary', order: 0, visible: true, text: 'Hello' },
    ]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.cvpreview__selectable')).toBeNull();
    const body = root.querySelector('.page-card .cvpreview__summary') as HTMLElement;
    expect(body.getAttribute('role')).toBeNull();
  });

  it('measurement render is never selectable even when interactive', () => {
    fixture.componentRef.setInput('interactive', true);
    fixture.componentRef.setInput('sections', [
      { key: 'summary', order: 0, visible: true, text: 'Hello' },
    ]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const measured = root.querySelectorAll('.paginated-sheet__measure .cvpreview__summary');
    expect(measured.length).toBeGreaterThan(0);
    measured.forEach((el) => expect(el.classList.contains('cvpreview__selectable')).toBe(false));
  });

  describe('focus trap fix — reselecting the same region (Change 1)', () => {
    function setupExperience() {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', { sectionKey: 'experience', part: 'body' });
      fixture.componentRef.setInput('sections', [
        {
          key: 'experience',
          order: 0,
          visible: true,
          entries: [{ company: 'Acme', role: 'Engineer', startDate: '2020', bullets: ['One'] }],
        },
      ]);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('clicking a bullet host inside the already-selected experience body DOES emit — it now pins a specific elementPath', () => {
      // Phase D.2 supersedes the old blanket "same section/part never
      // re-emits" rule with an element-aware one: the current selection has
      // no elementPath (whole-section state), and the bullet host carries
      // its own leaf path (`exp.0.bullet.0`) — a genuinely more specific
      // target, so this MUST emit to move the style-scope onto it. Re-
      // emitting no longer risks yanking focus away: the focus effect is
      // keyed on section+part only (see `focusKey`), so an elementPath-only
      // change never re-triggers it.
      const root = setupExperience();
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      const bulletHost = root.querySelector('.page-card ul.cvpreview__bullets') as HTMLElement;
      bulletHost.click();
      expect(emitted).toEqual([
        { sectionKey: 'experience', part: 'body', elementPath: 'exp.0.bullet.0' },
      ]);
    });

    it('clicking the same already-pinned leaf again does not re-emit (guard still holds, element-aware)', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.bullet.0',
      });
      fixture.componentRef.setInput('sections', [
        {
          key: 'experience',
          order: 0,
          visible: true,
          entries: [{ company: 'Acme', role: 'Engineer', startDate: '2020', bullets: ['One'] }],
        },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      const bulletHost = root.querySelector('.page-card ul.cvpreview__bullets') as HTMLElement;
      bulletHost.click();
      expect(emitted).toEqual([]);
    });

    it('an elementPath-only change never re-triggers the focus-into-editor effect', async () => {
      // Guards the fix in `focusKey`: without it, pinning a new leaf inside
      // an already-selected section would swap the `selection` input's
      // object reference and re-run the autofocus effect, stealing focus
      // from whatever the user just clicked into (here, the bullet
      // textarea) back to the section's first editor (company).
      const root = setupExperience();
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.company',
      });
      fixture.detectChanges();
      await Promise.resolve();
      const bulletTextarea = root.querySelector(
        '.page-card textarea.cvpreview__bullet-editor',
      ) as HTMLTextAreaElement;
      bulletTextarea.focus();
      expect(document.activeElement).toBe(bulletTextarea);
      // Simulate the click-driven elementPath change the bullet host's own
      // handler would produce.
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.bullet.0',
      });
      fixture.detectChanges();
      await Promise.resolve();
      expect(document.activeElement).toBe(bulletTextarea);
    });

    it('clicking a different section/part still emits a new selection', () => {
      const root = setupExperience();
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      const title = root.querySelector('.page-card .cvpreview__section-title') as HTMLElement;
      title.click();
      expect(emitted).toEqual([{ sectionKey: 'experience', part: 'title' }]);
    });

    it('selectPart is a no-op (no emit) when the requested region is already selected', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', { sectionKey: 'summary', part: 'body' });
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text: 'Hello' },
      ]);
      fixture.detectChanges();
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      component.selectPart('summary', 'body', 'page');
      expect(emitted).toEqual([]);
      component.selectPart('summary', 'title', 'page');
      expect(emitted).toEqual([{ sectionKey: 'summary', part: 'title' }]);
    });
  });

  describe('keyboard hardening', () => {
    function setupSummary() {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text: 'Hello' },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      return {
        root,
        body: root.querySelector('.page-card .cvpreview__summary') as HTMLElement,
        title: root.querySelector('.page-card .cvpreview__section-title') as HTMLElement,
      };
    }

    it('Space activates a selectable host (native-button parity with Enter)', () => {
      const { body } = setupSummary();
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      body.dispatchEvent(ev);
      // The summary body atom is exactly one leaf, so Space (like click)
      // carries that leaf's elementPath — see `onSelectKey(..., 'summary')`.
      expect(emitted).toEqual([{ sectionKey: 'summary', part: 'body', elementPath: 'summary' }]);
      expect(ev.defaultPrevented).toBe(true); // Space must not scroll the page
    });

    it('gives every selectable host an accessible name and a data-cv-select handle', () => {
      const { body, title } = setupSummary();
      expect(body.getAttribute('aria-label')).toBe('Summary — Body text');
      expect(title.getAttribute('aria-label')).toBe('Summary — Section titles');
      expect(body.getAttribute('data-cv-select')).toBe('summary:body');
      expect(title.getAttribute('data-cv-select')).toBe('summary:title');
    });

    it('the selected outline never paints on the inert measurement pass', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', { sectionKey: 'summary', part: 'title' });
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text: 'Hello' },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const measuredTitle = root.querySelector(
        '.paginated-sheet__measure .cvpreview__section-title',
      ) as HTMLElement;
      expect(measuredTitle.classList.contains('cvpreview__selected')).toBe(false);
    });

    it('Escape discards the draft so a later model change is not shadowed by a stale draft', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', { sectionKey: 'summary', part: 'body' });
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text: 'Original' },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const textarea = root.querySelector(
        '.page-card textarea.cvpreview__summary',
      ) as HTMLTextAreaElement;
      textarea.value = 'Half-typed draft';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      // The model changes (e.g. a regenerate lands) while still selected. With a
      // cleared draft the editor reflects the NEW value; a stale `drafts[id]`
      // (the old behaviour) would keep shadowing it.
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text: 'Regenerated' },
      ]);
      fixture.detectChanges();
      expect(textarea.value).toBe('Regenerated');
    });

    it('selecting a region moves focus into its primary editor (autofocus restored)', async () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', { sectionKey: 'summary', part: 'body' });
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text: 'Hello' },
      ]);
      fixture.detectChanges();
      await Promise.resolve(); // flush the queued focus microtask
      const textarea = (fixture.nativeElement as HTMLElement).querySelector(
        '.page-card textarea.cvpreview__summary',
      );
      expect(document.activeElement).toBe(textarea);
    });

    it('Enter on a single-line leaf commits, drops the selection, and returns focus to the host', async () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'personal_details',
        part: 'body',
      });
      fixture.componentRef.setInput('sections', [
        { key: 'personal_details', order: 0, visible: true, fullName: 'Ada', title: '', email: '' },
      ]);
      fixture.detectChanges();
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      const root = fixture.nativeElement as HTMLElement;
      const name = root.querySelector('.page-card input.cvpreview__name') as HTMLInputElement;
      name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(emitted).toContain(null); // selection dropped → resting markup returns
      // Parent clears the selection; the resting host regains focus after render.
      fixture.componentRef.setInput('selection', null);
      fixture.detectChanges();
      await Promise.resolve();
      const host = root.querySelector(
        '.page-card [data-cv-select="personal_details:body"]',
      ) as HTMLElement;
      expect(document.activeElement).toBe(host);
    });
  });

  describe('inline leaf editing — summary', () => {
    function setup(text = 'A **Key** point') {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', { sectionKey: 'summary', part: 'body' });
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const textarea = root.querySelector(
        '.page-card textarea.cvpreview__summary',
      ) as HTMLTextAreaElement;
      return { root, textarea };
    }

    it('mounts a native textarea only on the selected, interactive page render', () => {
      const { textarea } = setup();
      expect(textarea).toBeTruthy();
      // Measurement mirror never gets an editor, even though it's "selected".
      const measured = (fixture.nativeElement as HTMLElement).querySelector(
        '.paginated-sheet__measure textarea',
      );
      expect(measured).toBeNull();
    });

    it('exposes the raw ** markers while focused; resting render keeps <strong>', () => {
      const { textarea, root } = setup();
      expect(textarea.value).toBe('A **Key** point');
      // Not selected → resting <p> shows parsed <strong>, no raw markers.
      fixture.componentRef.setInput('selection', null);
      fixture.detectChanges();
      const strongs = root.querySelectorAll('.cvpreview__summary strong');
      expect(Array.from(strongs).some((s) => s.textContent?.trim() === 'Key')).toBe(true);
      expect(root.querySelector('.page-card p.cvpreview__summary')?.textContent).not.toContain(
        '**',
      );
    });

    it('drafting (typing) emits nothing', () => {
      const { textarea } = setup();
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      textarea.value = 'A **Key** point, edited';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(emitted).toEqual([]);
    });

    it('blur commits exactly one new immutable section', () => {
      const { textarea } = setup();
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const original = component.sections()[0];
      textarea.value = 'Edited summary';
      textarea.dispatchEvent(new Event('input'));
      textarea.dispatchEvent(new Event('blur'));
      fixture.detectChanges();
      expect(emitted).toEqual([
        { key: 'summary', order: 0, visible: true, text: 'Edited summary' },
      ]);
      // Immutability: the original section object passed in is untouched.
      expect(original.key === 'summary' && original.text).toBe('A **Key** point');
    });

    it('Escape restores resting text; a subsequent blur emits nothing', () => {
      const { textarea } = setup();
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      textarea.value = 'Something typed';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges(); // let Angular record the typed value as the last-bound value
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(textarea.value).toBe('A **Key** point');
      textarea.dispatchEvent(new Event('blur'));
      fixture.detectChanges();
      expect(emitted).toEqual([]);
    });

    it('Cmd/Ctrl+B wraps the selection with ** via toggleBoldWrap, without committing', () => {
      const { textarea } = setup('Key point');
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      textarea.setSelectionRange(0, 3); // "Key"
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true }));
      fixture.detectChanges();
      expect(textarea.value).toBe('**Key** point');
      expect(emitted).toEqual([]);
    });

    it('a visible Bold button wraps the selection with ** via toggleBoldWrap, without committing', () => {
      const { textarea, root } = setup('Key point');
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const boldBtn = root.querySelector(
        '.page-card .cvpreview__bold-btn',
      ) as HTMLButtonElement | null;
      expect(boldBtn).toBeTruthy();
      textarea.setSelectionRange(0, 3); // "Key"
      boldBtn!.click();
      fixture.detectChanges();
      expect(textarea.value).toBe('**Key** point');
      expect(emitted).toEqual([]);
    });

    it('the Bold button uses (mousedown) preventDefault so clicking it does not blur the textarea first', () => {
      const { root } = setup('Key point');
      const boldBtn = root.querySelector(
        '.page-card .cvpreview__bold-btn',
      ) as HTMLButtonElement | null;
      const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      boldBtn!.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe('inline leaf editing — personal details', () => {
    function setup(section: Record<string, unknown> = {}) {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'personal_details',
        part: 'body',
      });
      fixture.componentRef.setInput('sections', [
        {
          key: 'personal_details',
          order: 0,
          visible: true,
          fullName: 'Vitalii Kasap',
          title: 'Senior Engineer',
          address: 'Nuremberg',
          phone: '+49 171',
          email: 'v@icloud.com',
          ...section,
        },
      ]);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('renders full name, title, and each visible contact field as individual leaves in order', () => {
      const root = setup();
      const card = root.querySelector('.page-card') as HTMLElement;
      const name = card.querySelector('input.cvpreview__name') as HTMLInputElement;
      const title = card.querySelector('input.cvpreview__title') as HTMLInputElement;
      const contactInputs = Array.from(
        card.querySelectorAll('input.cvpreview__contact-input'),
      ) as HTMLInputElement[];
      expect(name.value).toBe('Vitalii Kasap');
      expect(title.value).toBe('Senior Engineer');
      expect(contactInputs.map((i) => i.value)).toEqual(['Nuremberg', '+49 171', 'v@icloud.com']);
      // Separators are derived, non-editable text nodes between leaves.
      const seps = card.querySelectorAll('.cvpreview__contact-sep');
      expect(seps.length).toBe(contactInputs.length - 1);
      seps.forEach((s) => expect(s.tagName).not.toBe('INPUT'));
    });

    it('localized fallback activates the underlying (empty) fullName field without persisting it', () => {
      const root = setup({ fullName: '' });
      const name = root.querySelector('.page-card input.cvpreview__name') as HTMLInputElement;
      expect(name.value).toBe(''); // real value, not the fallback label
      expect(name.placeholder.length).toBeGreaterThan(0); // localized fallback, shown only as a hint
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      name.dispatchEvent(new Event('blur')); // untouched → no commit
      expect(emitted).toEqual([]);
    });

    it('committing one field emits one new immutable section touching only that field', () => {
      const root = setup();
      const emitted: Record<string, unknown>[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v as Record<string, unknown>));
      const contactInputs = Array.from(
        root.querySelectorAll('.page-card input.cvpreview__contact-input'),
      ) as HTMLInputElement[];
      const emailInput = contactInputs.find((i) => i.value === 'v@icloud.com')!;
      emailInput.value = 'new@icloud.com';
      emailInput.dispatchEvent(new Event('input'));
      emailInput.dispatchEvent(new Event('blur'));
      expect(emitted.length).toBe(1);
      expect(emitted[0]).toMatchObject({ email: 'new@icloud.com', fullName: 'Vitalii Kasap' });
    });

    it('drafting a contact field emits nothing until blur', () => {
      const root = setup();
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const contactInputs = Array.from(
        root.querySelectorAll('.page-card input.cvpreview__contact-input'),
      ) as HTMLInputElement[];
      const phoneInput = contactInputs.find((i) => i.value === '+49 171')!;
      phoneInput.value = '+49 999';
      phoneInput.dispatchEvent(new Event('input'));
      expect(emitted).toEqual([]);
    });

    it('measurement mirror never renders personal-details editors, even when selected', () => {
      const root = setup();
      const measured = root.querySelectorAll('.paginated-sheet__measure input.cvpreview__name');
      expect(measured.length).toBe(0);
    });
  });

  describe('inline leaf editing — experience', () => {
    function setup(themeId = 1) {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('themeId', themeId);
      fixture.componentRef.setInput('selection', { sectionKey: 'experience', part: 'body' });
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
              endDate: '2022',
              location: 'Berlin',
              industry: 'SaaS',
              bullets: ['Shipped **X**', 'Led Y'],
            },
            {
              company: 'Globex',
              role: 'Lead',
              startDate: '2022',
              bullets: [],
            },
          ],
        },
      ]);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('renders company/location/role/dates as individual leaves for every entry, and bullets as textareas', () => {
      const root = setup(2); // Aurora theme so industry also renders
      const cards = root.querySelectorAll('.page-card');
      const card = cards[0] as HTMLElement;
      const company = card.querySelector('input.cvpreview__entry-company') as HTMLInputElement;
      const industry = card.querySelector('input.cvpreview__entry-industry') as HTMLInputElement;
      const location = card.querySelector('input.cvpreview__entry-meta') as HTMLInputElement;
      const role = card.querySelector('input.cvpreview__entry-role') as HTMLInputElement;
      const dateInputs = Array.from(
        card.querySelectorAll('input.cvpreview__date-input'),
      ) as HTMLInputElement[];
      expect(company.value).toBe('Acme');
      expect(industry.value).toBe('SaaS');
      expect(location.value).toBe('Berlin');
      expect(role.value).toBe('Engineer');
      // Section-level selection mounts editors for every entry on the page card:
      // entry 0 (2020–2022) and entry 1 (2022–<empty, Present placeholder>).
      expect(dateInputs.map((i) => i.value)).toEqual(['2020', '2022', '2022', '']);
      const bulletAreas = root.querySelectorAll('textarea.cvpreview__leaf-editor');
      expect(bulletAreas.length).toBe(2); // both bullets of entry 0
    });

    it('industry is not editable on a theme that does not render it (Classic)', () => {
      const root = setup(1);
      const card = root.querySelectorAll('.page-card')[0] as HTMLElement;
      expect(card.querySelector('input.cvpreview__entry-industry')).toBeNull();
    });

    it('empty industry stays non-editable on a theme that renders industry (Aurora), matching the resting render', () => {
      // Aurora (theme 2) has showIndustry: true, but entry 1 (Globex) has no
      // industry value. The resting render shows nothing for industry on that
      // entry, so the editor must not surface an editable industry field or
      // its dash separator either — only visibly rendered fields are editable.
      const root = setup(2);
      const card = root.querySelectorAll('.page-card')[0] as HTMLElement;
      const entryTwo = card.querySelectorAll('.cvpreview__entry')[1] as HTMLElement;
      expect(entryTwo.querySelector('input.cvpreview__entry-industry')).toBeNull();
      expect(entryTwo.querySelector('.cvpreview__entry-industry')).toBeNull();
    });

    it('empty endDate shows the localized Present placeholder without persisting it', () => {
      const root = setup(2);
      const card = root.querySelectorAll('.page-card')[0] as HTMLElement;
      const dateInputs = Array.from(
        card.querySelectorAll('input.cvpreview__date-input'),
      ) as HTMLInputElement[];
      // Entry 1 (Globex) has no endDate — its endDate input is the 4th date input (2 per entry).
      const globexEnd = dateInputs[3];
      expect(globexEnd.value).toBe('');
      expect(globexEnd.placeholder.length).toBeGreaterThan(0);
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      globexEnd.dispatchEvent(new Event('blur'));
      expect(emitted).toEqual([]);
    });

    it('the en-dash date separator and bullet list markup stay non-editable', () => {
      const root = setup(2);
      const card = root.querySelectorAll('.page-card')[0] as HTMLElement;
      const seps = card.querySelectorAll('.cvpreview__date-sep');
      expect(seps.length).toBeGreaterThan(0);
      seps.forEach((s) => expect(s.tagName).not.toBe('INPUT'));
    });

    it('committing company emits one new immutable section touching only that entry/field', () => {
      const root = setup(2);
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const original = component.sections()[0] as Record<string, unknown> & {
        entries: unknown[];
      };
      const originalEntries = original.entries;
      const card = root.querySelectorAll('.page-card')[0] as HTMLElement;
      const company = card.querySelector('input.cvpreview__entry-company') as HTMLInputElement;
      company.value = 'Acme Corp';
      company.dispatchEvent(new Event('input'));
      company.dispatchEvent(new Event('blur'));
      expect(emitted.length).toBe(1);
      const updated = emitted[0] as { entries: { company: string }[] };
      expect(updated.entries[0].company).toBe('Acme Corp');
      expect(updated.entries[1]).toBe(originalEntries[1]); // untouched entry same reference
      expect(originalEntries[0]).toMatchObject({ company: 'Acme' }); // original untouched
    });

    it('committing a bullet emits one new immutable section touching only that bullet', () => {
      const root = setup(2);
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const original = component.sections()[0] as { entries: { bullets: string[] }[] };
      const originalBullets = original.entries[0].bullets;
      const textarea = root.querySelectorAll(
        'textarea.cvpreview__leaf-editor',
      )[1] as HTMLTextAreaElement; // second bullet: "Led Y"
      textarea.value = 'Led Y and Z';
      textarea.dispatchEvent(new Event('input'));
      textarea.dispatchEvent(new Event('blur'));
      expect(emitted.length).toBe(1);
      const updated = emitted[0] as { entries: { bullets: string[] }[] };
      expect(updated.entries[0].bullets).toEqual(['Shipped **X**', 'Led Y and Z']);
      expect(originalBullets[1]).toBe('Led Y'); // original untouched
    });

    it('a visible Bold button wraps a bullet selection with ** via toggleBoldWrap, without committing', () => {
      const root = setup(2);
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const textarea = root.querySelectorAll(
        'textarea.cvpreview__leaf-editor',
      )[1] as HTMLTextAreaElement; // second bullet: "Led Y"
      const boldBtn = textarea
        .closest('li')
        ?.querySelector('.cvpreview__bold-btn') as HTMLButtonElement | null;
      expect(boldBtn).toBeTruthy();
      textarea.setSelectionRange(0, 3); // "Led"
      boldBtn!.click();
      fixture.detectChanges();
      expect(textarea.value).toBe('**Led** Y');
      expect(emitted).toEqual([]);
    });

    it('drafting (typing) emits nothing', () => {
      const root = setup(2);
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const card = root.querySelectorAll('.page-card')[0] as HTMLElement;
      const role = card.querySelector('input.cvpreview__entry-role') as HTMLInputElement;
      role.value = 'Staff Engineer';
      role.dispatchEvent(new Event('input'));
      expect(emitted).toEqual([]);
    });

    it('measurement mirror never renders experience editors, even when selected', () => {
      const root = setup(2);
      const measured = root.querySelectorAll(
        '.paginated-sheet__measure input.cvpreview__entry-company',
      );
      expect(measured.length).toBe(0);
    });
  });

  describe('inline leaf editing — education', () => {
    function setup() {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', { sectionKey: 'education', part: 'body' });
      fixture.componentRef.setInput('sections', [
        {
          key: 'education',
          order: 0,
          visible: true,
          entries: [
            { institution: 'MIT', degree: 'BSc', startDate: '2016', endDate: '2020' },
            { institution: 'Stanford', degree: 'MSc', startDate: '2020' },
          ],
        },
      ]);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('renders degree, institution, and dates as individual leaves for every entry', () => {
      const root = setup();
      const cards = root.querySelectorAll('.page-card');
      const inputs = Array.from(
        cards[0].querySelectorAll('input.cvpreview__leaf-editor'),
      ) as HTMLInputElement[];
      // 2 entries × (degree, institution, startDate, endDate) = 8 inputs.
      expect(inputs.length).toBe(8);
      expect(inputs.map((i) => i.value)).toEqual([
        'BSc',
        'MIT',
        '2016',
        '2020',
        'MSc',
        'Stanford',
        '2020',
        '',
      ]);
    });

    it('empty endDate shows the localized Present placeholder without persisting it', () => {
      const root = setup();
      const inputs = Array.from(
        root.querySelectorAll('input.cvpreview__date-input'),
      ) as HTMLInputElement[];
      const stanfordEnd = inputs[3];
      expect(stanfordEnd.value).toBe('');
      expect(stanfordEnd.placeholder.length).toBeGreaterThan(0);
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      stanfordEnd.dispatchEvent(new Event('blur'));
      expect(emitted).toEqual([]);
    });

    it('committing degree emits one new immutable section touching only that entry/field', () => {
      const root = setup();
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const original = component.sections()[0] as { entries: { degree: string }[] };
      const originalEntries = original.entries;
      const degreeInput = root.querySelector('input.cvpreview__leaf-editor') as HTMLInputElement;
      degreeInput.value = 'BA';
      degreeInput.dispatchEvent(new Event('input'));
      degreeInput.dispatchEvent(new Event('blur'));
      expect(emitted.length).toBe(1);
      const updated = emitted[0] as { entries: { degree: string }[] };
      expect(updated.entries[0].degree).toBe('BA');
      expect(updated.entries[1]).toBe(originalEntries[1]); // untouched entry same reference
    });

    it('drafting emits nothing', () => {
      const root = setup();
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const degreeInput = root.querySelector('input.cvpreview__leaf-editor') as HTMLInputElement;
      degreeInput.value = 'BA';
      degreeInput.dispatchEvent(new Event('input'));
      expect(emitted).toEqual([]);
    });

    it('measurement mirror never renders education editors, even when selected', () => {
      const root = setup();
      const measured = root.querySelectorAll(
        '.paginated-sheet__measure input.cvpreview__leaf-editor',
      );
      expect(measured.length).toBe(0);
    });

    it('the degree/institution comma and the en-dash date separator stay non-editable', () => {
      const root = setup();
      const card = root.querySelectorAll('.page-card')[0] as HTMLElement;
      const roleSeps = card.querySelectorAll('.cvpreview__entry-role-sep');
      const dateSeps = card.querySelectorAll('.cvpreview__date-sep');
      expect(roleSeps.length).toBeGreaterThan(0);
      expect(dateSeps.length).toBeGreaterThan(0);
      roleSeps.forEach((s) => expect(s.tagName).not.toBe('INPUT'));
      dateSeps.forEach((s) => expect(s.tagName).not.toBe('INPUT'));
    });
  });

  describe('inline leaf editing — skills', () => {
    function setup() {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', { sectionKey: 'skills', part: 'body' });
      fixture.componentRef.setInput('sections', [
        {
          key: 'skills',
          order: 0,
          visible: true,
          groups: [
            { label: 'Languages', values: ['TypeScript', 'Rust'] },
            { label: 'Empty', values: [] },
          ],
        },
      ]);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('renders a label leaf and a values leaf for a non-empty group only', () => {
      const root = setup();
      const label = root.querySelector('input.cvpreview__skill-label') as HTMLInputElement;
      const values = root.querySelector('input.cvpreview__skill-values') as HTMLInputElement;
      expect(label.value).toBe('Languages');
      expect(values.value).toBe('TypeScript, Rust');
      // The empty group stays entirely non-rendered (non-visible/empty field rule).
      const allLabels = root.querySelectorAll('input.cvpreview__skill-label');
      expect(allLabels.length).toBe(1);
    });

    it('committing the label emits one new immutable section touching only that group', () => {
      const root = setup();
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const original = component.sections()[0] as { groups: { label: string }[] };
      const label = root.querySelector('input.cvpreview__skill-label') as HTMLInputElement;
      label.value = 'Tech';
      label.dispatchEvent(new Event('input'));
      label.dispatchEvent(new Event('blur'));
      expect(emitted.length).toBe(1);
      const updated = emitted[0] as { groups: { label: string; values: string[] }[] };
      expect(updated.groups[0]).toMatchObject({ label: 'Tech', values: ['TypeScript', 'Rust'] });
      expect(original.groups[0].label).toBe('Languages'); // original untouched
    });

    it('committing values re-splits the comma-separated text into a fresh array', () => {
      const root = setup();
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const values = root.querySelector('input.cvpreview__skill-values') as HTMLInputElement;
      values.value = 'TypeScript, Angular, Go';
      values.dispatchEvent(new Event('input'));
      values.dispatchEvent(new Event('blur'));
      expect(emitted.length).toBe(1);
      const updated = emitted[0] as { groups: { values: string[] }[] };
      expect(updated.groups[0].values).toEqual(['TypeScript', 'Angular', 'Go']);
    });

    it('drafting emits nothing', () => {
      const root = setup();
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const label = root.querySelector('input.cvpreview__skill-label') as HTMLInputElement;
      label.value = 'Tech';
      label.dispatchEvent(new Event('input'));
      expect(emitted).toEqual([]);
    });

    it('measurement mirror never renders skills editors, even when selected', () => {
      const root = setup();
      const measured = root.querySelectorAll(
        '.paginated-sheet__measure input.cvpreview__skill-label',
      );
      expect(measured.length).toBe(0);
    });
  });

  describe('inline leaf editing — languages', () => {
    function setup() {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', { sectionKey: 'languages', part: 'body' });
      fixture.componentRef.setInput('sections', [
        {
          key: 'languages',
          order: 0,
          visible: true,
          items: [
            { language: 'English', level: 'C2' },
            { language: 'German', level: 'B1' },
          ],
        },
      ]);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('renders each language value as an individual leaf, separated by non-editable separators', () => {
      const root = setup();
      const card = root.querySelector('.page-card') as HTMLElement;
      const inputs = Array.from(
        card.querySelectorAll('input.cvpreview__language-input'),
      ) as HTMLInputElement[];
      expect(inputs.map((i) => i.value)).toEqual(['English', 'German']);
      // Scoped to the visible page-card (like its sibling separator
      // assertions above): the hidden measurement mirror renders the same
      // resting markup — including, since Phase D.2 made each language value
      // its own clickable leaf, its own `.cvpreview__languages-sep` — and an
      // unscoped query would double-count across both passes.
      const seps = card.querySelectorAll('.cvpreview__languages-sep');
      expect(seps.length).toBe(1);
      seps.forEach((s) => expect(s.tagName).not.toBe('INPUT'));
    });

    it('does not render a level editor (level stays Edit-only, not in the preview)', () => {
      const root = setup();
      expect(root.querySelector('[class*="level"]')).toBeNull();
    });

    it('committing one language value emits one new immutable section touching only that item', () => {
      const root = setup();
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const original = component.sections()[0] as { items: { language: string; level: string }[] };
      const inputs = Array.from(
        root.querySelectorAll('input.cvpreview__language-input'),
      ) as HTMLInputElement[];
      const germanInput = inputs[1];
      germanInput.value = 'Deutsch';
      germanInput.dispatchEvent(new Event('input'));
      germanInput.dispatchEvent(new Event('blur'));
      expect(emitted.length).toBe(1);
      const updated = emitted[0] as { items: { language: string; level: string }[] };
      expect(updated.items[1]).toEqual({ language: 'Deutsch', level: 'B1' }); // level untouched
      expect(updated.items[0]).toBe(original.items[0]); // untouched item same reference
      expect(original.items[1].language).toBe('German'); // original untouched
    });

    it('drafting emits nothing', () => {
      const root = setup();
      const emitted: unknown[] = [];
      component.sectionChange.subscribe((v) => emitted.push(v));
      const inputs = Array.from(
        root.querySelectorAll('input.cvpreview__language-input'),
      ) as HTMLInputElement[];
      inputs[0].value = 'Anglais';
      inputs[0].dispatchEvent(new Event('input'));
      expect(emitted).toEqual([]);
    });

    it('measurement mirror never renders language editors, even when selected', () => {
      const root = setup();
      const measured = root.querySelectorAll(
        '.paginated-sheet__measure input.cvpreview__language-input',
      );
      expect(measured.length).toBe(0);
    });
  });

  describe('element-level selection identity (Phase D.2)', () => {
    it('clicking a section title never carries an elementPath', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text: 'Hello' },
      ]);
      fixture.detectChanges();
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      const title = (fixture.nativeElement as HTMLElement).querySelector(
        '.page-card .cvpreview__section-title',
      ) as HTMLElement;
      title.click();
      expect(emitted).toEqual([{ sectionKey: 'summary', part: 'title' }]);
      expect(emitted[0] && 'elementPath' in emitted[0]).toBe(false);
    });

    it('the inert measurement pass never emits, even when a leaf-level span is clicked', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('sections', [
        {
          key: 'experience',
          order: 0,
          visible: true,
          entries: [{ company: 'Acme', role: 'Engineer', startDate: '2020', bullets: [] }],
        },
      ]);
      fixture.detectChanges();
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      const measuredRole = (fixture.nativeElement as HTMLElement).querySelector(
        '.paginated-sheet__measure .cvpreview__entry-role',
      ) as HTMLElement;
      expect(measuredRole).toBeTruthy();
      measuredRole.click();
      expect(emitted).toEqual([]);
    });

    // Representative leaves (per the task's example set): the string a leaf's
    // click emits as `elementPath` must be the exact same string `leafDraft`
    // uses to key that leaf's draft — one shared identity, asserted
    // end-to-end (click → emitted path → set as selection → type into the
    // now-mounted editor → read back via `leafDraft` using that same path).

    it('summary — the emitted elementPath is the same key leafDraft uses', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('sections', [
        { key: 'summary', order: 0, visible: true, text: 'Hello' },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      const body = root.querySelector('.page-card .cvpreview__summary') as HTMLElement;
      body.click();
      expect(emitted).toEqual([{ sectionKey: 'summary', part: 'body', elementPath: 'summary' }]);

      fixture.componentRef.setInput('selection', emitted[0]);
      fixture.detectChanges();
      const textarea = root.querySelector(
        '.page-card textarea.cvpreview__summary',
      ) as HTMLTextAreaElement;
      textarea.value = 'Edited';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(component.leafDraft('summary', 'unused-resting-fallback')).toBe('Edited');
    });

    it('exp.1.role — the emitted elementPath is the same key leafDraft uses', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('sections', [
        {
          key: 'experience',
          order: 0,
          visible: true,
          entries: [
            { company: 'Acme', role: 'Engineer', startDate: '2020', bullets: [] },
            { company: 'Globex', role: 'Lead', startDate: '2022', bullets: [] },
          ],
        },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      const entries = root.querySelectorAll('.page-card .cvpreview__entry');
      const secondRole = entries[1].querySelector('.cvpreview__entry-role') as HTMLElement;
      secondRole.click();
      expect(emitted).toEqual([
        { sectionKey: 'experience', part: 'body', elementPath: 'exp.1.role' },
      ]);

      fixture.componentRef.setInput('selection', emitted[0]);
      fixture.detectChanges();
      const roleInputs = root.querySelectorAll(
        'input.cvpreview__entry-role',
      ) as NodeListOf<HTMLInputElement>;
      roleInputs[1].value = 'Staff Engineer';
      roleInputs[1].dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(component.leafDraft('exp.1.role', 'unused')).toBe('Staff Engineer');
    });

    it('exp.1.bullet.0 — the emitted elementPath is the same key leafDraft uses', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('sections', [
        {
          key: 'experience',
          order: 0,
          visible: true,
          entries: [
            { company: 'Acme', role: 'Engineer', startDate: '2020', bullets: [] },
            { company: 'Globex', role: 'Lead', startDate: '2022', bullets: ['Shipped X'] },
          ],
        },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      // Entry 0 has no bullets, so exactly one bullet host exists — entry 1's.
      const bulletHost = root.querySelector('.page-card ul.cvpreview__bullets') as HTMLElement;
      bulletHost.click();
      expect(emitted).toEqual([
        { sectionKey: 'experience', part: 'body', elementPath: 'exp.1.bullet.0' },
      ]);

      fixture.componentRef.setInput('selection', emitted[0]);
      fixture.detectChanges();
      const textarea = root.querySelector(
        'textarea.cvpreview__bullet-editor',
      ) as HTMLTextAreaElement;
      textarea.value = 'Shipped X and Y';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(component.leafDraft('exp.1.bullet.0', 'unused')).toBe('Shipped X and Y');
    });

    it('skills.0.values — the emitted elementPath is the same key leafDraft uses', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('sections', [
        {
          key: 'skills',
          order: 0,
          visible: true,
          groups: [{ label: 'Languages', values: ['TypeScript', 'Rust'] }],
        },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      const valuesSpan = root.querySelector(
        '.page-card .cvpreview__skill-values-view',
      ) as HTMLElement;
      valuesSpan.click();
      expect(emitted).toEqual([
        { sectionKey: 'skills', part: 'body', elementPath: 'skills.0.values' },
      ]);

      fixture.componentRef.setInput('selection', emitted[0]);
      fixture.detectChanges();
      const valuesInput = root.querySelector('input.cvpreview__skill-values') as HTMLInputElement;
      valuesInput.value = 'TypeScript, Go';
      valuesInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(component.leafDraft('skills.0.values', 'unused')).toBe('TypeScript, Go');
    });

    it('lang.0.language — the emitted elementPath is the same key leafDraft uses', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('sections', [
        {
          key: 'languages',
          order: 0,
          visible: true,
          items: [
            { language: 'English', level: 'C2' },
            { language: 'German', level: 'B1' },
          ],
        },
      ]);
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      const values = root.querySelectorAll('.page-card .cvpreview__language-value');
      (values[0] as HTMLElement).click();
      expect(emitted).toEqual([
        { sectionKey: 'languages', part: 'body', elementPath: 'lang.0.language' },
      ]);

      fixture.componentRef.setInput('selection', emitted[0]);
      fixture.detectChanges();
      const inputs = root.querySelectorAll(
        'input.cvpreview__language-input',
      ) as NodeListOf<HTMLInputElement>;
      inputs[0].value = 'Anglais';
      inputs[0].dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(component.leafDraft('lang.0.language', 'unused')).toBe('Anglais');
    });

    it('isElementSelected highlights only the pinned leaf — distinct from the section-level isSelected outline', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.role',
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
      const roleInput = root.querySelector('input.cvpreview__entry-role') as HTMLElement;
      const companyInput = root.querySelector('input.cvpreview__entry-company') as HTMLElement;
      expect(roleInput.classList.contains('cvpreview__element-selected')).toBe(true);
      expect(companyInput.classList.contains('cvpreview__element-selected')).toBe(false);
      expect(component.isElementSelected('exp.0.role')).toBe(true);
      expect(component.isElementSelected('exp.0.company')).toBe(false);
      // isSelected ignores elementPath entirely — content-editor gating is
      // unchanged by Phase D.2.
      expect(component.isSelected('experience', 'body')).toBe(true);
    });

    it('the element-selected highlight never leaks into the inert measurement pass (review fix)', () => {
      // Regression: the resting (@else) leaf branches' `cvpreview__element-
      // selected` bindings used to read only `isElementSelected(path)`,
      // omitting the `selectable(renderMode)` guard the sibling
      // `cvpreview__selected` binding always carries. Since resting leaf
      // spans render in BOTH the page pass and the hidden measurement
      // mirror, an active elementPath selection leaked the highlight
      // outline into the measure pass — a contract violation (the measure
      // pass must render no selection chrome at all). Scoped to `.page-card`
      // vs `.paginated-sheet__measure`, mirroring the existing measurement-
      // mirror tests above.
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.role',
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
      // On a page-card render `selectable(renderMode)` is true, so the
      // section+part selection mounts the inline editor (an <input>), not
      // the resting <span> — the resting branch this bug lives in only
      // renders when NOT selectable, i.e. only in the measurement mirror.
      const pageRole = root.querySelector(
        '.page-card input.cvpreview__entry-role',
      ) as HTMLInputElement;
      const measuredRole = root.querySelector(
        '.paginated-sheet__measure .cvpreview__entry-role',
      ) as HTMLElement;
      expect(pageRole).toBeTruthy();
      expect(measuredRole).toBeTruthy();
      // The page-card input reflects the pinned selection via its own
      // (already-gated-by-context) binding...
      expect(pageRole.classList.contains('cvpreview__element-selected')).toBe(true);
      // ...but the measure pass's resting span must NEVER carry it, even
      // though `isElementSelected('exp.0.role')` alone would say true.
      expect(measuredRole.classList.contains('cvpreview__element-selected')).toBe(false);
    });

    it('selecting a different leaf in the same section emits (guard is element-aware, not just section-aware)', () => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.role',
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
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      // Same sectionKey/part as current selection, different elementPath.
      component.selectPart('experience', 'body', 'page', undefined, 'exp.0.company');
      expect(emitted).toEqual([
        { sectionKey: 'experience', part: 'body', elementPath: 'exp.0.company' },
      ]);
      // The parent would normally feed the emitted value back in as the new
      // `selection` input — simulate that, then confirm re-selecting the
      // exact same leaf is a no-op.
      fixture.componentRef.setInput('selection', emitted[0]);
      fixture.detectChanges();
      component.selectPart('experience', 'body', 'page', undefined, 'exp.0.company');
      expect(emitted).toEqual([
        { sectionKey: 'experience', part: 'body', elementPath: 'exp.0.company' },
      ]);
    });
  });

  describe('per-leaf accessible names (Task 6 a11y hardening — T2 review minor)', () => {
    // Regression: every per-leaf selectable host used to reuse the generic
    // `selectAriaLabel(key, 'body')` name, so a screen reader announced the
    // SAME "<section> — Body text" label for every field in one entry (e.g.
    // company/industry/location/role in a single experience entry). Each leaf
    // with its own `elementPath` must now announce its specific field instead.
    function setupFullEntry() {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('sections', [
        {
          key: 'personal_details',
          order: 0,
          visible: true,
          fullName: 'Ada Lovelace',
          title: 'Engineer',
        },
        {
          key: 'experience',
          order: 1,
          visible: true,
          entries: [
            {
              company: 'Acme',
              role: 'Engineer',
              industry: 'SaaS',
              location: 'Berlin',
              startDate: '2020',
              bullets: ['Shipped things'],
            },
          ],
        },
        {
          key: 'skills',
          order: 2,
          visible: true,
          groups: [{ label: 'Languages', values: ['TypeScript'] }],
        },
        {
          key: 'languages',
          order: 3,
          visible: true,
          items: [{ language: 'English', level: 'C1' }],
        },
      ]);
      fixture.componentRef.setInput('themeId', 2); // Aurora — shows industry
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('gives the personal-details fullName and title leaves distinct field names', () => {
      const root = setupFullEntry();
      const fullName = root.querySelector('.page-card h2.cvpreview__name') as HTMLElement;
      const title = root.querySelector('.page-card p.cvpreview__title') as HTMLElement;
      expect(fullName.getAttribute('aria-label')).toBe('Personal Details — Full name');
      expect(title.getAttribute('aria-label')).toBe('Personal Details — Job title');
    });

    it('gives each experience-entry leaf (company/industry/location/role/bullet) its own field name — no longer all "Experience — Body text"', () => {
      const root = setupFullEntry();
      const company = root.querySelector('.page-card .cvpreview__entry-company') as HTMLElement;
      const industry = root.querySelector('.page-card .cvpreview__entry-industry') as HTMLElement;
      const location = root.querySelector('.page-card .cvpreview__entry-meta') as HTMLElement;
      const role = root.querySelector('.page-card .cvpreview__entry-role') as HTMLElement;
      const bullet = root.querySelector('.page-card ul.cvpreview__bullets') as HTMLElement;
      expect(company.getAttribute('aria-label')).toBe('Experience — Company');
      expect(industry.getAttribute('aria-label')).toBe('Experience — Industry');
      expect(location.getAttribute('aria-label')).toBe('Experience — Location');
      expect(role.getAttribute('aria-label')).toBe('Experience — Role');
      expect(bullet.getAttribute('aria-label')).toBe('Experience — Achievement / responsibility');
      // All five are genuinely distinct — the whole point of the fix.
      const labels = [company, industry, location, role, bullet].map((el) =>
        el.getAttribute('aria-label'),
      );
      expect(new Set(labels).size).toBe(labels.length);
      // The whole-entry wrapper (no elementPath) keeps the generic name —
      // there is no single leaf to disambiguate there.
      const entryWrapper = root.querySelector('.page-card .cvpreview__entry') as HTMLElement;
      expect(entryWrapper.getAttribute('aria-label')).toBe('Experience — Body text');
    });

    it('gives the skills label and values leaves distinct field names', () => {
      const root = setupFullEntry();
      const label = root.querySelector('.page-card .cvpreview__skill-label-view') as HTMLElement;
      const values = root.querySelector('.page-card .cvpreview__skill-values-view') as HTMLElement;
      expect(label.getAttribute('aria-label')).toBe('Skills — Label');
      expect(values.getAttribute('aria-label')).toBe('Skills — Values');
    });

    it('gives the language-value leaf its field name', () => {
      const root = setupFullEntry();
      const value = root.querySelector('.page-card .cvpreview__language-value') as HTMLElement;
      expect(value.getAttribute('aria-label')).toBe('Languages — Language');
    });
  });

  describe('click-empty-space deselect', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('interactive', true);
      fixture.componentRef.setInput('selection', { sectionKey: 'summary', part: 'body' });
    });

    it('clears the selection when the click is not on a selectable host or editor', () => {
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      // A detached element's closest() returns null → treated as empty space.
      component.onBackgroundClick({ target: document.createElement('div') } as unknown as Event);
      expect(emitted).toEqual([null]);
    });

    it('keeps the selection when the click lands on the active editor', () => {
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      const editor = document.createElement('textarea');
      editor.className = 'cvpreview__leaf-editor';
      component.onBackgroundClick({ target: editor } as unknown as Event);
      expect(emitted).toEqual([]);
    });

    it('is inert on a non-interactive render', () => {
      fixture.componentRef.setInput('interactive', false);
      const emitted: (CvPreviewSelection | null)[] = [];
      component.selectionChange.subscribe((v) => emitted.push(v));
      component.onBackgroundClick({ target: document.createElement('div') } as unknown as Event);
      expect(emitted).toEqual([]);
    });
  });

  describe('applyActiveBold (panel-routed word bold)', () => {
    it('wraps the focused editor selection in ** using its data-draft-id', async () => {
      const ta = document.createElement('textarea');
      ta.className = 'cvpreview__leaf-editor';
      ta.setAttribute('data-draft-id', 'summary');
      ta.value = 'hello world';
      fixture.nativeElement.appendChild(ta);
      ta.focus();
      ta.setSelectionRange(0, 5);
      component.applyActiveBold();
      await Promise.resolve(); // flush the caret-restoring microtask
      expect(ta.value).toBe('**hello** world');
    });

    it('is a no-op when the focused element is not a bold-capable editor', async () => {
      const input = document.createElement('input');
      input.className = 'cvpreview__leaf-editor'; // no data-draft-id
      input.value = 'plain';
      fixture.nativeElement.appendChild(input);
      input.focus();
      component.applyActiveBold();
      await Promise.resolve();
      expect(input.value).toBe('plain');
    });
  });
});
