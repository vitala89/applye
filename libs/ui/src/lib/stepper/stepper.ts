import { Component, input, output } from '@angular/core';

@Component({
  selector: 'lib-stepper',
  standalone: true,
  imports: [],
  templateUrl: './stepper.html',
  styleUrl: './stepper.scss',
})
export class Stepper {
  readonly steps = input.required<string[]>();
  readonly activeIndex = input.required<number>();
  readonly nextDisabled = input<boolean>(false);
  readonly backLabel = input<string>('Back');
  readonly nextLabel = input<string>('Next');

  readonly back = output<void>();
  readonly next = output<void>();

  protected onBack(): void {
    this.back.emit();
  }

  protected onNext(): void {
    this.next.emit();
  }
}
