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
      { sectionKey: 'summary', part: 'body' },
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
});
