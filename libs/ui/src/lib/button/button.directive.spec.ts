import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ButtonDirective, type ButtonSize, type ButtonVariant } from './button.directive';

/** Signals rather than plain fields: a plain field written between two change
 * detection passes does not mark the host dirty, so the new value lands during
 * `checkNoChanges` and Angular reports NG0100 instead of the assertion. */
@Component({
  standalone: true,
  imports: [ButtonDirective],
  template: `
    <button appButton [variant]="variant()" [size]="size()" type="button">x</button>
    <button appButton type="button">default</button>
  `,
})
class HostComponent {
  readonly variant = signal<ButtonVariant>('ghost');
  readonly size = signal<ButtonSize>('icon');
}

describe('ButtonDirective', () => {
  function render() {
    const fixture = TestBed.configureTestingModule({ imports: [HostComponent] }).createComponent(
      HostComponent,
    );
    fixture.detectChanges();
    return fixture;
  }

  function classesOf(fixture: ReturnType<typeof render>, index: number): string[] {
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLElement>;
    return Array.from(buttons[index].classList);
  }

  /**
   * Four page stylesheets each reimplemented a square icon button as
   * `.icon-btn`, in three different shapes, while this size existed unused but
   * for one call site. They fold onto it here (ADR-0005, amendment eighteen),
   * so the class this emits is now load-bearing on five pages.
   */
  it('emits the design-system classes for an icon button', () => {
    expect(classesOf(render(), 0)).toEqual(
      expect.arrayContaining(['btn', 'btn--ghost', 'btn--icon']),
    );
  });

  it('tracks a variant change, because the preview toggles bind it', () => {
    const fixture = render();
    expect(classesOf(fixture, 0)).toContain('btn--ghost');

    fixture.componentInstance.variant.set('primary');
    fixture.detectChanges();

    const classes = classesOf(fixture, 0);
    expect(classes).toContain('btn--primary');
    expect(classes).not.toContain('btn--ghost');
  });

  it('carries the danger variant a delete button asks for', () => {
    const fixture = render();
    fixture.componentInstance.variant.set('danger');
    fixture.detectChanges();
    expect(classesOf(fixture, 0)).toContain('btn--danger');
  });

  it('defaults to a primary medium button when neither input is given', () => {
    expect(classesOf(render(), 1)).toEqual(
      expect.arrayContaining(['btn', 'btn--primary', 'btn--md']),
    );
  });
});
