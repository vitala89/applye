import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CV_STYLE_DEFAULT } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import type { CvStylePanelChange } from '../../cv-content.util';
import { CvLiveStylePanelComponent } from './cv-live-style-panel.component';

describe('CvLiveStylePanelComponent', () => {
  let component: CvLiveStylePanelComponent;
  let fixture: ComponentFixture<CvLiveStylePanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CvLiveStylePanelComponent],
      providers: [TranslateService],
    }).compileComponents();

    fixture = TestBed.createComponent(CvLiveStylePanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('style', CV_STYLE_DEFAULT);
    fixture.componentRef.setInput('selection', null);
  });

  function collect(): CvStylePanelChange[] {
    const events: CvStylePanelChange[] = [];
    component.panelChange.subscribe((e) => events.push(e));
    return events;
  }

  it('shows an empty state and no controls when nothing is selected', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cvlive__empty')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
  });

  it('offers three scopes for a body selection and two for a title', () => {
    fixture.componentRef.setInput('selection', {
      sectionKey: 'summary',
      part: 'body',
      elementPath: 'summary',
    });
    fixture.detectChanges();
    const bodyOptions = Array.from(
      fixture.nativeElement.querySelectorAll('.cvlive__scope-select option'),
    ).map((o) => (o as HTMLOptionElement).value);
    expect(bodyOptions).toEqual(['element', 'section', 'document']);

    fixture.componentRef.setInput('selection', { sectionKey: 'summary', part: 'title' });
    fixture.detectChanges();
    const titleOptions = Array.from(
      fixture.nativeElement.querySelectorAll('.cvlive__scope-select option'),
    ).map((o) => (o as HTMLOptionElement).value);
    expect(titleOptions).toEqual(['section', 'document']);
  });

  it('the scope selector is a native, keyboard-operable control with an accessible name (Task 6 a11y hardening)', () => {
    fixture.componentRef.setInput('selection', {
      sectionKey: 'summary',
      part: 'body',
      elementPath: 'summary',
    });
    fixture.detectChanges();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector(
      '.cvlive__scope-select select',
    );
    expect(select).toBeTruthy();
    // A native <select> is keyboard-reachable/operable by default (Tab moves
    // focus to it, arrow keys/Enter change its value) — confirm nothing has
    // opted it out of the tab order or hidden its accessible name.
    expect(select.tabIndex).not.toBe(-1);
    expect(select.getAttribute('aria-label')).toBe('Apply to');
    // The visible <label>-wrapped text still doubles as a second, redundant
    // accessible-name source — belt and suspenders, not a replacement.
    expect(select.closest('label')?.textContent).toContain('Apply to');
  });

  it('defaults to element scope for a body leaf and this-title (section) for a title', () => {
    fixture.componentRef.setInput('selection', {
      sectionKey: 'summary',
      part: 'body',
      elementPath: 'summary',
    });
    fixture.detectChanges();
    expect(component.scope()).toBe('element');

    fixture.componentRef.setInput('selection', { sectionKey: 'skills', part: 'title' });
    fixture.detectChanges();
    expect(component.scope()).toBe('section');
  });

  it('defaults a pathless body selection (section-body wrapper, no leaf) to section scope', () => {
    // Regression: several section-body wrapper hosts (personal_details, skills,
    // experience/education, languages) emit a body selection with no
    // `elementPath`. Defaulting those to `element` scope silently drops the
    // edit, because the parent's element-scope branch requires a path.
    fixture.componentRef.setInput('selection', {
      sectionKey: 'skills',
      part: 'body',
    });
    fixture.detectChanges();
    expect(component.scope()).toBe('section');
  });

  it('emits cleaned body patches tagged with the active (default element) scope', () => {
    fixture.componentRef.setInput('selection', {
      sectionKey: 'summary',
      part: 'body',
      elementPath: 'summary',
    });
    fixture.detectChanges();
    const events = collect();

    component.setBodyFont('Arial');
    component.setBodySize('12');
    component.setBodyWeight(700);
    component.setBodyColor('#123456');
    component.setLineHeight(1.6);

    expect(events).toEqual([
      { scope: 'element', patch: { fontFamily: 'Arial' } },
      { scope: 'element', patch: { fontSizePt: 12 } },
      { scope: 'element', patch: { fontWeight: 700 } },
      { scope: 'element', patch: { colorHex: '#123456' } },
      { scope: 'element', patch: { lineHeight: 1.6 } },
    ]);
  });

  it('inherit clears font (undefined) and line height (undefined)', () => {
    fixture.componentRef.setInput('selection', {
      sectionKey: 'summary',
      part: 'body',
      elementPath: 'summary',
    });
    fixture.detectChanges();
    const events = collect();

    component.setBodyFont('');
    component.setLineHeight(null);

    expect(events).toEqual([
      { scope: 'element', patch: { fontFamily: undefined } },
      { scope: 'element', patch: { lineHeight: undefined } },
    ]);
  });

  it('switching scope re-targets subsequent edits', () => {
    fixture.componentRef.setInput('selection', {
      sectionKey: 'summary',
      part: 'body',
      elementPath: 'summary',
    });
    fixture.detectChanges();
    const events = collect();

    component.setScope('section');
    component.setBodyWeight(700);
    component.setScope('document');
    component.setBodyFont('Arial');

    expect(events).toEqual([
      { scope: 'section', patch: { fontWeight: 700 } },
      { scope: 'document', patch: { fontFamily: 'Arial' } },
    ]);
  });

  it('offers a line-height control for the body scope only, not for titles', () => {
    fixture.componentRef.setInput('selection', {
      sectionKey: 'summary',
      part: 'body',
      elementPath: 'summary',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cvlive__line-height')).toBeTruthy();

    fixture.componentRef.setInput('selection', { sectionKey: 'summary', part: 'title' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cvlive__line-height')).toBeNull();
  });

  it('title scope emits title patches (this-title default) and the border via titleBorder', () => {
    fixture.componentRef.setInput('selection', { sectionKey: 'summary', part: 'title' });
    fixture.detectChanges();
    const events = collect();

    component.setTitleFont('Georgia');
    component.setTitleBorder('dotted');
    component.setScope('document');
    component.setTitleColor('#0a5');

    expect(events).toEqual([
      { scope: 'section', patch: { fontFamily: 'Georgia' } },
      { scope: 'section', titleBorder: 'dotted' },
      { scope: 'document', patch: { colorHex: '#0a5' } },
    ]);
  });

  it('title border inherit emits a null titleBorder', () => {
    fixture.componentRef.setInput('selection', { sectionKey: 'summary', part: 'title' });
    fixture.detectChanges();
    const events = collect();

    component.setTitleBorder('');

    expect(events).toEqual([{ scope: 'section', titleBorder: null }]);
  });

  it('reset emits a scope-tagged reset for the active scope', () => {
    fixture.componentRef.setInput('selection', {
      sectionKey: 'skills',
      part: 'body',
      elementPath: 'skills.0.values',
    });
    fixture.detectChanges();
    const events = collect();

    component.reset();
    component.setScope('section');
    component.reset();

    expect(events).toEqual([
      { scope: 'element', reset: true },
      { scope: 'section', reset: true },
    ]);
  });

  it('renders a reset-all-styling control, disabled when hasCustomStyle is false', () => {
    fixture.detectChanges();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.cvlive__footer button');
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);

    fixture.componentRef.setInput('hasCustomStyle', true);
    fixture.detectChanges();
    expect(btn.disabled).toBe(false);
  });

  it('reset-all-styling control is present with no active selection (empty state)', () => {
    // Unlike the per-scope reset, resetAll must be reachable even before the
    // user has clicked anything in the preview.
    fixture.componentRef.setInput('selection', null);
    fixture.componentRef.setInput('hasCustomStyle', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cvlive__empty')).toBeTruthy();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('.cvlive__footer button');
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(false);
  });

  it('clicking reset-all emits resetAll (not panelChange)', () => {
    fixture.componentRef.setInput('hasCustomStyle', true);
    fixture.detectChanges();
    const resetAllEvents: void[] = [];
    const panelChangeEvents: CvStylePanelChange[] = [];
    component.resetAll.subscribe(() => resetAllEvents.push(undefined));
    component.panelChange.subscribe((e) => panelChangeEvents.push(e));

    (fixture.nativeElement.querySelector('.cvlive__footer button') as HTMLButtonElement).click();

    expect(resetAllEvents.length).toBe(1);
    expect(panelChangeEvents.length).toBe(0);
  });

  it('hides the reset control for the body document scope (deferred to reset-all)', () => {
    fixture.componentRef.setInput('selection', {
      sectionKey: 'summary',
      part: 'body',
      elementPath: 'summary',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cvlive__reset')).toBeTruthy();

    component.setScope('document');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cvlive__reset')).toBeNull();
  });
});
