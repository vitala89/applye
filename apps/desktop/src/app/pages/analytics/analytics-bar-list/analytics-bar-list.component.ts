import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * One row of a horizontal bar list: a name, a proportional bar with its value,
 * and an optional conversion column on the right.
 *
 * Every field arrives **resolved**. `widthPct` is a CSS length, `fill` a colour,
 * `valueText` already a string - the page decides what a row means and this
 * component decides nothing.
 */
export interface AnalyticsBarRow {
  name: string;
  /** Rendered inside the bar. A count for most lists, an average for the
   * score-vs-outcome card - which is why it is text rather than a number. */
  valueText: string;
  /** A CSS width, e.g. `'42%'`. */
  widthPct: string;
  /** Defaults to the neutral fill. Only the funnel highlights rows. */
  fill?: string;
  /** Only the funnel colours its names. */
  nameColor?: string;
  /** Empty when this list has no conversion column, which is five of the six. */
  convText?: string;
  convOf?: string;
}

/**
 * The bar list under an analytics card. **Six cards render one** - the funnel,
 * the score distribution, score vs outcome, time to response, pipeline aging and
 * locations - and before this component each wrote the same fifteen lines of
 * markup out again.
 *
 * **It is a view, and every predicate that distinguishes the six stays resolved
 * in the page.** Which rows are accented, what the value column says, whether
 * there is a conversion figure and how it is worded are all decided by the
 * page's computeds, which is where the analytics vocabulary already lives.
 * Deriving any of that here would move meaning away from the module whose specs
 * own it - the mistake `cv-style-panel-cascade.ts` records at length.
 *
 * The per-card notes and the funnel's leakage bar are **projected**, not inputs:
 * they are page-specific sentences that belong inside the list's box, and
 * projected content keeps the page's own styles because it stays in the page's
 * view.
 */
@Component({
  selector: 'app-analytics-bar-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './analytics-bar-list.component.html',
  styleUrl: './analytics-bar-list.component.scss',
})
export class AnalyticsBarListComponent {
  readonly rows = input.required<readonly AnalyticsBarRow[]>();

  /** Locations render free-text place names, which need more room and a tooltip
   * than the fixed vocabulary the other five lists use. */
  readonly wideNames = input(false);
}
