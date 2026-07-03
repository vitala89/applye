import { Directive, HostBinding, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

// Attribute directive: applies design-system button classes to native
// <button> elements. Keeps semantics (type, disabled, click) on the
// element itself instead of wrapping it in a component.
@Directive({
  selector: 'button[appButton]',
  standalone: true,
})
export class ButtonDirective {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');

  @HostBinding('class') get hostClasses(): string {
    return `btn btn--${this.variant()} btn--${this.size()}`;
  }
}
