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

  // Switching "this title" / "all titles" must never leave a control showing a
  // value the title does not actually have: at "this title" a control with no
  // override of its own shows what it INHERITS from all-titles, because that is
  // what the reader sees on the page.
  describe('title controls reflect the value actually applied to the selection', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('selection', { sectionKey: 'experience', part: 'title' });
    });

    it('this title shows the all-titles line colour it inherits, not the accent', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        accentColorHex: '#00ff00',
        titleRuleColorHex: '#ff0000',
      });
      fixture.detectChanges();

      component.setScope('section');
      expect(component.activeTitleRuleColor()).toBe('#ff0000');
    });

    it('this title shows the all-titles line style and width it inherits', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        titleBorder: 'dashed',
        titleRuleWidthPt: 2,
      });
      fixture.detectChanges();

      component.setScope('section');
      expect(component.activeTitleBorder()).toBe('dashed');
      expect(component.activeTitleRuleWidth()).toBe(2);
    });

    it('this title shows the all-titles font/colour it inherits', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        titleStyle: { fontFamily: 'Georgia', fontSizePt: 15, fontWeight: 700, colorHex: '#ff00ff' },
      });
      fixture.detectChanges();

      component.setScope('section');
      expect(component.activeTitleOverride()).toEqual({
        fontFamily: 'Georgia',
        fontSizePt: 15,
        fontWeight: 700,
        colorHex: '#ff00ff',
      });
    });

    it("this title's OWN value still wins over the inherited one", () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        titleBorder: 'dashed',
        titleRuleColorHex: '#ff0000',
        titleStyle: { colorHex: '#ff00ff' },
        sectionStyles: {
          experience: {
            titleBorder: 'dotted',
            titleRuleColorHex: '#0000ff',
            title: { colorHex: '#00ffff' },
          },
        },
      });
      fixture.detectChanges();

      component.setScope('section');
      expect(component.activeTitleBorder()).toBe('dotted');
      expect(component.activeTitleRuleColor()).toBe('#0000ff');
      expect(component.activeTitleOverride().colorHex).toBe('#00ffff');
    });

    it('all titles never shows a sibling section override', () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        titleBorder: 'dashed',
        sectionStyles: { experience: { titleBorder: 'dotted', titleRuleColorHex: '#0000ff' } },
      });
      fixture.detectChanges();

      component.setScope('document');
      expect(component.activeTitleBorder()).toBe('dashed');
      expect(component.activeTitleRuleColor()).toBeNull();
    });

    it('an unset control still reads as Inherit at both scopes', () => {
      fixture.componentRef.setInput('style', { ...CV_STYLE_DEFAULT });
      fixture.detectChanges();

      component.setScope('section');
      expect(component.activeTitleBorder()).toBe('');
      expect(component.activeTitleRuleWidth()).toBeNull();
      component.setScope('document');
      expect(component.activeTitleBorder()).toBe('');
    });

    it("with no override, the line size/colour show the theme's own rule", () => {
      // The exact size the title renders at, rather than a blank Inherit the
      // user has to guess at.
      fixture.componentRef.setInput('style', { ...CV_STYLE_DEFAULT });
      fixture.componentRef.setInput('themeRule', { widthPt: 0.8, colorHex: '#1B7464' });
      fixture.detectChanges();

      component.setScope('section');
      expect(component.activeTitleRuleWidth()).toBe(0.8);
      expect(component.activeTitleRuleColor()).toBe('#1B7464');
      component.setScope('document');
      expect(component.activeTitleRuleWidth()).toBe(0.8);
      expect(component.activeTitleRuleColor()).toBe('#1B7464');
    });

    it("a user's own line size/colour wins over the theme rule", () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        titleRuleWidthPt: 3,
        titleRuleColorHex: '#ff0000',
      });
      fixture.componentRef.setInput('themeRule', { widthPt: 0.8, colorHex: '#1B7464' });
      fixture.detectChanges();

      component.setScope('section');
      expect(component.activeTitleRuleWidth()).toBe(3);
      expect(component.activeTitleRuleColor()).toBe('#ff0000');
    });

    it("the line swatch shows the rule's rendered colour when neither the user nor the theme set one", () => {
      // Classic draws no rule, so the line falls back to a neutral CSS token.
      // That value only exists in the DOM — reading it back is the only way the
      // swatch can avoid showing a colour the line does not have.
      fixture.componentRef.setInput('style', { ...CV_STYLE_DEFAULT, accentColorHex: '#333333' });
      fixture.componentRef.setInput('themeRule', null);
      fixture.componentRef.setInput('sampleBaseStyle', {
        'border-bottom-color': 'rgb(236, 236, 238)',
      });
      fixture.detectChanges();

      component.setScope('section');
      expect(component.titleRuleColorSwatch()).toBe('#ececee');
    });

    it("the line swatch prefers the user's own colour over the rendered one", () => {
      fixture.componentRef.setInput('style', { ...CV_STYLE_DEFAULT, titleRuleColorHex: '#ff0000' });
      fixture.componentRef.setInput('sampleBaseStyle', {
        'border-bottom-color': 'rgb(236, 236, 238)',
      });
      fixture.detectChanges();

      component.setScope('section');
      expect(component.titleRuleColorSwatch()).toBe('#ff0000');
    });

    it('a theme that draws no rule leaves the controls at Inherit', () => {
      fixture.componentRef.setInput('style', { ...CV_STYLE_DEFAULT });
      fixture.componentRef.setInput('themeRule', null);
      fixture.detectChanges();

      component.setScope('section');
      expect(component.activeTitleRuleWidth()).toBeNull();
      expect(component.activeTitleRuleColor()).toBeNull();
    });
  });

  // Same rule as the title controls, one layer down: a body control shows what
  // the element actually renders with, not a blank. Each scope walks the cascade
  // the RENDERER uses — which is not the same for a bullet as for a field.
  describe('body controls reflect the value actually applied to the selection', () => {
    const DOC = {
      ...CV_STYLE_DEFAULT,
      fontFamily: 'Calibri',
      fontSizePt: 11,
      fontWeight: 400 as const,
    };

    it('an element with no override of its own shows the section value it inherits', () => {
      fixture.componentRef.setInput('style', {
        ...DOC,
        bodyColorHex: '#111111',
        sectionStyles: { experience: { fontSizePt: 13, colorHex: '#ff0000' } },
      });
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.role',
      });
      fixture.detectChanges();

      component.setScope('element');
      expect(component.activeBodyOverride()).toMatchObject({
        fontFamily: 'Calibri',
        fontSizePt: 13,
        colorHex: '#ff0000',
      });
    });

    it("an element's own override still wins over the inherited value", () => {
      fixture.componentRef.setInput('style', {
        ...DOC,
        sectionStyles: { experience: { fontSizePt: 13 } },
        elementStyles: { 'exp.0.role': { fontSizePt: 20 } },
      });
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.role',
      });
      fixture.detectChanges();

      component.setScope('element');
      expect(component.activeBodyOverride().fontSizePt).toBe(20);
    });

    it('a BULLET inherits the shared bullet style, never the section (the renderer skips it)', () => {
      fixture.componentRef.setInput('style', {
        ...DOC,
        // The section value styles the entry heads only — a bullet must not
        // report a size it does not render at.
        sectionStyles: {
          experience: { fontSizePt: 13, bulletStyle: { fontSizePt: 9, colorHex: '#00ff00' } },
        },
      });
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.bullet.1',
      });
      fixture.detectChanges();

      component.setScope('element');
      expect(component.activeBodyOverride()).toMatchObject({
        fontSizePt: 9,
        colorHex: '#00ff00',
      });
    });

    it('a bullet with no shared style falls back to the document, not the section', () => {
      fixture.componentRef.setInput('style', {
        ...DOC,
        sectionStyles: { experience: { fontSizePt: 13 } },
      });
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.bullet.0',
      });
      fixture.detectChanges();

      component.setScope('element');
      expect(component.activeBodyOverride().fontSizePt).toBe(11);
    });

    it('the section scope shows the document value it inherits', () => {
      fixture.componentRef.setInput('style', { ...DOC, bodyColorHex: '#111111' });
      fixture.componentRef.setInput('selection', { sectionKey: 'experience', part: 'body' });
      fixture.detectChanges();

      component.setScope('section');
      expect(component.activeBodyOverride()).toMatchObject({
        fontFamily: 'Calibri',
        fontSizePt: 11,
        colorHex: '#111111',
      });
    });

    it('no body scope ever reports the accent as a colour (no-accent-leak)', () => {
      // `bodyColorHex` unset = no forced body colour anywhere in the cascade.
      fixture.componentRef.setInput('style', {
        ...DOC,
        accentColorHex: '#00ff00',
        sectionStyles: { experience: { bulletStyle: { fontSizePt: 9 } } },
      });
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.bullet.0',
      });
      fixture.detectChanges();

      for (const scope of ['element', 'bullets', 'section', 'document'] as const) {
        component.setScope(scope);
        expect(component.activeBodyOverride().colorHex).toBeUndefined();
      }
    });

    it('the bullets scope shows the shared bullet style over the document', () => {
      fixture.componentRef.setInput('style', {
        ...DOC,
        sectionStyles: { experience: { fontSizePt: 13, bulletStyle: { fontWeight: 700 } } },
      });
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: 'exp.0.bullet.0',
      });
      fixture.detectChanges();

      component.setScope('bullets');
      expect(component.activeBodyOverride()).toMatchObject({
        fontWeight: 700,
        fontSizePt: 11,
      });
    });
  });

  // "This experience" must style THIS entry's line; the section divider is what
  // "All experiences" means. Before the entry had a rule of its own, the panel
  // showed it the section's — so a line edit under "This experience" silently
  // restyled every entry.
  describe('an experience entry has a line of its own', () => {
    const SECTION_RULE = {
      ...CV_STYLE_DEFAULT,
      sectionStyles: {
        experience: {
          bodyBorder: 'solid' as const,
          bodyRuleWidthPt: 1.5,
          bodyRuleColorHex: '#ff0000',
        },
      },
    };

    function selectEntry(path = 'exp.0'): void {
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: path,
      });
      fixture.detectChanges();
    }

    it('offers the entry its own line, not the section divider, at element scope', () => {
      fixture.componentRef.setInput('style', SECTION_RULE);
      selectEntry();

      component.setScope('element');
      expect(component.canElementLine()).toBe(true);
      expect(component.canBodyRule()).toBe(false);
    });

    it('the section divider is what "All experiences" edits', () => {
      fixture.componentRef.setInput('style', SECTION_RULE);
      selectEntry();

      component.setScope('section');
      expect(component.canBodyRule()).toBe(true);
    });

    it("the entry's line controls show the section rule they inherit", () => {
      fixture.componentRef.setInput('style', SECTION_RULE);
      selectEntry();

      component.setScope('element');
      expect(component.activeElementBorder()).toBe('solid');
      expect(component.activeElementRuleWidth()).toBe(1.5);
      expect(component.activeElementRuleColor()).toBe('#ff0000');
    });

    it("the entry's own line wins over the inherited one", () => {
      fixture.componentRef.setInput('style', {
        ...SECTION_RULE,
        elementStyles: { 'exp.0': { borderStyle: 'dashed', ruleWidthPt: 3 } },
      });
      selectEntry();

      component.setScope('element');
      expect(component.activeElementBorder()).toBe('dashed');
      expect(component.activeElementRuleWidth()).toBe(3);
    });

    it('"none" on an entry stores an explicit off, so it cannot fall back to the section rule', () => {
      fixture.componentRef.setInput('style', SECTION_RULE);
      selectEntry();
      component.setScope('element');
      const events = collect();

      component.setElementBorder('none');

      expect(events).toEqual([{ scope: 'element', patch: { borderStyle: 'none' } }]);
    });

    it('Inherit on an entry clears its override so the section rule returns', () => {
      fixture.componentRef.setInput('style', {
        ...SECTION_RULE,
        elementStyles: { 'exp.0': { borderStyle: 'dashed' } },
      });
      selectEntry();
      component.setScope('element');
      const events = collect();

      component.setElementBorder('');

      expect(events).toEqual([
        {
          scope: 'element',
          patch: { borderStyle: undefined, ruleWidthPt: undefined, ruleColorHex: undefined },
        },
      ]);
    });

    it('a plain leaf keeps the old off-clears-everything behaviour', () => {
      fixture.componentRef.setInput('style', { ...CV_STYLE_DEFAULT });
      selectEntry('exp.0.role');
      component.setScope('element');
      const events = collect();

      component.setElementBorder('none');

      expect(events).toEqual([
        {
          scope: 'element',
          patch: { borderStyle: undefined, ruleWidthPt: undefined, ruleColorHex: undefined },
        },
      ]);
    });

    it('an education entry still gets no line control (its head draws no rule)', () => {
      fixture.componentRef.setInput('style', { ...CV_STYLE_DEFAULT });
      fixture.componentRef.setInput('selection', {
        sectionKey: 'education',
        part: 'body',
        elementPath: 'edu.0',
      });
      fixture.detectChanges();

      component.setScope('element');
      expect(component.canElementLine()).toBe(false);
      expect(component.canBodyRule()).toBe(false);
    });
  });

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

  it('an entry selection reaches a line control at its default scope — its OWN', () => {
    // Regression: gating the section rule to section scope AND excluding entry
    // containers from the per-leaf line left an entry with NO line control at
    // its default (element) scope — the line became unreachable. The entry now
    // has a rule of its own, so that is the control it reaches, and the edit
    // lands on this entry alone rather than on every entry in the section.
    fixture.componentRef.setInput('selection', {
      sectionKey: 'experience',
      part: 'body',
      elementPath: 'exp.0',
    });
    fixture.detectChanges();
    expect(component.scope()).toBe('element');
    expect(component.canElementLine()).toBe(true);
    expect(component.canBodyRule()).toBe(false);

    const events = collect();
    component.setElementBorder('dashed');
    expect(events).toEqual([{ scope: 'element', patch: { borderStyle: 'dashed' } }]);
  });

  it('a single field never shows the section rule — only its own per-leaf line', () => {
    fixture.componentRef.setInput('selection', {
      sectionKey: 'experience',
      part: 'body',
      elementPath: 'exp.0.role',
    });
    fixture.detectChanges();
    expect(component.canBodyRule()).toBe(false);
    expect(component.canElementLine()).toBe(true);
  });

  it('offers no line for an entry container whose head draws none', () => {
    // Education and skills heads draw no rule, so a line control there would do
    // nothing. Only the experience head draws one — and it is fed the entry's
    // own override by `entryCss`, never a border on the container itself (that
    // would land under the bullets).
    for (const p of ['edu.1', 'skills.0']) {
      fixture.componentRef.setInput('selection', {
        sectionKey: 'education',
        part: 'body',
        elementPath: p,
      });
      fixture.detectChanges();
      expect(component.canElementLine()).toBe(false);
    }
    // A real leaf inside the entry still gets one, as does an experience entry.
    for (const p of ['exp.0.role', 'exp.0']) {
      fixture.componentRef.setInput('selection', {
        sectionKey: 'experience',
        part: 'body',
        elementPath: p,
      });
      fixture.detectChanges();
      expect(component.canElementLine()).toBe(true);
    }
  });

  it('offers a per-leaf line control at element scope and clears the whole rule on none', () => {
    fixture.componentRef.setInput('selection', {
      sectionKey: 'personal_details',
      part: 'body',
      elementPath: 'pd.name',
    });
    fixture.detectChanges();
    expect(component.canElementLine()).toBe(true);
    // The section structural divider must NOT show for a single leaf — that
    // was the bug where editing a field rewrote personal_details.
    expect(component.canBodyRule()).toBe(false);

    const events = collect();
    component.setElementBorder('dashed');
    component.setElementRuleWidth('2');
    component.setElementRuleColor('#123456');
    component.setElementBorder('none');

    expect(events).toEqual([
      { scope: 'element', patch: { borderStyle: 'dashed' } },
      { scope: 'element', patch: { ruleWidthPt: 2 } },
      { scope: 'element', patch: { ruleColorHex: '#123456' } },
      {
        scope: 'element',
        patch: { borderStyle: undefined, ruleWidthPt: undefined, ruleColorHex: undefined },
      },
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
