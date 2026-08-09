import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import type { TrackerRow } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { TrackerRowMenuComponent } from './tracker-row-menu.component';

describe('TrackerRowMenuComponent', () => {
  let fixture: ComponentFixture<TrackerRowMenuComponent>;

  const row = (over: Partial<TrackerRow> = {}) =>
    ({ id: 7, archived: false, ...over }) as TrackerRow;

  const build = (over: Partial<TrackerRow> = {}, confirming = false) => {
    fixture.componentRef.setInput('row', row(over));
    fixture.componentRef.setInput('top', 120);
    fixture.componentRef.setInput('left', 40);
    fixture.componentRef.setInput('confirming', confirming);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TrackerRowMenuComponent],
      providers: [{ provide: TranslateService, useValue: { t: signal((k: string) => k) } }],
    }).compileComponents();
    fixture = TestBed.createComponent(TrackerRowMenuComponent);
  });

  it('anchors itself where the caller says', () => {
    build();
    const pop = fixture.nativeElement.querySelector('.jt-pop') as HTMLElement;
    expect(pop.style.top).toBe('120px');
    expect(pop.style.left).toBe('40px');
  });

  it('offers archive for a live row and restore for an archived one', () => {
    build({ archived: false });
    let labels = [...fixture.nativeElement.querySelectorAll('.jt-pop__item')].map((b) =>
      (b as HTMLElement).textContent?.trim(),
    );
    expect(labels).toContain('tracker.archive');
    expect(labels).not.toContain('tracker.restore');

    build({ archived: true });
    labels = [...fixture.nativeElement.querySelectorAll('.jt-pop__item')].map((b) =>
      (b as HTMLElement).textContent?.trim(),
    );
    expect(labels).toContain('tracker.restore');
    expect(labels).not.toContain('tracker.archive');
  });

  it('asks to archive with true and to restore with false', () => {
    const toggled: boolean[] = [];
    fixture.componentRef.setInput('row', row({ archived: false }));
    fixture.componentRef.setInput('top', 0);
    fixture.componentRef.setInput('left', 0);
    fixture.detectChanges();
    fixture.componentInstance.archiveToggled.subscribe((v) => toggled.push(v));

    const archive = [...fixture.nativeElement.querySelectorAll('.jt-pop__item')].find((b) =>
      (b as HTMLElement).textContent?.includes('tracker.archive'),
    ) as HTMLElement;
    archive.click();

    expect(toggled).toEqual([true]);
  });

  // The confirmation replaces the menu's contents rather than opening beside
  // it, so the destructive item must not be reachable while it is up.
  it('replaces the menu with the confirmation, and back', () => {
    build({}, true);
    expect(fixture.nativeElement.querySelector('.jt-pop__confirm')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.jt-pop__item')).toHaveLength(0);

    build({}, false);
    expect(fixture.nativeElement.querySelector('.jt-pop__confirm')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.jt-pop__item').length).toBeGreaterThan(0);
  });

  it('separates cancelling the delete from confirming it', () => {
    build({}, true);
    const cancelled = jest.fn();
    const confirmed = jest.fn();
    fixture.componentInstance.removeCancelled.subscribe(cancelled);
    fixture.componentInstance.removeConfirmed.subscribe(confirmed);

    (fixture.nativeElement.querySelector('.jt-mini:not(.jt-mini--danger)') as HTMLElement).click();
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(confirmed).not.toHaveBeenCalled();

    (fixture.nativeElement.querySelector('.jt-mini--danger') as HTMLElement).click();
    expect(confirmed).toHaveBeenCalledTimes(1);
  });

  it('closes from the backdrop', () => {
    build();
    const closed = jest.fn();
    fixture.componentInstance.closed.subscribe(closed);

    (fixture.nativeElement.querySelector('.jt-pop-backdrop') as HTMLElement).click();

    expect(closed).toHaveBeenCalled();
  });
});
