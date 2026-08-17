import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The applications-over-time plot, with every geometry string already built. */
export interface AnalyticsTrend {
  /** SVG `points` for the applications line. */
  lineApps: string;
  /** SVG `points` for the follow-ups line. Rendered only when `hasFollowups`. */
  lineFollow: string;
  /** SVG `points` for the filled area under the applications line. */
  area: string;
  ticks: string[];
  unit: string;
  yMax: string;
  hasFollowups: boolean;
}

/**
 * The applications-over-time plot: four gridlines, a filled area, one or two
 * polylines, and the tick labels beneath.
 *
 * **The geometry arrives as finished `points` strings.** `polylinePoints` and
 * `areaPoints` are pure functions in `libs/application`, and the page calls them
 * along with the date formatting, which is locale-bound. Nothing here computes a
 * coordinate; the viewBox is fixed at `0 0 100 42` and the strings are already
 * in that space.
 *
 * The legend stays in the page's card header, outside this component's view.
 */
@Component({
  selector: 'app-analytics-trend',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './analytics-trend.component.html',
  styleUrl: './analytics-trend.component.scss',
})
export class AnalyticsTrendComponent {
  readonly trend = input.required<AnalyticsTrend>();
}
