import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'lib-stepper',
  standalone: true,
  imports: [],
  templateUrl: './stepper.html',
  styleUrl: './stepper.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Stepper {
  readonly steps = input.required<string[]>();
  readonly activeIndex = input.required<number>();

  protected readonly markers = computed(() =>
    this.steps().map((label, i) => ({
      label,
      done: i < this.activeIndex(),
      active: i === this.activeIndex(),
      isLast: i === this.steps().length - 1,
    })),
  );
}
