import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '@applye/i18n';
import { DiscoverFilterMenuComponent } from './discover-filter-menu.component';

/**
 * The menu takes its body as projected content, so it can only be exercised
 * through a host. The marker below stands in for a real panel body and proves
 * the projection lands inside the panel rather than beside it.
 */
@Component({
  standalone: true,
  imports: [DiscoverFilterMenuComponent],
  template: `
    <app-discover-filter-menu
      [label]="label()"
      [count]="count()"
      [footNote]="footNote()"
      (cleared)="cleared = cleared + 1"
    >
      <div class="dv-geomenu__item"><span>projected body</span></div>
    </app-discover-filter-menu>
  `,
})
class HostComponent {
  readonly label = signal('All sources');
  readonly count = signal(0);
  readonly footNote = signal('');
  cleared = 0;
}

function createFixture(over: Partial<{ label: string; count: number; footNote: string }> = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [HostComponent], providers: [TranslateService] });
  const fixture: ComponentFixture<HostComponent> = TestBed.createComponent(HostComponent);
  if (over.label !== undefined) fixture.componentInstance.label.set(over.label);
  if (over.count !== undefined) fixture.componentInstance.count.set(over.count);
  if (over.footNote !== undefined) fixture.componentInstance.footNote.set(over.footNote);
  fixture.detectChanges();
  return fixture;
}

function q(f: ComponentFixture<HostComponent>, s: string): Element | null {
  return f.nativeElement.querySelector(s);
}

function openMenu(f: ComponentFixture<HostComponent>): void {
  (q(f, '.dv-btn') as HTMLElement).click();
  f.detectChanges();
}

describe('DiscoverFilterMenuComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('the trigger', () => {
    it('renders the label it was given', () => {
      expect(q(createFixture({ label: 'Locations' }), '.dv-btn')?.textContent).toContain(
        'Locations',
      );
    });

    /** Zero means "all", which is the resting state and carries no badge. */
    it('shows the count, and marks itself active, only when something is selected', () => {
      const none = createFixture({ count: 0 });
      expect(q(none, '.dv-geomenu__count')).toBeNull();
      expect(q(none, '.dv-btn')?.classList.contains('dv-btn--active')).toBe(false);

      const some = createFixture({ count: 3 });
      expect(q(some, '.dv-geomenu__count')?.textContent?.trim()).toBe('3');
      expect(q(some, '.dv-btn')?.classList.contains('dv-btn--active')).toBe(true);
    });
  });

  describe('opening and closing', () => {
    it('starts closed, and the trigger toggles it', () => {
      const fixture = createFixture();
      expect(q(fixture, '.dv-geomenu__panel')).toBeNull();

      openMenu(fixture);
      expect(q(fixture, '.dv-geomenu__panel')).not.toBeNull();

      openMenu(fixture);
      expect(q(fixture, '.dv-geomenu__panel')).toBeNull();
    });

    /** The backdrop is the whole reason a click anywhere else dismisses this. */
    it('closes on a backdrop click', () => {
      const fixture = createFixture();
      openMenu(fixture);
      (q(fixture, '.dv-geomenu__backdrop') as HTMLElement).click();
      fixture.detectChanges();
      expect(q(fixture, '.dv-geomenu__panel')).toBeNull();
    });

    it('closes on Escape', () => {
      const fixture = createFixture();
      openMenu(fixture);
      q(fixture, '.dv-geomenu__backdrop')?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape' }),
      );
      fixture.detectChanges();
      expect(q(fixture, '.dv-geomenu__panel')).toBeNull();
    });
  });

  describe('the panel', () => {
    it('is a labelled group, named by the same label as the trigger', () => {
      const fixture = createFixture({ label: 'Work type' });
      openMenu(fixture);
      const panel = q(fixture, '.dv-geomenu__panel');
      expect(panel?.getAttribute('role')).toBe('group');
      expect(panel?.getAttribute('aria-label')).toBe('Work type');
    });

    it('holds the projected body inside itself', () => {
      const fixture = createFixture();
      openMenu(fixture);
      expect(q(fixture, '.dv-geomenu__panel .dv-geomenu__item')?.textContent).toContain(
        'projected body',
      );
    });
  });

  /**
   * The three menus this replaced had two different feet: Sources and Type show
   * one only to hold Clear, so it is absent at zero; Locations always shows one,
   * because its hint explains how unmatched countries are grouped. Both shapes
   * fall out of the same two conditions, and all four combinations matter.
   */
  describe('the foot', () => {
    it('is absent entirely with no note and nothing selected', () => {
      const fixture = createFixture({ count: 0, footNote: '' });
      openMenu(fixture);
      expect(q(fixture, '.dv-geomenu__foot')).toBeNull();
    });

    it('holds Clear alone with no note and something selected', () => {
      const fixture = createFixture({ count: 2, footNote: '' });
      openMenu(fixture);
      expect(q(fixture, '.dv-geomenu__foot')).not.toBeNull();
      expect(q(fixture, '.dv-geomenu__foot .dv-geomenu__hint')).toBeNull();
      expect(q(fixture, '.dv-geomenu__foot .dv-linkbtn')).not.toBeNull();
    });

    it('holds the note alone with a note and nothing selected', () => {
      const fixture = createFixture({ count: 0, footNote: 'Elsewhere is grouped as Other' });
      openMenu(fixture);
      expect(q(fixture, '.dv-geomenu__foot .dv-geomenu__hint')?.textContent?.trim()).toBe(
        'Elsewhere is grouped as Other',
      );
      expect(q(fixture, '.dv-geomenu__foot .dv-linkbtn')).toBeNull();
    });

    it('holds both with a note and something selected', () => {
      const fixture = createFixture({ count: 2, footNote: 'Elsewhere is grouped as Other' });
      openMenu(fixture);
      expect(q(fixture, '.dv-geomenu__foot .dv-geomenu__hint')).not.toBeNull();
      expect(q(fixture, '.dv-geomenu__foot .dv-linkbtn')).not.toBeNull();
    });

    it('asks the page to clear, and does not clear anything itself', () => {
      const fixture = createFixture({ count: 2 });
      openMenu(fixture);
      (q(fixture, '.dv-linkbtn') as HTMLElement).click();
      fixture.detectChanges();
      expect(fixture.componentInstance.cleared).toBe(1);
      // The count is the page's; the menu still shows what it was handed.
      expect(q(fixture, '.dv-geomenu__count')?.textContent?.trim()).toBe('2');
    });
  });
});
