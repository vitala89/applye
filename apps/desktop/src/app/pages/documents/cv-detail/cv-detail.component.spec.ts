import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { CV_STYLE_DEFAULT } from '@applye/core';
import { AiService, DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '@applye/application';
import { mergePersonalField } from '@applye/application';
import { CvDetailComponent } from './cv-detail.component';

describe('mergePersonalField', () => {
  it('ignores empty/whitespace, keeps current', () => {
    expect(mergePersonalField('', 'Vitalii')).toBe('Vitalii');
    expect(mergePersonalField('   ', 'Vitalii')).toBe('Vitalii');
    expect(mergePersonalField(undefined, 'Vitalii')).toBe('Vitalii');
    expect(mergePersonalField('New', 'Vitalii')).toBe('New');
  });
});

describe('CvDetailComponent personal-details top card visibility', () => {
  let component: CvDetailComponent;
  let fixture: ComponentFixture<CvDetailComponent>;
  let dbStub: Partial<DbService>;

  beforeEach(async () => {
    // A real document (not null) so the component's own async `load()` -
    // fired from the constructor - settles into the editor body render
    // instead of racing our test into the loading/error branch. Giving the
    // personal_details section a birthDate/maritalStatus also drives
    // `includeBirthdate`/`includeMaritalStatus` to true via `load()`, so the
    // ATS notes are populated without touching those signals directly.
    const docItem = {
      id: 1,
      docType: 'cv' as const,
      source: 'generated' as const,
      isDefault: false,
      regionTag: 'generic',
      styleJson: JSON.stringify({
        ...CV_STYLE_DEFAULT,
        sectionStyles: { summary: { lineHeight: 1.6 } },
      }),
      contentJson: JSON.stringify({
        sections: [
          {
            key: 'personal_details',
            order: 0,
            visible: true,
            fullName: 'Jane Doe',
            birthDate: '1990-01-01',
            maritalStatus: 'single',
          },
        ],
      }),
    };
    dbStub = {
      documentLibraryGet: jest.fn().mockResolvedValue(docItem),
      cvTemplatesList: jest.fn().mockResolvedValue([]),
      getProfile: jest.fn().mockResolvedValue(null),
      checkStyleSafety: jest.fn().mockResolvedValue([]),
      documentLibraryUpsert: jest.fn().mockResolvedValue(docItem),
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
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('Edit mode no longer renders the body/title style groups; page group + region/photo/include remain', () => {
    // Task 5: document-wide BODY TEXT and SECTION TITLES styling moved to the
    // live preview panel entirely - only the theme selector and the PAGE
    // group (size + margins) stay in the collapsible Style card.
    const root = fixture.nativeElement as HTMLElement;
    const groupHeaders = Array.from(root.querySelectorAll('.docedit-style-section__header')).map(
      (el) => el.textContent?.trim(),
    );
    expect(groupHeaders).toEqual([
      component['t']()('documents.cv_theme_label'),
      component['t']()('documents.cv_style_group_page'),
    ]);
    // The removed groups were the only places rendering a font/weight/colour
    // row - `.docedit-color-row` is a reliable fingerprint for them.
    expect(root.querySelectorAll('.docedit-color-row').length).toBe(0);
    // The "Custom" badge and Edit-mode "reset all" button are gone too - the
    // reset affordance relocated to the live-style panel (Preview mode).
    expect(root.querySelector('.cvdetail__custom-badge')).toBeNull();
    expect(root.querySelector('.docedit-reset')).toBeNull();
    // The page group (size + margins) is still there.
    expect(root.querySelector('.docedit-margin-grid')).toBeTruthy();
    // Region select + photo/birthdate/marital chips (outside the Style card)
    // are untouched.
    expect(root.querySelectorAll('.docedit-chip-row .docedit-chip').length).toBe(3);
  });

  it('keeps the birthdate/marital toggle chips and ATS notes visible when personal_details is collapsed', () => {
    // Regression test: before a refactor these lived in a fixed top card,
    // always visible regardless of section collapse state. A later change
    // moved them inside the collapsible personal_details section editor,
    // which hid them whenever that section was collapsed. They must render
    // outside the `docedit-collapse` machinery, in the parent's own top card.
    expect(component.isSectionOpen('personal_details')).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('.docedit-chip-row .docedit-chip').length).toBe(
      3,
    );
    expect(fixture.nativeElement.querySelector('.docedit-note')).not.toBeNull();

    component.toggleSectionCollapse('personal_details');
    fixture.detectChanges();

    expect(component.isSectionOpen('personal_details')).toBe(false);

    const chips: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.docedit-chip-row .docedit-chip'),
    );
    // includePhoto + includeBirthdate + includeMaritalStatus chips, still all present.
    expect(chips.length).toBe(3);
    for (const chip of chips) {
      expect(chip.closest('.docedit-collapse--closed')).toBeNull();
    }

    const atsNote = fixture.nativeElement.querySelector('.docedit-note');
    expect(atsNote).not.toBeNull();
    expect(atsNote.closest('.docedit-collapse--closed')).toBeNull();
  });

  it('clicking the birthdate chip in the DOM flips includeBirthdate on the parent directly', () => {
    expect(component.includeBirthdate()).toBe(true);

    const birthdateChip: HTMLButtonElement = fixture.nativeElement.querySelectorAll(
      '.docedit-chip-row .docedit-chip',
    )[1];
    birthdateChip.click();
    fixture.detectChanges();

    expect(component.includeBirthdate()).toBe(false);
  });

  it('clicking the marital-status chip in the DOM flips includeMaritalStatus on the parent directly', () => {
    expect(component.includeMaritalStatus()).toBe(true);

    const maritalChip: HTMLButtonElement = fixture.nativeElement.querySelectorAll(
      '.docedit-chip-row .docedit-chip',
    )[2];
    maritalChip.click();
    fixture.detectChanges();

    expect(component.includeMaritalStatus()).toBe(false);
  });

  it('hides the ATS note card once both toggles are switched off', () => {
    component.includeBirthdate.set(false);
    component.includeMaritalStatus.set(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.docedit-note')).toBeNull();
  });

  it('loads and saves a per-section line-height override through styleJson', async () => {
    expect(component.style().sectionStyles?.summary?.lineHeight).toBe(1.6);

    await component.save();

    const upsert = dbStub.documentLibraryUpsert as jest.Mock;
    const savedStyle = JSON.parse(upsert.mock.calls[0][0].styleJson);
    expect(savedStyle.sectionStyles.summary.lineHeight).toBe(1.6);
  });
});

describe('CvDetailComponent style save/load round trip (element + section + document overrides)', () => {
  // Task 5: with the document-wide BODY TEXT / SECTION TITLES groups removed
  // from Edit mode, every remaining write path (live-panel element/section/
  // document-body/title edits, plus resetAllStyles) still has to survive a
  // save → reload cycle through `styleJson`. This proves the full override
  // tree - elementStyles, sectionStyles, titleStyle, and the document body
  // root fields - all round-trip untouched.
  let component: CvDetailComponent;
  let fixture: ComponentFixture<CvDetailComponent>;
  let dbStub: Partial<DbService>;

  const richStyle = {
    ...CV_STYLE_DEFAULT,
    fontFamily: 'Georgia',
    bodyColorHex: '#204060',
    elementStyles: { summary: { fontFamily: 'Arial', colorHex: '#112233' } },
    sectionStyles: { skills: { fontWeight: 700 } },
    titleStyle: { fontFamily: 'Verdana' },
    titleBorder: 'dashed',
  };

  beforeEach(async () => {
    const docItem = {
      id: 7,
      docType: 'cv' as const,
      source: 'generated' as const,
      isDefault: false,
      regionTag: 'generic',
      styleJson: JSON.stringify(richStyle),
      contentJson: JSON.stringify({
        sections: [{ key: 'personal_details', order: 0, visible: true, fullName: 'Jane Doe' }],
      }),
    };
    dbStub = {
      documentLibraryGet: jest.fn().mockResolvedValue(docItem),
      cvTemplatesList: jest.fn().mockResolvedValue([]),
      getProfile: jest.fn().mockResolvedValue(null),
      checkStyleSafety: jest.fn().mockResolvedValue([]),
      documentLibraryUpsert: jest.fn().mockResolvedValue(docItem),
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
            snapshot: { paramMap: { get: () => '7' }, queryParamMap: { get: () => null } },
          },
        },
        { provide: Router, useValue: { navigate: jest.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CvDetailComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('restores elementStyles, sectionStyles, titleStyle, and document-body overrides on load', () => {
    expect(component.style().elementStyles?.['summary']).toEqual({
      fontFamily: 'Arial',
      colorHex: '#112233',
    });
    expect(component.style().sectionStyles?.skills).toEqual({ fontWeight: 700 });
    expect(component.style().titleStyle).toEqual({ fontFamily: 'Verdana' });
    expect(component.style().titleBorder).toBe('dashed');
    expect(component.style().fontFamily).toBe('Georgia');
    expect(component.style().bodyColorHex).toBe('#204060');
  });

  it('saves the full override tree back through styleJson unchanged', async () => {
    await component.save();

    const upsert = dbStub.documentLibraryUpsert as jest.Mock;
    const saved = JSON.parse(upsert.mock.calls[0][0].styleJson);
    expect(saved.elementStyles).toEqual({ summary: { fontFamily: 'Arial', colorHex: '#112233' } });
    expect(saved.sectionStyles).toEqual({ skills: { fontWeight: 700 } });
    expect(saved.titleStyle).toEqual({ fontFamily: 'Verdana' });
    expect(saved.titleBorder).toBe('dashed');
    expect(saved.fontFamily).toBe('Georgia');
    expect(saved.bodyColorHex).toBe('#204060');
  });

  it('a bodyColorHex override alone makes hasAnyCustomStyle true (compared against the theme baseline, which has none)', () => {
    // themeBaseStyle never sets bodyColorHex (CV_STYLE_DEFAULT omits it and
    // themeStyleSeed can't set it), so any bodyColorHex on the live style is
    // by definition a custom override.
    expect(component.hasAnyCustomStyle()).toBe(true);
    component.resetAllStyles();
    expect(component.style().bodyColorHex).toBeUndefined();
    expect(component.hasAnyCustomStyle()).toBe(false);

    component.updateStyle({ bodyColorHex: '#204060' });
    expect(component.hasAnyCustomStyle()).toBe(true);
  });

  it('resetAllStyles (relocated to the live panel) clears every override before a subsequent save', async () => {
    expect(component.hasAnyCustomStyle()).toBe(true);

    component.resetAllStyles();
    expect(component.hasAnyCustomStyle()).toBe(false);
    expect(component.style().elementStyles).toBeUndefined();
    expect(component.style().sectionStyles).toBeUndefined();
    expect(component.style().titleStyle).toBeUndefined();
    expect(component.style().titleBorder).toBeUndefined();
    expect(component.style().bodyColorHex).toBeUndefined();

    await component.save();
    const upsert = dbStub.documentLibraryUpsert as jest.Mock;
    const saved = JSON.parse(upsert.mock.calls[0][0].styleJson);
    expect(saved.elementStyles).toBeUndefined();
    expect(saved.sectionStyles).toBeUndefined();
    expect(saved.titleStyle).toBeUndefined();
    expect(saved.titleBorder).toBeUndefined();
    expect(saved.bodyColorHex).toBeUndefined();
  });
});

describe('CvDetailComponent export/print hardening', () => {
  let component: CvDetailComponent;
  let fixture: ComponentFixture<CvDetailComponent>;
  let printSpy: jest.SpyInstance;

  beforeEach(async () => {
    const docItem = {
      id: 1,
      docType: 'cv' as const,
      source: 'generated' as const,
      isDefault: false,
      regionTag: 'generic',
      styleJson: JSON.stringify(CV_STYLE_DEFAULT),
      contentJson: JSON.stringify({
        sections: [
          { key: 'personal_details', order: 0, visible: true, fullName: 'Jane Doe' },
          { key: 'summary', order: 1, visible: true, text: 'Committed summary' },
        ],
      }),
    };
    const dbStub: Partial<DbService> = {
      documentLibraryGet: jest.fn().mockResolvedValue(docItem),
      cvTemplatesList: jest.fn().mockResolvedValue([]),
      getProfile: jest.fn().mockResolvedValue(null),
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
            snapshot: { paramMap: { get: () => '1' }, queryParamMap: { get: () => null } },
          },
        },
        { provide: Router, useValue: { navigate: jest.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CvDetailComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
    printSpy = jest.spyOn(window, 'print').mockImplementation(() => undefined);
  });

  afterEach(() => {
    printSpy.mockRestore();
    document.body.classList.remove('printing-cv');
  });

  /** Enter preview mode, select the summary body so its textarea mounts, focus
   * it, and type an uncommitted draft. Returns the live editor element. */
  function startInlineDraft(text: string): HTMLTextAreaElement {
    component.previewMode.set(true);
    component.liveSelection.set({ sectionKey: 'summary', part: 'body', elementPath: 'summary' });
    fixture.detectChanges();
    // Selection alone no longer mounts editors - enter text-edit mode via the
    // panel's "Edit text" control (routed to CvPreviewComponent.startEditing).
    (fixture.nativeElement.querySelector('.cvlive__edit-text') as HTMLButtonElement).click();
    fixture.detectChanges();
    const editor = (fixture.nativeElement as HTMLElement).querySelector(
      '.page-card textarea.cvpreview__summary',
    ) as HTMLTextAreaElement;
    editor.focus();
    editor.value = text;
    editor.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    return editor;
  }

  it('Export action commits the active draft, drops all editor chrome, then prints', async () => {
    startInlineDraft('Draft summary via export');

    await component.exportPdfWysiwyg();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    // No native control, caret, selection outline, or panel-selection remains.
    expect(component.liveSelection()).toBeNull();
    expect(root.querySelector('.cvpreview__leaf-editor')).toBeNull();
    expect(root.querySelector('.cvpreview__selected')).toBeNull();
    // The Export action COMMITS the draft, so the printed page carries it.
    const resting = root.querySelector('.page-card p.cvpreview__summary');
    expect(resting?.textContent).toContain('Draft summary via export');
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('Direct OS/browser print (beforeprint) shows last-committed text and discards the uncommitted draft', () => {
    startInlineDraft('Half-typed, never committed');

    // A raw Cmd/Ctrl+P fires `beforeprint`; the handler must strip the editor
    // and reveal committed text WITHOUT persisting the half-typed draft.
    window.dispatchEvent(new Event('beforeprint'));
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(component.liveSelection()).toBeNull();
    expect(root.querySelector('.cvpreview__leaf-editor')).toBeNull();
    expect(root.querySelector('.cvpreview__selected')).toBeNull();
    const resting = root.querySelector('.page-card p.cvpreview__summary');
    expect(resting?.textContent).toContain('Committed summary');
    expect(resting?.textContent).not.toContain('Half-typed');
    // The section signal was never mutated by the direct-print path.
    expect(component.sections().find((s) => s.key === 'summary')).toMatchObject({
      text: 'Committed summary',
    });
  });
});

describe('CvDetailComponent back navigation', () => {
  async function setup(params: Record<string, string | null>) {
    const dbStub: Partial<DbService> = {
      documentLibraryGet: jest.fn().mockResolvedValue(null),
      cvTemplatesList: jest.fn().mockResolvedValue([]),
      getProfile: jest.fn().mockResolvedValue(null),
      checkStyleSafety: jest.fn().mockResolvedValue([]),
    };
    const navigate = jest.fn();

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
              queryParamMap: { get: (key: string) => params[key] ?? null },
            },
          },
        },
        { provide: Router, useValue: { navigate } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(CvDetailComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, navigate };
  }

  it('returns to the job it was opened from (returnTo=myJobs)', async () => {
    const { component, navigate } = await setup({
      returnTo: 'myJobs',
      jobId: '42',
      jobLabel: 'Acme Corp',
    });
    component.back();
    expect(navigate).toHaveBeenCalledWith(['/jobs', '42']);
  });

  it('back label names the job it returns to', async () => {
    const { component } = await setup({ returnTo: 'myJobs', jobId: '42', jobLabel: 'Acme Corp' });
    expect(component.backLabel()).toContain('Acme Corp');
  });

  it('falls back to the Documents list with no returnTo context', async () => {
    const { component, navigate } = await setup({});
    component.back();
    expect(navigate).toHaveBeenCalledWith(['/documents']);
  });
});
