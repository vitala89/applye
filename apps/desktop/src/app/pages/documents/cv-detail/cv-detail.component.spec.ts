import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { CV_STYLE_DEFAULT } from '@applye/core';
import { AiService, DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../../core/toast/toast.service';
import {
  effectiveSectionStyle,
  effectiveTitleBorder,
  effectiveTitleRuleColor,
  effectiveTitleRuleWidth,
  effectiveTitleStyle,
} from '../cv-content.util';
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

  it('applies a line-height patch as a cleaned override via the panel handler', () => {
    // The panel emits a semantic patch; the parent applies it through the
    // Task 1 reducer, which keeps the override minimal (no stray keys).
    component.setSectionStyle('summary', { lineHeight: 1.6 });
    expect(component.style().sectionStyles?.summary).toEqual({ lineHeight: 1.6 });
    expect(effectiveSectionStyle(component.style(), 'summary').lineHeight).toBe(1.6);
  });

  it('resetSectionStyle removes only the selected section, leaving siblings intact', () => {
    component.setSectionStyle('summary', { fontWeight: 700 });
    component.setSectionStyle('skills', { colorHex: '#123456' });

    component.resetSectionStyle('summary');

    expect(component.style().sectionStyles?.summary).toBeUndefined();
    expect(component.style().sectionStyles?.skills).toEqual({ colorHex: '#123456' });
  });

  describe('onStylePanelChange scope mapping', () => {
    it('body element scope writes elementStyles[path]', () => {
      component.liveSelection.set({ sectionKey: 'summary', part: 'body', elementPath: 'summary' });
      component.onStylePanelChange({ scope: 'element', patch: { fontWeight: 700 } });
      expect(component.style().elementStyles?.['summary']).toEqual({ fontWeight: 700 });
      expect(component.style().sectionStyles?.summary).toBeUndefined();
    });

    it('body section scope writes sectionStyles[key]', () => {
      component.liveSelection.set({ sectionKey: 'summary', part: 'body', elementPath: 'summary' });
      component.onStylePanelChange({ scope: 'section', patch: { fontSizePt: 13 } });
      expect(component.style().sectionStyles?.summary).toEqual({ fontSizePt: 13 });
      expect(component.style().elementStyles).toBeUndefined();
    });

    it('pathless body selection (section-body wrapper) at section scope lands on sectionStyles[key]', () => {
      // Regression: several section-body wrapper hosts (personal_details,
      // skills, experience/education, languages) select a body part with no
      // elementPath. The live-style panel now defaults such selections to
      // 'section' scope (not 'element', which would silently no-op below)
      // so the edit actually lands instead of being dropped.
      component.liveSelection.set({ sectionKey: 'skills', part: 'body' });
      component.onStylePanelChange({ scope: 'section', patch: { fontWeight: 700 } });
      expect(component.style().sectionStyles?.skills).toEqual({ fontWeight: 700 });
    });

    it('pathless body selection at element scope is a no-op (defense-in-depth path guard)', () => {
      component.liveSelection.set({ sectionKey: 'skills', part: 'body' });
      const before = component.style();
      component.onStylePanelChange({ scope: 'element', patch: { fontWeight: 700 } });
      expect(component.style()).toBe(before);
    });

    it('body document scope writes the CvStyle root body fields — colour to bodyColorHex, not accentColorHex', () => {
      const accentBefore = component.style().accentColorHex;
      component.liveSelection.set({ sectionKey: 'summary', part: 'body', elementPath: 'summary' });
      component.onStylePanelChange({
        scope: 'document',
        patch: { fontFamily: 'Arial', colorHex: '#101010' },
      });
      expect(component.style().fontFamily).toBe('Arial');
      expect(component.style().bodyColorHex).toBe('#101010');
      // The accent/title/rule colour must stay untouched by a body edit.
      expect(component.style().accentColorHex).toBe(accentBefore);
      expect(component.style().sectionStyles).toBeUndefined();
      expect(component.style().elementStyles).toBeUndefined();
    });

    it('title section scope writes sectionStyles[key].title', () => {
      component.liveSelection.set({ sectionKey: 'skills', part: 'title' });
      component.onStylePanelChange({ scope: 'section', patch: { fontFamily: 'Georgia' } });
      expect(component.style().sectionStyles?.skills?.title).toEqual({ fontFamily: 'Georgia' });
      expect(component.style().titleStyle).toBeUndefined();
    });

    it('title document scope writes the document-wide titleStyle', () => {
      component.liveSelection.set({ sectionKey: 'skills', part: 'title' });
      component.onStylePanelChange({ scope: 'document', patch: { fontFamily: 'Georgia' } });
      expect(component.style().titleStyle?.fontFamily).toBe('Georgia');
      expect(component.style().sectionStyles?.skills).toBeUndefined();
    });

    it('title border routes to the section (this title) or document (all titles)', () => {
      component.liveSelection.set({ sectionKey: 'skills', part: 'title' });
      component.onStylePanelChange({ scope: 'section', titleBorder: 'dotted' });
      expect(component.style().sectionStyles?.skills?.titleBorder).toBe('dotted');

      component.onStylePanelChange({ scope: 'document', titleBorder: 'dashed' });
      expect(component.style().titleBorder).toBe('dashed');
    });

    it('an all-titles line clears the per-section line so EVERY title adopts it', () => {
      // The user styles one title, then changes all titles: the section that was
      // individually styled must not silently keep its old line.
      component.liveSelection.set({ sectionKey: 'experience', part: 'title' });
      component.onStylePanelChange({ scope: 'section', titleBorder: 'dotted' });
      component.onStylePanelChange({ scope: 'document', titleBorder: 'dashed' });

      expect(component.style().sectionStyles?.experience?.titleBorder).toBeUndefined();
      expect(effectiveTitleBorder(component.style(), 'experience')).toBe('dashed');
      expect(effectiveTitleBorder(component.style(), 'education')).toBe('dashed');
    });

    it('this title still wins after an all-titles line, and siblings keep the all-titles line', () => {
      component.liveSelection.set({ sectionKey: 'experience', part: 'title' });
      component.onStylePanelChange({ scope: 'document', titleBorder: 'dashed' });
      component.onStylePanelChange({ scope: 'section', titleBorder: 'dotted' });

      expect(effectiveTitleBorder(component.style(), 'experience')).toBe('dotted');
      expect(effectiveTitleBorder(component.style(), 'education')).toBe('dashed');
    });

    it('an all-titles change clears only the property it writes', () => {
      component.liveSelection.set({ sectionKey: 'experience', part: 'title' });
      component.onStylePanelChange({ scope: 'section', patch: { colorHex: '#ff0000' } });
      component.onStylePanelChange({ scope: 'section', titleBorder: 'dotted' });

      component.onStylePanelChange({ scope: 'document', titleBorder: 'dashed' });

      // The line is now uniform, but the section's own colour is untouched — an
      // edit to one control never silently drops an unrelated override.
      expect(effectiveTitleBorder(component.style(), 'experience')).toBe('dashed');
      expect(component.style().sectionStyles?.experience?.title?.colorHex).toBe('#ff0000');
    });

    it('an all-titles rule width/colour clears the per-section ones', () => {
      component.liveSelection.set({ sectionKey: 'experience', part: 'title' });
      component.onStylePanelChange({ scope: 'section', titleRuleWidth: 3 });
      component.onStylePanelChange({ scope: 'section', titleRuleColor: '#ff0000' });

      component.onStylePanelChange({ scope: 'document', titleRuleWidth: 1 });
      component.onStylePanelChange({ scope: 'document', titleRuleColor: '#0000ff' });

      expect(effectiveTitleRuleWidth(component.style(), 'experience')).toBe(1);
      expect(effectiveTitleRuleColor(component.style(), 'experience')).toBe('#0000ff');
    });

    it('an all-titles font clears the per-section title font so every title adopts it', () => {
      component.liveSelection.set({ sectionKey: 'experience', part: 'title' });
      component.onStylePanelChange({ scope: 'section', patch: { fontFamily: 'Georgia' } });

      component.onStylePanelChange({ scope: 'document', patch: { fontFamily: 'Arial' } });

      expect(effectiveTitleStyle(component.style(), 'experience').fontFamily).toBe('Arial');
      expect(effectiveTitleStyle(component.style(), 'education').fontFamily).toBe('Arial');
    });

    it('an All-experiences line clears the per-entry lines so EVERY entry adopts it', () => {
      // The user styles one entry's line, then changes the section's: the entry
      // they had touched must not silently keep its own colour.
      component.liveSelection.set({
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0',
      });
      component.onStylePanelChange({ scope: 'element', patch: { ruleColorHex: '#0000ff' } });
      expect(component.style().elementStyles?.['exp.0']?.ruleColorHex).toBe('#0000ff');

      component.liveSelection.set({ sectionKey: 'experience', part: 'body' });
      component.onStylePanelChange({ scope: 'section', bodyRuleColor: '#000000' });

      expect(component.style().elementStyles?.['exp.0']?.ruleColorHex).toBeUndefined();
      expect(component.style().sectionStyles?.experience?.bodyRuleColorHex).toBe('#000000');
    });

    it('an All-experiences line change clears only the property it writes', () => {
      component.liveSelection.set({
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0',
      });
      component.onStylePanelChange({
        scope: 'element',
        patch: { borderStyle: 'dashed', ruleColorHex: '#0000ff' },
      });

      component.liveSelection.set({ sectionKey: 'experience', part: 'body' });
      component.onStylePanelChange({ scope: 'section', bodyRuleColor: '#000000' });

      // The entry's own dashes survive an edit to the colour.
      expect(component.style().elementStyles?.['exp.0']?.borderStyle).toBe('dashed');
      expect(component.style().elementStyles?.['exp.0']?.ruleColorHex).toBeUndefined();
    });

    it('an All-experiences line never touches another section or a field', () => {
      component.liveSelection.set({
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.role',
      });
      component.onStylePanelChange({ scope: 'element', patch: { ruleColorHex: '#0000ff' } });

      component.liveSelection.set({ sectionKey: 'experience', part: 'body' });
      component.onStylePanelChange({ scope: 'section', bodyRuleColor: '#000000' });

      // A FIELD's underline is its own line, not the entry rule — untouched.
      expect(component.style().elementStyles?.['exp.0.role']?.ruleColorHex).toBe('#0000ff');
    });

    it('applying a section change clears in-section element overrides so it applies uniformly', () => {
      component.liveSelection.set({ sectionKey: 'summary', part: 'body', elementPath: 'summary' });
      component.onStylePanelChange({ scope: 'element', patch: { fontWeight: 700 } });
      expect(component.style().elementStyles?.['summary']).toEqual({ fontWeight: 700 });
      component.onStylePanelChange({ scope: 'section', patch: { fontSizePt: 13 } });
      // The individual override is wiped; the section value now governs all.
      expect(component.style().elementStyles?.['summary']).toBeUndefined();
      expect(component.style().sectionStyles?.summary).toEqual({ fontSizePt: 13 });
    });

    it('body element reset removes only that element override', () => {
      component.liveSelection.set({ sectionKey: 'summary', part: 'body', elementPath: 'summary' });
      component.onStylePanelChange({ scope: 'element', patch: { fontWeight: 700 } });
      component.onStylePanelChange({ scope: 'element', reset: true });
      expect(component.style().elementStyles).toBeUndefined();
    });

    it('body document reset is a no-op (deferred to reset-all)', () => {
      component.liveSelection.set({ sectionKey: 'summary', part: 'body', elementPath: 'summary' });
      const before = component.style();
      component.onStylePanelChange({ scope: 'document', reset: true });
      expect(component.style()).toBe(before);
    });

    it('title this-title reset clears the section title but keeps body overrides', () => {
      component.liveSelection.set({ sectionKey: 'skills', part: 'title' });
      component.setSectionStyle('skills', { fontFamily: 'Arial' });
      component.onStylePanelChange({ scope: 'section', patch: { fontSizePt: 20 } });
      component.onStylePanelChange({ scope: 'section', reset: true });
      expect(component.style().sectionStyles?.skills?.title).toBeUndefined();
      expect(component.style().sectionStyles?.skills?.fontFamily).toBe('Arial');
    });

    it('title all-titles reset clears the document titleStyle', () => {
      component.liveSelection.set({ sectionKey: 'skills', part: 'title' });
      component.onStylePanelChange({ scope: 'document', patch: { fontFamily: 'Georgia' } });
      component.onStylePanelChange({ scope: 'document', reset: true });
      expect(component.style().titleStyle).toBeUndefined();
    });
  });

  it('records the live preview selection for the contextual panel', () => {
    expect(component.liveSelection()).toBeNull();
    component.liveSelection.set({ sectionKey: 'summary', part: 'title' });
    expect(component.liveSelection()).toEqual({ sectionKey: 'summary', part: 'title' });
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

  it('hasAnyCustomStyle is true when only an elementStyles override exists, and resetAllStyles clears it', () => {
    expect(component.hasAnyCustomStyle()).toBe(false); // pristine default

    component.style.set({
      ...component.style(),
      elementStyles: { summary: { fontFamily: 'Georgia' } },
    });
    expect(component.hasAnyCustomStyle()).toBe(true); // element-only override

    component.resetAllStyles();
    expect(component.hasAnyCustomStyle()).toBe(false);
    expect(component.style().elementStyles).toBeUndefined();
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

  it('resetAllStyles clears style overrides but leaves the custom page size/margins untouched', () => {
    // Custom page geometry: non-default size AND a non-default margin side.
    component.setPageSize('letter');
    component.setMarginSide('top', 5);
    const customPage = { size: 'letter', margin: { top: 5, right: 20, bottom: 20, left: 20 } };
    expect(component.style().page).toEqual(customPage);

    // Also dirty a style override so reset-all has something to clear.
    component.updateStyle({ fontFamily: 'Open Sans' });
    component.setSectionStyle('skills', { fontFamily: 'Arial' });
    expect(component.hasAnyCustomStyle()).toBe(true);

    component.resetAllStyles();

    // Style overrides are back to the theme baseline...
    expect(component.hasAnyCustomStyle()).toBe(false);
    // ...but the custom page settings survive the reset.
    expect(component.style().page).toEqual(customPage);
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

  it('exportPdfWysiwyg keeps printing-cv until afterprint (native print is async)', async () => {
    const printSpy = jest.spyOn(window, 'print').mockImplementation(() => undefined);
    document.body.classList.remove('printing-cv');

    // Export now commits/closes editors and awaits a stable render + pagination
    // pass before printing, so the print() call is asynchronous.
    await component.exportPdfWysiwyg();

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

  it('exportPdfWysiwyg injects an @page rule carrying the real per-side margins', async () => {
    const printSpy = jest.spyOn(window, 'print').mockImplementation(() => undefined);
    await component.exportPdfWysiwyg();
    const rule = document.getElementById('wysiwyg-page-rule')?.textContent ?? '';
    // Real four-side mm margins (the print stylesheet zeroes the card padding),
    // never `margin: 0` — the full-bleed value that scaled the margins and spilled
    // a blank trailing page.
    expect(rule).toMatch(/margin: \d+mm \d+mm \d+mm \d+mm/);
    expect(rule).not.toContain('margin: 0;');
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

  it('Edit ↔ Live-preview synchronization: an inline preview commit shows in the edit-mode form, and vice versa, with no save/reload', async () => {
    // Single source of truth: `sections` is the one signal both the preview's
    // inline editors and the sidebar edit-mode form read from and write to
    // via `replaceSection`. Committing on either surface must show up on the
    // other purely because they share that signal — no save call, no
    // re-fetch, no reload.
    // The outer `@else if (loadError() || !doc())` branch hides the whole
    // editor (preview included) until a document is loaded; `load()` in this
    // suite's stub resolves null (loadError), so drive the loaded state
    // directly — this test only needs the template to render, not the async
    // load flow itself.
    component.doc.set({ id: 1, docType: 'cv', source: 'generated', isDefault: false });
    component.loading.set(false);
    component.loadError.set(false);
    component.sections.set([{ key: 'summary', order: 0, visible: true, text: 'Old summary' }]);

    // 1) Preview mode: select the summary body so its native textarea mounts,
    // then type + blur to commit an inline edit through the real child tree
    // (CvPreviewComponent → sectionChange → replaceSection), not a mock.
    component.previewMode.set(true);
    component.liveSelection.set({ sectionKey: 'summary', part: 'body', elementPath: 'summary' });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    // Selection alone no longer mounts editors — enter text-edit mode via the
    // panel's "Edit text" control.
    (root.querySelector('.cvlive__edit-text') as HTMLButtonElement).click();
    fixture.detectChanges();
    const previewTextarea = root.querySelector(
      '.page-card textarea.cvpreview__summary',
    ) as HTMLTextAreaElement;
    expect(previewTextarea).toBeTruthy();
    previewTextarea.value = 'New summary from live preview';
    previewTextarea.dispatchEvent(new Event('input'));
    previewTextarea.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(component.sections().find((s) => s.key === 'summary')).toEqual({
      key: 'summary',
      order: 0,
      visible: true,
      text: 'New summary from live preview',
    });

    // 2) Switch to edit mode (no save/reload in between) — the sidebar form's
    // textarea must already reflect the value committed from the preview.
    // `NgModel` defers its initial `writeValue` to a resolved-promise
    // microtask (to avoid ExpressionChangedAfterItHasBeenCheckedError), so a
    // freshly-mounted `[ngModel]` control needs a stability flush before its
    // DOM value settles — `whenStable()` does that.
    component.previewMode.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const editTextarea = root.querySelector(
      'app-cv-summary-editor textarea',
    ) as HTMLTextAreaElement;
    expect(editTextarea.value).toBe('New summary from live preview');

    // 3) Edit via the sidebar form instead, then flip back to preview mode —
    // the live preview's resting render must reflect it immediately.
    editTextarea.value = 'Edited from the sidebar form';
    editTextarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(component.sections().find((s) => s.key === 'summary')?.text).toBe(
      'Edited from the sidebar form',
    );

    component.previewMode.set(true);
    component.liveSelection.set(null); // resting (non-editing) render
    fixture.detectChanges();
    expect(root.querySelector('.page-card .cvpreview__summary')?.textContent).toContain(
      'Edited from the sidebar form',
    );
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
  let dbStub: Partial<DbService>;

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
    // live preview panel entirely — only the theme selector and the PAGE
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
    // row — `.docedit-color-row` is a reliable fingerprint for them.
    expect(root.querySelectorAll('.docedit-color-row').length).toBe(0);
    // The "Custom" badge and Edit-mode "reset all" button are gone too — the
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
  // tree — elementStyles, sectionStyles, titleStyle, and the document body
  // root fields — all round-trip untouched.
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
    // Selection alone no longer mounts editors — enter text-edit mode via the
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
