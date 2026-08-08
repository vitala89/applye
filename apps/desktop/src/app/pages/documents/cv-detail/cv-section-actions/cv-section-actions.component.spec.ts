import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CvSectionActionsComponent } from './cv-section-actions.component';

@Component({
  standalone: true,
  imports: [CvSectionActionsComponent],
  template: `
    <app-cv-section-actions
      [regeneratable]="regeneratable()"
      [regenerateDisabled]="regenerateDisabled()"
      [regenerating]="regenerating()"
      [movable]="movable()"
      [moveUpDisabled]="moveUpDisabled()"
      [moveDownDisabled]="moveDownDisabled()"
      (regenerated)="regenerated = regenerated + 1"
      (movedUp)="movedUp = movedUp + 1"
      (movedDown)="movedDown = movedDown + 1"
    />
  `,
})
class HostComponent {
  readonly regeneratable = signal(true);
  readonly regenerateDisabled = signal(false);
  readonly regenerating = signal(false);
  readonly movable = signal(true);
  readonly moveUpDisabled = signal(false);
  readonly moveDownDisabled = signal(false);
  regenerated = 0;
  movedUp = 0;
  movedDown = 0;
}

describe('CvSectionActionsComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  function buttons(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('button'));
  }

  it('offers regenerate and both move controls when the page allows all three', () => {
    expect(buttons()).toHaveLength(3);
  });

  it('hides regenerate for a section that cannot be regenerated', () => {
    host.regeneratable.set(false);
    fixture.detectChanges();
    expect(buttons()).toHaveLength(2);
  });

  /** A locked section keeps its Regenerate but loses reordering entirely,
   * rather than showing two disabled arrows. */
  it('hides both move controls for a locked section', () => {
    host.movable.set(false);
    fixture.detectChanges();
    expect(buttons()).toHaveLength(1);
  });

  it('reports each action instead of performing one', () => {
    const [regenerate, up, down] = buttons();
    regenerate.click();
    up.click();
    down.click();
    expect([host.regenerated, host.movedUp, host.movedDown]).toEqual([1, 1, 1]);
  });

  /** Any regeneration in flight disables the button, because the page runs
   * them one at a time - not only the one belonging to this section. */
  it('disables regenerate while any section is regenerating', () => {
    host.regenerateDisabled.set(true);
    fixture.detectChanges();
    expect(buttons()[0].disabled).toBe(true);
  });

  it('disables each move control independently', () => {
    host.moveUpDisabled.set(true);
    fixture.detectChanges();
    expect(buttons()[1].disabled).toBe(true);
    expect(buttons()[2].disabled).toBe(false);
  });

  /**
   * `.spinning` was declared on the page and this markup was its only user, so
   * it moved here with the icon; a page-scoped class does not reach a child
   * extracted out of it (ADR-0005, amendment sixteen). This test fails if the
   * icon stops carrying the class its own stylesheet now targets.
   */
  it('spins only the icon of the section actually regenerating', () => {
    const icon = () => fixture.nativeElement.querySelector('lucide-icon');
    expect(icon().classList).not.toContain('spinning');

    host.regenerating.set(true);
    fixture.detectChanges();
    expect(icon().classList).toContain('spinning');
  });
});
