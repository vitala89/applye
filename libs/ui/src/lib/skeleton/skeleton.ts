import { Component, computed, input } from '@angular/core';

/**
 * Skeleton - a shimmering placeholder that reserves layout while content
 * loads. Mirrors the Applye Design System `Skeleton` primitive: a sliding
 * indigo-neutral shimmer over a sunken surface, falling back to a soft pulse
 * under `prefers-reduced-motion`. The `.applye-skeleton` styles live in the
 * shared global stylesheet so the shimmer is identical everywhere.
 */
@Component({
  selector: 'lib-skeleton',
  standalone: true,
  imports: [],
  template: `<span
    class="applye-skeleton"
    aria-hidden="true"
    [style.width]="resolvedWidth()"
    [style.height.px]="height()"
    [style.borderRadius]="resolvedRadius()"
  ></span>`,
})
export class Skeleton {
  /** Width for non-circle skeletons (any CSS length, e.g. '100%', '55%'). */
  readonly width = input<string>('100%');
  /** Height in px. Also the diameter when `circle` is true. */
  readonly height = input<number>(12);
  /** Render a circular placeholder (avatar / gauge). */
  readonly circle = input<boolean>(false);
  readonly radius = input<string>('var(--radius-badge)');

  protected readonly resolvedWidth = computed(() =>
    this.circle() ? `${this.height()}px` : this.width(),
  );
  protected readonly resolvedRadius = computed(() =>
    this.circle() ? 'var(--radius-full)' : this.radius(),
  );
}
