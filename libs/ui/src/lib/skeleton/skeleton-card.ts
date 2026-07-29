import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Skeleton } from './skeleton';

/**
 * SkeletonCard - a ready-made loading placeholder shaped like a result card,
 * ported from the Applye Design System: an avatar + two title lines, a body
 * block of text lines, and a footer chip row. Built from lib-skeleton
 * primitives so it shares the same shimmer.
 */
@Component({
  selector: 'lib-skeleton-card',
  standalone: true,
  imports: [Skeleton],
  template: `
    <div class="skeleton-card" role="status" aria-busy="true" aria-label="Loading">
      @if (media()) {
        <div class="skeleton-card__head">
          <lib-skeleton [circle]="true" [height]="40" />
          <div class="skeleton-card__titles">
            <lib-skeleton [height]="13" width="52%" />
            <lib-skeleton [height]="10" width="34%" />
          </div>
        </div>
      }
      <div class="skeleton-card__body">
        @for (line of bodyLines(); track line) {
          <lib-skeleton [height]="11" [width]="line" />
        }
      </div>
      @if (footer()) {
        <div class="skeleton-card__footer">
          <lib-skeleton [height]="22" width="68px" />
          <lib-skeleton [height]="22" width="52px" />
          <lib-skeleton [height]="22" width="80px" />
        </div>
      }
    </div>
  `,
  styles: [
    `
      .skeleton-card {
        display: flex;
        flex-direction: column;
        gap: var(--space-5, 16px);
        padding: var(--space-6, 20px);
        background: var(--surface-1);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-card);
      }
      .skeleton-card__head {
        display: flex;
        align-items: center;
        gap: var(--space-4, 12px);
      }
      .skeleton-card__titles {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 8px);
        flex: 1;
        min-width: 0;
      }
      .skeleton-card__body {
        display: flex;
        flex-direction: column;
        gap: 9px;
      }
      .skeleton-card__footer {
        display: flex;
        gap: var(--space-3, 8px);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkeletonCard {
  /** Number of body text lines. Last line is shortened for realism. */
  readonly lines = input<number>(3);
  readonly media = input<boolean>(true);
  readonly footer = input<boolean>(true);

  protected readonly bodyLines = computed(() => {
    const n = Math.max(1, this.lines());
    return Array.from({ length: n }, (_, i) => (i === n - 1 && n > 1 ? '62%' : '100%'));
  });
}
