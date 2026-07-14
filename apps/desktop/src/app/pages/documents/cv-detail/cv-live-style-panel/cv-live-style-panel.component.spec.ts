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

  it('contextual scope buttons: body text is single, a title has two', () => {
    fixture.componentRef.setInput('selection', {
      sectionKey: 'summary',
      part: 'body',
      elementPath: 'summary',
    });
    fixture.detectChanges();
    // Body text = one contextual button (no section scope).
    const bodyBtns = fixture.nativeElement.querySelectorAll('.cvlive__seg .cvlive__seg-btn');
    expect(bodyBtns).toHaveLength(1);
    expect((bodyBtns[0] as HTMLElement).textContent?.trim()).toBe('Body text');

    fixture.componentRef.setInput('selection', { sectionKey: 'summary', part: 'title' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.cvlive__seg .cvlive__seg-btn')).toHaveLength(2);
  });

  it('the scope selector is a keyboard-operable control group with an accessible name (Task 6 a11y hardening)', () => {
    fixture.componentRef.setInput('selection', {
      sectionKey: 'summary',
      part: 'body',
      elementPath: 'summary',
    });
    fixture.detectChanges();
    const group: HTMLElement = fixture.nativeElement.querySelector('.cvlive__seg');
    expect(group).toBeTruthy();
    // The segmented control is a labelled group of native <button>s — each is
    // keyboard-reachable/operable by default (Tab focuses, Enter/Space clicks).
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Apply to');
    const buttons = group.querySelectorAll<HTMLButtonElement>('.cvlive__seg-btn');
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((b) => expect(b.tabIndex).not.toBe(-1));
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

  it('document-scope body colour reads and writes bodyColorHex, not accentColorHex', () => {
    // Regression: the "Whole document" body colour control used to read/write
    // accentColorHex (the title/rule colour), so it never showed or changed
    // the actual body colour.
    fixture.componentRef.setInput('style', {
      ...CV_STYLE_DEFAULT,
      accentColorHex: '#1B7464',
      bodyColorHex: '#204060',
    });
    fixture.componentRef.setInput('selection', {
      sectionKey: 'summary',
      part: 'body',
      elementPath: 'summary',
    });
    fixture.detectChanges();
    component.setScope('document');
    fixture.detectChanges();

    expect(component.activeBodyOverride().colorHex).toBe('#204060');

    const events = collect();
    component.setBodyColor('#0a5');
    expect(events).toEqual([{ scope: 'document', patch: { colorHex: '#0a5' } }]);
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

  it('title rule width/colour emit scope-tagged changes; empty/zero mean inherit (null)', () => {
    fixture.componentRef.setInput('selection', { sectionKey: 'summary', part: 'title' });
    fixture.detectChanges();
    const events = collect();

    component.setTitleRuleWidth(2.5);
    component.setTitleRuleColor('#0a5');
    component.setTitleRuleWidth(null);
    component.setTitleRuleColor('');

    expect(events).toEqual([
      { scope: 'section', titleRuleWidth: 2.5 },
      { scope: 'section', titleRuleColor: '#0a5' },
      { scope: 'section', titleRuleWidth: null },
      { scope: 'section', titleRuleColor: null },
    ]);
  });

  it('the colour control shows the inherited/rendered colour (not the accent) when unset', () => {
    fixture.componentRef.setInput('style', { ...CV_STYLE_DEFAULT, accentColorHex: '#00ff00' });
    fixture.componentRef.setInput('selection', {
      sectionKey: 'personal_details',
      part: 'body',
      elementPath: 'pd.fullName',
    });
    // No element override; the paper reports the name rendered as blue.
    fixture.componentRef.setInput('sampleBaseStyle', { color: 'rgb(0, 0, 255)' });
    fixture.detectChanges();
    expect(component.effectiveColorHex()).toBe('#0000ff');

    // Falls back to the accent only when the paper hasn't reported a colour.
    fixture.componentRef.setInput('sampleBaseStyle', {});
    fixture.detectChanges();
    expect(component.effectiveColorHex()).toBe('#00ff00');
  });

  it('an experience entry: "This experience" + "All experiences", defaults element, no edit-text', () => {
    fixture.componentRef.setInput('selection', {
      sectionKey: 'experience',
      part: 'body',
      elementPath: 'exp.0',
    });
    fixture.detectChanges();
    expect(component.scope()).toBe('element'); // colour hits just this entry by default
    expect(component.canEditText()).toBe(false); // no single text leaf to edit
    expect(component.scopeButtons().map((b) => [b.scope, b.label])).toEqual([
      ['element', 'This experience'],
      ['section', 'All experiences'],
    ]);
  });

  it('a bullet: "This achievement" + "All achievements" (bullets scope)', () => {
    fixture.componentRef.setInput('selection', {
      sectionKey: 'experience',
      part: 'body',
      elementPath: 'exp.0.bullet.1',
    });
    fixture.detectChanges();
    expect(component.scope()).toBe('element');
    expect(component.canEditText()).toBe(true); // a bullet IS an editable text leaf
    expect(component.scopeButtons().map((b) => [b.scope, b.label])).toEqual([
      ['element', 'This achievement'],
      ['bullets', 'All achievements'],
    ]);
  });

  it('a skills group: "This skills" + "All skills"', () => {
    fixture.componentRef.setInput('selection', {
      sectionKey: 'skills',
      part: 'body',
      elementPath: 'skills.0',
    });
    fixture.detectChanges();
    expect(component.scope()).toBe('element');
    expect(component.scopeButtons().map((b) => b.label)).toEqual(['This skills', 'All skills']);
  });

  it('the languages line is a single element: one button, no edit-text', () => {
    fixture.componentRef.setInput('selection', {
      sectionKey: 'languages',
      part: 'body',
      elementPath: 'lang',
    });
    fixture.detectChanges();
    expect(component.scope()).toBe('element');
    expect(component.canEditText()).toBe(false);
    expect(component.scopeButtons().map((b) => b.label)).toEqual(['Languages']);
  });

  it('the personal-details block is a single "Personal details" button', () => {
    fixture.componentRef.setInput('selection', { sectionKey: 'personal_details', part: 'body' });
    fixture.detectChanges();
    expect(component.scopeButtons().map((b) => [b.scope, b.label])).toEqual([
      ['section', 'Personal Details'],
    ]);
  });

  it('separator controls: shown only for languages, emit section-level colour/size', () => {
    fixture.componentRef.setInput('selection', {
      sectionKey: 'languages',
      part: 'body',
      elementPath: 'lang',
    });
    fixture.detectChanges();
    expect(component.canSeparator()).toBe(true);
    const events = collect();
    component.setSeparatorColor('#0a5');
    component.setSeparatorSize(14);
    component.setSeparatorSize(null);
    expect(events).toEqual([
      { scope: 'element', separatorColor: '#0a5' },
      { scope: 'element', separatorSize: 14 },
      { scope: 'element', separatorSize: null },
    ]);

    // Not offered for other sections.
    fixture.componentRef.setInput('selection', {
      sectionKey: 'skills',
      part: 'body',
      elementPath: 'skills.0',
    });
    fixture.detectChanges();
    expect(component.canSeparator()).toBe(false);
  });

  it('body-rule controls: shown for personal-details/experience, emit section-level width/colour', () => {
    fixture.componentRef.setInput('selection', { sectionKey: 'personal_details', part: 'body' });
    fixture.detectChanges();
    expect(component.canBodyRule()).toBe(true);
    const events = collect();
    component.setBodyRuleWidth(2);
    component.setBodyRuleColor('#0a5');
    component.setBodyRuleWidth(null);
    expect(events).toEqual([
      { scope: 'section', bodyRuleWidth: 2 },
      { scope: 'section', bodyRuleColor: '#0a5' },
      { scope: 'section', bodyRuleWidth: null },
    ]);

    // Not offered for a section that draws no divider (e.g. summary).
    fixture.componentRef.setInput('selection', {
      sectionKey: 'summary',
      part: 'body',
      elementPath: 'summary',
    });
    fixture.detectChanges();
    expect(component.canBodyRule()).toBe(false);
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
