import { CV_STYLE_DEFAULT } from '@applye/core';
import { ComponentFixture } from '@angular/core/testing';

import { CvLiveStylePanelComponent } from './cv-live-style-panel.component';
import { collectChanges, createPanel } from './cv-live-style-panel.harness';

/**
 * The Text and Line groups are views: they hold no cascade rules, so what can
 * go wrong is the WIRING between the panel and its five call sites - a
 * `showInherit` passed where it does not belong, a size range swapped between
 * body and title, an output routed to the wrong setter. None of that is visible
 * to type-check (the bindings are type-identical) or to the existing specs,
 * which reach the panel's class members directly.
 *
 * So these tests go through the rendered DOM, one per binding that differs
 * between call sites. `entry-rule.spec.ts` is at 598/600 and cannot take them.
 */
describe('CvLiveStylePanelComponent group wiring', () => {
  let component: CvLiveStylePanelComponent;
  let fixture: ComponentFixture<CvLiveStylePanelComponent>;

  beforeEach(async () => {
    ({ component, fixture } = await createPanel());
  });

  function select(part: 'body' | 'title', elementPath?: string): void {
    fixture.componentRef.setInput('selection', {
      sectionKey: 'experience',
      part,
      ...(elementPath ? { elementPath } : {}),
    });
    fixture.detectChanges();
  }

  /** The Line group ships collapsed - the panel has to stay short enough for
   * the footer reset to remain reachable - so its controls are not in the DOM
   * until it is opened. */
  function openLine(): void {
    component.lineOpen.set(true);
    fixture.detectChanges();
  }

  /** The single line group on screen. Every case below renders exactly one, and
   * asserting that is what keeps the index unambiguous. */
  function lineGroupSelect(): HTMLSelectElement {
    const groups = fixture.nativeElement.querySelectorAll('app-cv-style-line-group');
    expect(groups).toHaveLength(1);
    return groups[0].querySelector('select') as HTMLSelectElement;
  }

  function choose(el: HTMLSelectElement, value: string): void {
    el.value = value;
    el.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  describe('the Text group is parameterised per call site, not per component', () => {
    it('a body leaf gets the body size range and the line-height row', () => {
      select('body', 'exp.0');

      const size: HTMLInputElement = fixture.nativeElement.querySelector(
        'app-cv-style-text-group input[type="number"]',
      );
      expect(size.min).toBe('8');
      expect(size.max).toBe('14');
      expect(fixture.nativeElement.querySelector('.cvlive__line-height')).toBeTruthy();
    });

    it('a title gets the wider title range and no line-height row', () => {
      select('title');

      const size: HTMLInputElement = fixture.nativeElement.querySelector(
        'app-cv-style-text-group input[type="number"]',
      );
      expect(size.min).toBe('6');
      expect(size.max).toBe('28');
      expect(fixture.nativeElement.querySelector('.cvlive__line-height')).toBeNull();
    });

    it("the line-height select writes the body's lineHeight", () => {
      select('body', 'exp.0');
      const changes = collectChanges(component);

      const lh = fixture.nativeElement.querySelector(
        '.cvlive__line-height select',
      ) as HTMLSelectElement;
      choose(lh, lh.options[2].value);

      expect(changes).toHaveLength(1);
      expect(changes[0].patch?.lineHeight).toBe(1.35);
    });
  });

  describe('the Line group carries a different Inherit rule per call site', () => {
    it('an experience entry is offered Inherit, because it has one', () => {
      select('body', 'exp.0');
      component.setScope('element');
      openLine();

      expect(component.canElementLine()).toBe(true);
      expect(component.isEntrySelection()).toBe(true);
      // Inherit + None + solid + dotted + dashed.
      expect(lineGroupSelect().options).toHaveLength(5);
    });

    it('a plain leaf is not, because an absent underline is None rather than inherited', () => {
      select('body', 'exp.0.bullets.0');
      component.setScope('element');
      openLine();

      expect(component.canElementLine()).toBe(true);
      expect(component.isEntrySelection()).toBe(false);
      expect(lineGroupSelect().options).toHaveLength(4);
      expect(lineGroupSelect().options[0].value).toBe('none');
    });

    it('a section title is offered Inherit', () => {
      select('title');
      openLine();

      expect(lineGroupSelect().options).toHaveLength(5);
    });
  });

  describe('each Line group call site writes to its own target', () => {
    it("the element group writes the leaf's own border", () => {
      select('body', 'exp.0');
      component.setScope('element');
      openLine();
      const changes = collectChanges(component);

      choose(lineGroupSelect(), 'dashed');

      expect(changes).toHaveLength(1);
      expect(changes[0].scope).toBe('element');
      expect(changes[0].patch?.borderStyle).toBe('dashed');
      expect(changes[0].titleBorder).toBeUndefined();
      expect(changes[0].bodyBorder).toBeUndefined();
    });

    it('the title group writes the section-title border', () => {
      select('title');
      openLine();
      const changes = collectChanges(component);

      choose(lineGroupSelect(), 'dotted');

      expect(changes).toHaveLength(1);
      expect(changes[0].titleBorder).toBe('dotted');
      expect(changes[0].patch).toBeUndefined();
    });

    it("the section-body group writes the section's divider", () => {
      select('body', 'exp.0');
      component.setScope('section');
      openLine();

      expect(component.canBodyRule()).toBe(true);
      const changes = collectChanges(component);

      choose(lineGroupSelect(), 'solid');

      expect(changes).toHaveLength(1);
      expect(changes[0].scope).toBe('section');
      expect(changes[0].bodyBorder).toBe('solid');
      expect(changes[0].patch).toBeUndefined();
    });
  });

  describe('the width and colour rows follow the call site, not one shared rule', () => {
    it('a leaf that draws no line hides them', () => {
      select('body', 'exp.0.bullets.0');
      component.setScope('element');
      openLine();

      expect(component.hasElementLine()).toBe(false);
      expect(
        fixture.nativeElement.querySelectorAll('app-cv-style-line-group input[type="number"]'),
      ).toHaveLength(0);
    });

    it("a section rule left at Inherit keeps them, because '' still draws", () => {
      fixture.componentRef.setInput('style', {
        ...CV_STYLE_DEFAULT,
        sectionStyles: {},
      });
      select('body', 'exp.0');
      component.setScope('section');
      openLine();

      expect(component.activeBodyBorder()).toBe('');
      expect(
        fixture.nativeElement.querySelectorAll('app-cv-style-line-group input[type="number"]'),
      ).toHaveLength(1);
    });
  });
});
