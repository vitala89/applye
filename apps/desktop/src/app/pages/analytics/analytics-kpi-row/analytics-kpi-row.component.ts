import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideAngularModule, LucideIconData } from 'lucide-angular';

/** One KPI tile, with every figure already worded by the page. */
export interface AnalyticsTile {
  key: string;
  icon: LucideIconData;
  label: string;
  valueText: string;
  isPercent: boolean;
  accent: boolean;
  deltaShow: boolean;
  deltaUp: boolean;
  deltaIcon: LucideIconData;
  deltaText: string;
  /** Normalised 0..1 bar heights. Empty when there is no honest series. */
  spark: number[];
  /** Empty unless this tile should read as "not enough data yet". */
  note: string;
}

/**
 * The four KPI tiles across the top of the Analytics page.
 *
 * **It renders its own loading placeholders when `tiles` is empty**, and that is
 * a fact about the data rather than a mode flag: the page's store returns no
 * view until the facts load, so `tiles()` is already empty exactly while the
 * page is loading. The alternative was a second copy of the tile markup in the
 * page's skeleton branch, which would have made `.ana-tile` shared vocabulary
 * for no reason - a boolean `skeleton` input would have been the hidden mode
 * `CODE_QUALITY.md` warns about, and would have said the same thing twice.
 *
 * The `.ana-skel` boxes inside those placeholders are genuinely shared with the
 * page's own skeleton branch, so they come from `_analytics-skeleton.scss`.
 */
@Component({
  selector: 'app-analytics-kpi-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './analytics-kpi-row.component.html',
  styleUrl: './analytics-kpi-row.component.scss',
})
export class AnalyticsKpiRowComponent {
  readonly tiles = input.required<readonly AnalyticsTile[]>();

  /** The four placeholders, as a list so the template can `@for` over it. */
  protected readonly placeholders = [1, 2, 3, 4];
}
