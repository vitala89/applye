import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InterviewStageActionsComponent } from './interview-stage-actions.component';

@Component({
  standalone: true,
  imports: [InterviewStageActionsComponent],
  template: `
    <div class="row">
      <app-interview-stage-actions
        [moveUpDisabled]="moveUpDisabled()"
        [moveDownDisabled]="moveDownDisabled()"
        (movedUp)="movedUp = movedUp + 1"
        (movedDown)="movedDown = movedDown + 1"
        (edited)="edited = edited + 1"
        (deleted)="deleted = deleted + 1"
      />
    </div>
  `,
})
class HostComponent {
  readonly moveUpDisabled = signal(false);
  readonly moveDownDisabled = signal(false);
  movedUp = 0;
  movedDown = 0;
  edited = 0;
  deleted = 0;
}

describe('InterviewStageActionsComponent', () => {
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

  it('offers all four stage controls', () => {
    expect(buttons()).toHaveLength(4);
  });

  it('reports each action instead of performing one', () => {
    const [up, down, edit, remove] = buttons();
    up.click();
    down.click();
    edit.click();
    remove.click();
    expect([host.movedUp, host.movedDown, host.edited, host.deleted]).toEqual([1, 1, 1, 1]);
  });

  /** The first stage cannot move up and the last cannot move down, and the
   * page decides which is which - so the two controls disable independently
   * rather than together. */
  it('disables each move control independently', () => {
    host.moveUpDisabled.set(true);
    fixture.detectChanges();
    expect(buttons()[0].disabled).toBe(true);
    expect(buttons()[1].disabled).toBe(false);

    host.moveUpDisabled.set(false);
    host.moveDownDisabled.set(true);
    fixture.detectChanges();
    expect(buttons()[0].disabled).toBe(false);
    expect(buttons()[1].disabled).toBe(true);
  });

  /** Edit and delete are always available; only reordering depends on where
   * the stage sits in the list. */
  it('never disables edit or delete', () => {
    host.moveUpDisabled.set(true);
    host.moveDownDisabled.set(true);
    fixture.detectChanges();
    expect(buttons()[2].disabled).toBe(false);
    expect(buttons()[3].disabled).toBe(false);
  });

  /**
   * The fold replaced `.ipd__icon-btn` with the design-system button, so the
   * classes the stylesheet targets are the directive's rather than the page's.
   * Three controls are `secondary`, which carries the visible border
   * interview-prep's icon buttons have always had; delete is `danger`, whose
   * own border is restored by this component's stylesheet (ADR-0005,
   * amendment nineteen).
   */
  it('renders three secondary icon buttons and one danger', () => {
    const classes = buttons().map((b) => b.className);
    expect(classes.every((c) => c.includes('btn--icon'))).toBe(true);
    expect(classes.filter((c) => c.includes('btn--secondary'))).toHaveLength(3);
    expect(classes.filter((c) => c.includes('btn--danger'))).toHaveLength(1);
  });

  /**
   * The page lays the status pill and these four controls out in one flex row,
   * so nothing may sit between the row and the buttons. Two things could put
   * something there: a wrapper element in this template, which is what this
   * asserts, and losing `display: contents` on the host, which jsdom cannot
   * see - it performs no layout and does not resolve `:host`. Only a rendered
   * screen catches the second half (ADR-0005, amendment nineteen).
   */
  it('adds no wrapper of its own around the four controls', () => {
    const hostEl: HTMLElement = fixture.nativeElement.querySelector('app-interview-stage-actions');
    const children = Array.from(hostEl.children);
    expect(children).toHaveLength(4);
    expect(children.every((c) => c.tagName === 'BUTTON')).toBe(true);
  });

  it('labels every control for assistive technology', () => {
    expect(buttons().every((b) => (b.getAttribute('aria-label') ?? '').length > 0)).toBe(true);
  });
});
