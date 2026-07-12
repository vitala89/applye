import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { AiService, DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../../core/toast/toast.service';
import { effectiveSectionStyle } from '../cv-content.util';
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
    expect(effectiveSectionStyle(component.style(), 'experience').fontWeight).toBe(700);
  });

  it('resetSectionStyle clears the override back to inherit', () => {
    component.setSectionStyle('experience', { fontSizePt: 13, colorHex: '#0a5' });
    component.resetSectionStyle('experience');
    expect(component.style().sectionStyles?.experience).toBeUndefined();
    expect(effectiveSectionStyle(component.style(), 'experience').colorHex).toBe(
      component.style().accentColorHex,
    );
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

  it('is not "custom" on a pristine non-default theme, and resets to that theme', () => {
    // Switch to Aurora: the four base tokens are reseeded, so a pristine
    // Aurora doc is NOT custom — the badge shows the theme name, not "Custom".
    component.selectTheme(2);
    expect(component.hasAnyCustomStyle()).toBe(false);
    expect(component.activeTheme().name).toBe('Aurora');
    expect(component.style().accentColorHex).toBe('#1B7464');

    // Editing a token makes it custom.
    component.updateStyle({ accentColorHex: '#000000' });
    expect(component.hasAnyCustomStyle()).toBe(true);

    // Reset returns to the SELECTED theme (Aurora), not the Classic default.
    component.resetAllStyles();
    expect(component.hasAnyCustomStyle()).toBe(false);
    expect(component.style().accentColorHex).toBe('#1B7464');
    expect(component.style().fontFamily).toBe('Lato');
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

  it('defaults photoPlacement to above_left and updates on chip select', () => {
    expect(component.photoPlacement()).toBe('above_left');
    component.setPhotoPlacement('above_right');
    expect(component.photoPlacement()).toBe('above_right');
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

  it('replaceSection swaps the matching section by key, leaving others untouched', () => {
    component.sections.set([
      { key: 'photo', order: 0, visible: true, dataUri: 'data:image/jpeg;base64,AAAA' },
      { key: 'summary', order: 1, visible: true, text: 'Old summary' },
      { key: 'languages', order: 2, visible: true, items: [{ language: 'English', level: 'C1' }] },
    ]);

    component.replaceSection({ key: 'summary', order: 1, visible: true, text: 'New summary' });

    const summary = component.sections().find((s) => s.key === 'summary');
    expect(summary).toEqual({ key: 'summary', order: 1, visible: true, text: 'New summary' });
    // Other sections are unaffected.
    expect(component.sections().find((s) => s.key === 'photo')?.dataUri).toBe(
      'data:image/jpeg;base64,AAAA',
    );
    expect(component.sections().find((s) => s.key === 'languages')).toEqual({
      key: 'languages',
      order: 2,
      visible: true,
      items: [{ language: 'English', level: 'C1' }],
    });
  });

  it('setSectionTitleStyle deep-merges into the section title override', () => {
    component.setSectionTitleStyle('skills', { fontFamily: 'Arial' });
    component.setSectionTitleStyle('skills', { fontSizePt: 15 });
    expect(component.style().sectionStyles?.skills?.title).toEqual({
      fontFamily: 'Arial',
      fontSizePt: 15,
    });
  });
});

describe('CvDetailComponent personal-details top card visibility', () => {
  let component: CvDetailComponent;
  let fixture: ComponentFixture<CvDetailComponent>;

  beforeEach(async () => {
    // A real document (not null) so the component's own async `load()` —
    // fired from the constructor — settles into the editor body render
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
    const dbStub: Partial<DbService> = {
      documentLibraryGet: jest.fn().mockResolvedValue(docItem),
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
    await fixture.whenStable();
    fixture.detectChanges();
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
});
