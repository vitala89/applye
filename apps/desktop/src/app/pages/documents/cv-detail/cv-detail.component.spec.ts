import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { AiService, DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../../core/toast/toast.service';
import { CvDetailComponent, mergePersonalField } from './cv-detail.component';

describe('mergePersonalField', () => {
  it('ignores empty/whitespace, keeps current', () => {
    expect(mergePersonalField('', 'Vitalii')).toBe('Vitalii');
    expect(mergePersonalField('   ', 'Vitalii')).toBe('Vitalii');
    expect(mergePersonalField(undefined, 'Vitalii')).toBe('Vitalii');
    expect(mergePersonalField('New', 'Vitalii')).toBe('New');
  });
});

describe('CvDetailComponent per-section style', () => {
  let component: CvDetailComponent;
  let fixture: ComponentFixture<CvDetailComponent>;

  beforeEach(async () => {
    const dbStub: Partial<DbService> = {
      documentLibraryGet: jest.fn().mockResolvedValue(null),
      cvTemplatesList: jest.fn().mockResolvedValue([]),
      checkStyleSafety: jest.fn().mockResolvedValue([]),
    };

    await TestBed.configureTestingModule({
      imports: [CvDetailComponent],
      providers: [
        { provide: DbService, useValue: dbStub },
        { provide: AiService, useValue: {} },
        TranslateService,
        ToastService,
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: () => '1' },
              queryParamMap: { get: () => null },
            },
          },
        },
        { provide: Router, useValue: { navigate: jest.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CvDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('setSectionStyle writes an override and re-emits', () => {
    component.setSectionStyle('experience', { fontWeight: 700 });
    expect(component.style().sectionStyles?.experience?.fontWeight).toBe(700);
    expect(component.effStyle('experience').fontWeight).toBe(700);
  });

  it('resetSectionStyle clears the override back to inherit', () => {
    component.setSectionStyle('experience', { fontSizePt: 13, colorHex: '#0a5' });
    component.resetSectionStyle('experience');
    expect(component.style().sectionStyles?.experience).toBeUndefined();
    expect(component.effStyle('experience').colorHex).toBe(component.style().accentColorHex);
  });

  it('toggleSectionCollapse flips isSectionOpen and defaults to expanded', () => {
    expect(component.isSectionOpen('experience')).toBe(true);
    component.toggleSectionCollapse('experience');
    expect(component.isSectionOpen('experience')).toBe(false);
    component.toggleSectionCollapse('experience');
    expect(component.isSectionOpen('experience')).toBe(true);
    // Collapsing one section leaves others expanded.
    component.toggleSectionCollapse('summary');
    expect(component.isSectionOpen('summary')).toBe(false);
    expect(component.isSectionOpen('experience')).toBe(true);
  });

  it('toggleStyleOpen flips the Style card open state, default open', () => {
    expect(component.styleOpen()).toBe(true);
    component.toggleStyleOpen();
    expect(component.styleOpen()).toBe(false);
    component.toggleStyleOpen();
    expect(component.styleOpen()).toBe(true);
  });

  it('hasAnyCustomStyle detects document-wide changes, not only per-section', () => {
    expect(component.hasAnyCustomStyle()).toBe(false); // pristine default

    component.updateStyle({ fontFamily: 'Open Sans' });
    expect(component.hasAnyCustomStyle()).toBe(true); // document-wide font

    component.resetAllStyles();
    expect(component.hasAnyCustomStyle()).toBe(false);

    component.updateStyle({ fontSizePt: 22 });
    expect(component.hasAnyCustomStyle()).toBe(true); // document-wide size
    component.resetAllStyles();

    component.updateTitleStyle({ fontFamily: 'Georgia' });
    expect(component.hasAnyCustomStyle()).toBe(true); // title style
    component.resetAllStyles();

    component.updateStyle({ titleBorder: 'dotted' });
    expect(component.hasAnyCustomStyle()).toBe(true); // title line
    component.resetAllStyles();

    component.setSectionStyle('skills', { fontFamily: 'Arial' });
    expect(component.hasAnyCustomStyle()).toBe(true); // per-section still works
  });

  it('toggleStylePopover opens and closes the same key', () => {
    expect(component.openStyleKey()).toBeNull();
    component.toggleStylePopover('summary');
    expect(component.openStyleKey()).toBe('summary');
    component.toggleStylePopover('summary');
    expect(component.openStyleKey()).toBeNull();
  });

  it('removePhoto clears the stored dataUri', () => {
    component.photoDataUri.set('data:image/jpeg;base64,AAAA');
    component.removePhoto();
    expect(component.photoDataUri()).toBeNull();
  });

  it('toggleIncludePhoto adds a photo section when turning on if none exists', () => {
    component.sections.set([{ key: 'personal_details', order: 0, visible: true, fullName: 'X' }]);
    component.includePhoto.set(false);

    component.toggleIncludePhoto();

    expect(component.includePhoto()).toBe(true);
    const photo = component.sections().find((s) => s.key === 'photo');
    expect(photo).toBeDefined();
    expect(photo?.visible).toBe(true);
    expect(component.sections()[0].key).toBe('photo');
  });

  it('toggleIncludePhoto off keeps the photo section (bytes retained)', () => {
    component.sections.set([
      { key: 'photo', order: 0, visible: true, dataUri: 'data:image/jpeg;base64,AAAA' },
      { key: 'personal_details', order: 1, visible: true, fullName: 'X' },
    ]);
    component.includePhoto.set(true);

    component.toggleIncludePhoto();

    expect(component.includePhoto()).toBe(false);
    expect(component.sections().some((s) => s.key === 'photo')).toBe(true);
  });

  it('exposes A4 sheet dimensions via geometry', () => {
    component.style.set({
      ...component.style(),
      page: { size: 'a4', margin: { top: 20, right: 20, bottom: 20, left: 20 } },
    });
    const g = component.geometry();
    expect(g.pageWidthPx).toBeCloseTo((210 * 96) / 25.4);
    expect(g.marginTopPx).toBeCloseTo((20 * 96) / 25.4);
  });

  it('produces different width for Letter', () => {
    component.style.set({
      ...component.style(),
      page: { size: 'letter', margin: { top: 20, right: 20, bottom: 20, left: 20 } },
    });
    expect(component.geometry().pageWidthPx).toBeCloseTo((215.9 * 96) / 25.4);
  });

  it('renders the paginated sheet in preview mode', () => {
    component.doc.set({ id: 1, docType: 'cv', source: 'manual', isDefault: false });
    component.loadError.set(false);
    component.previewMode.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('lib-paginated-sheet')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.cvpreview__pagebar')).toBeNull();
  });

  it('splits an experience entry into a head atom + one atom per bullet, head glued', () => {
    component.doc.set({ id: 1, docType: 'cv', source: 'manual', isDefault: false });
    component.loadError.set(false);
    component.previewMode.set(true);
    component.sections.set([
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
    component.doc.set({ id: 1, docType: 'cv', source: 'manual', isDefault: false });
    component.loadError.set(false);
    component.previewMode.set(true);
    component.style.set({ ...component.style(), fontFamily: 'Georgia' });
    component.sections.set([
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
    component.doc.set({ id: 1, docType: 'cv', source: 'manual', isDefault: false });
    component.loadError.set(false);
    component.previewMode.set(true);
    component.style.set({
      ...component.style(),
      fontFamily: 'Calibri', // body
      titleStyle: { fontFamily: 'Georgia' }, // title
      titleBorder: 'none',
    });
    component.sections.set([
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
    component.doc.set({ id: 1, docType: 'cv', source: 'manual', isDefault: false });
    component.loadError.set(false);
    component.previewMode.set(true);
    component.sections.set([
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

  it('defaults photoPlacement to above_left and updates on chip select', () => {
    expect(component.photoPlacement()).toBe('above_left');
    component.setPhotoPlacement('above_right');
    expect(component.photoPlacement()).toBe('above_right');
  });

  it('maps placement to a header modifier class', () => {
    expect(component.headerPlacementClass('above_left')).toBe('cvpreview__header--left');
    expect(component.headerPlacementClass('above_center')).toBe('cvpreview__header--center');
    expect(component.headerPlacementClass('above_right')).toBe('cvpreview__header--right');
  });

  it('locks photo and personal_details from reordering', () => {
    expect(component.isSectionLocked('photo')).toBe(true);
    expect(component.isSectionLocked('personal_details')).toBe(true);
    expect(component.isSectionLocked('summary')).toBe(false);
  });

  it('drop pins photo and personal_details to the top regardless of target', () => {
    component.sections.set([
      { key: 'photo', order: 0, visible: true, dataUri: 'data:image/jpeg;base64,AAAA' },
      { key: 'personal_details', order: 1, visible: true, fullName: 'X' },
      { key: 'summary', order: 2, visible: true, text: 'S' },
    ]);
    // Attempt to drag `summary` (index 2) to the very top (index 0).
    component.drop({ previousIndex: 2, currentIndex: 0 } as never);
    const keys = component.sections().map((s) => s.key);
    expect(keys).toEqual(['photo', 'personal_details', 'summary']);
    expect(component.sections().map((s) => s.order)).toEqual([0, 1, 2]);
  });

  it('exportPdfWysiwyg keeps printing-cv until afterprint (native print is async)', () => {
    const printSpy = jest.spyOn(window, 'print').mockImplementation(() => undefined);
    document.body.classList.remove('printing-cv');

    void component.exportPdfWysiwyg();

    // Root-cause guard: the class must survive the print() call. Removing it
    // synchronously stripped the @media-print styles before the async macOS
    // print snapshot, so the OS captured the whole app instead of the sheet.
    expect(printSpy).toHaveBeenCalled();
    expect(document.body.classList.contains('printing-cv')).toBe(true);

    // afterprint is what clears it.
    window.dispatchEvent(new Event('afterprint'));
    expect(document.body.classList.contains('printing-cv')).toBe(false);

    printSpy.mockRestore();
  });

  it('titleCss and bodyCss resolve independent fonts; titleBorderCss maps the line', () => {
    component.style.set({
      ...component.style(),
      fontFamily: 'Calibri',
      titleStyle: { fontFamily: 'Georgia' },
      titleBorder: 'dotted',
    });
    expect(component.bodyCss('summary')['font-family']).toBe('Calibri');
    expect(component.titleCss('summary')['font-family']).toBe('Georgia');
    expect(component.titleBorderCss('summary')).toContain('dotted');

    component.style.set({ ...component.style(), titleBorder: 'none' });
    expect(component.titleBorderCss('summary')).toBe('none');
  });

  it('setSectionTitleStyle deep-merges into the section title override', () => {
    component.setSectionTitleStyle('skills', { fontFamily: 'Arial' });
    component.setSectionTitleStyle('skills', { fontSizePt: 15 });
    expect(component.style().sectionStyles?.skills?.title).toEqual({
      fontFamily: 'Arial',
      fontSizePt: 15,
    });
  });

  it('per-section title override renders over the document title style', () => {
    component.doc.set({ id: 1, docType: 'cv', source: 'manual', isDefault: false });
    component.loadError.set(false);
    component.previewMode.set(true);
    component.style.set({ ...component.style(), titleStyle: { fontFamily: 'Georgia' } });
    component.setSectionTitleStyle('skills', { fontFamily: 'Arial' });
    component.sections.set([
      { key: 'skills', order: 0, visible: true, groups: [{ label: 'L', values: ['TS'] }] },
    ]);
    fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('.cvpreview__section-title') as HTMLElement;
    expect(title.style.fontFamily).toContain('Arial');
  });

  it('Aurora theme exposes teal accent var and shows industry', async () => {
    component.doc.set({ id: 1, docType: 'cv', source: 'manual', isDefault: false });
    component.loadError.set(false);
    component.previewMode.set(true);
    component.sections.set([
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
    component.selectTheme(2);
    fixture.detectChanges();
    const viewport: HTMLElement = fixture.nativeElement.querySelector('.cvpreview-viewport');
    expect(viewport.style.getPropertyValue('--cv-accent')).toBe('#1B7464');
    expect(viewport.style.getPropertyValue('--cv-role-style')).toBe('italic');
    expect(fixture.nativeElement.textContent).toContain('SaaS');
  });
});
