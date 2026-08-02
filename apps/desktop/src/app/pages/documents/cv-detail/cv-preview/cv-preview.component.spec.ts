import { ComponentFixture } from '@angular/core/testing';
import { CV_STYLE_DEFAULT } from '@applye/core';
import type { CvPreviewSelection } from '../../cv-content.util';
import { CvPreviewComponent } from './cv-preview.component';
import { createCvPreview } from './cv-preview.harness';

describe('CvPreviewComponent', () => {
  let component: CvPreviewComponent;
  let fixture: ComponentFixture<CvPreviewComponent>;

  beforeEach(async () => {
    ({ component, fixture } = await createCvPreview());
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

  it('omits the degree/institution separator when the degree is empty', () => {
    // Regression: a CV whose Education entry has only the institution (no
    // degree) rendered a stray leading "," before the name. The separator now
    // renders only when both sides are present.
    fixture.componentRef.setInput('sections', [
      {
        key: 'education',
        order: 0,
        visible: true,
        entries: [
          { institution: 'Odessa National University', degree: '', startDate: '', endDate: '' },
        ],
      },
    ]);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.cvpreview__entry-role-sep')).toBeNull();
    expect(root.textContent).toContain('Odessa National University');
  });

  it('keeps the separator when both degree and institution are present', () => {
    fixture.componentRef.setInput('sections', [
      {
        key: 'education',
        order: 0,
        visible: true,
        entries: [{ institution: 'MIT', degree: 'BSc', startDate: '', endDate: '' }],
      },
    ]);
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.cvpreview__entry-role-sep'),
    ).not.toBeNull();
  });

  it('bodyBorder emits the rule style vars for a visible divider', () => {
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      sectionStyles: { experience: { bodyBorder: 'dashed' } },
    });
    fixture.detectChanges();
    const css = component.bodyCss('experience');
    expect(css['--cv-entry-rule-style']).toBe('dashed');
    expect(css['--cv-header-rule-style']).toBe('dashed');
  });

  it('a whole-entry selection frames only the clicked entry; languages body frames its <p>', () => {
    fixture.componentRef.setInput('interactive', true);
    fixture.componentRef.setInput('sections', [
      {
        key: 'experience',
        order: 0,
        visible: true,
        entries: [
          { company: 'Acme', role: 'Eng', startDate: '2020', bullets: ['x'] },
          { company: 'Beta', role: 'Dev', startDate: '2018', bullets: ['y'] },
        ],
      },
      { key: 'languages', order: 1, visible: true, items: [{ language: 'English', level: '' }] },
    ]);
    fixture.componentRef.setInput('selection', {
      sectionKey: 'experience',
      part: 'body',
      elementPath: 'exp.1',
    });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    // Only the clicked entry's head is framed - not every experience entry.
    expect(
      root.querySelectorAll('.page-card .cvpreview__entry.cvpreview__element-selected'),
    ).toHaveLength(1);

    fixture.componentRef.setInput('selection', {
      sectionKey: 'languages',
      part: 'body',
      elementPath: 'lang',
    });
    fixture.detectChanges();
    expect(
      root.querySelector('.page-card p.cvpreview__languages.cvpreview__element-selected'),
    ).toBeTruthy();
  });

  it('selecting a skills group frames only that row', () => {
    fixture.componentRef.setInput('interactive', true);
    fixture.componentRef.setInput('sections', [
      {
        key: 'skills',
        order: 0,
        visible: true,
        groups: [
          { label: 'Frontend', values: ['TS'] },
          { label: 'Backend', values: ['Go'] },
        ],
      },
    ]);
    fixture.componentRef.setInput('selection', {
      sectionKey: 'skills',
      part: 'body',
      elementPath: 'skills.1',
    });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(
      root.querySelectorAll('.page-card .cvpreview__skill-row.cvpreview__element-selected'),
    ).toHaveLength(1);
  });

  it('onSelectKey ignores keys bubbling from an inline editor (Space stays a space)', () => {
    fixture.componentRef.setInput('interactive', true);
    fixture.componentRef.setInput('sections', [
      { key: 'skills', order: 0, visible: true, groups: [{ label: 'L', values: ['TS'] }] },
    ]);
    fixture.componentRef.setInput('selection', {
      sectionKey: 'skills',
      part: 'body',
      elementPath: 'skills.0.values',
    });
    component.startEditing();
    fixture.detectChanges();
    const editor = (fixture.nativeElement as HTMLElement).querySelector(
      '.page-card .cvpreview__leaf-editor',
    ) as HTMLElement;
    const emitted: unknown[] = [];
    component.selectionChange.subscribe((v) => emitted.push(v));
    const evt = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
    Object.defineProperty(evt, 'target', { value: editor });
    const prevent = jest.spyOn(evt, 'preventDefault');
    component.onSelectKey(evt, 'skills', 'body', 'page', 'skills.0');
    expect(prevent).not.toHaveBeenCalled(); // space is NOT swallowed
    expect(emitted).toEqual([]); // no re-selection steals focus
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
      // template) - same string `leafDraft('summary', ...)` uses.
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
});
