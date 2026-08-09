import { Injectable, computed, inject, signal } from '@angular/core';
import {
  type AnalyticsFacts,
  type AnalyticsPeriod,
  type AnalyticsView,
  computeAnalytics,
} from '@applye/core';
import { DbService } from '@applye/data';

/** What the page renders when nothing has loaded, and after a failed read. */
const NO_FACTS: AnalyticsFacts = { applications: [], followups: [] };

/**
 * What the Analytics screen is showing: the raw facts, the selected period, and
 * the view `computeAnalytics` derives from the two.
 *
 * **The derivation itself is not here.** It is `computeAnalytics` in
 * `libs/core`, already pure and already tested; this store owns the inputs and
 * the moment they are read at, nothing more.
 *
 * **None of the page's ten view computeds moved either.** Every one of them
 * translates - tile labels, stage names, the leakage caption, the outcome
 * groups - and this layer does not translate. The store hands over
 * `AnalyticsView`; the page turns it into words.
 */
@Injectable()
export class AnalyticsStore {
  private readonly db = inject(DbService);

  readonly loading = signal(true);
  readonly facts = signal<AnalyticsFacts | null>(null);
  readonly period = signal<AnalyticsPeriod>('90d');

  /**
   * Filled only by a genuine failure. The page turns it into a toast; the store
   * does not, because it does not translate.
   */
  readonly error = signal('');

  /**
   * Stamped at load rather than read inside the view, so every figure on one
   * screen agrees about what "now" was and switching period cannot quietly
   * move the window boundary underneath the comparison (the same rule
   * `DashboardStore` follows).
   */
  readonly now = signal(Date.now());

  readonly view = computed<AnalyticsView | null>(() => {
    const f = this.facts();
    return f ? computeAnalytics(f, this.period(), new Date(this.now())) : null;
  });

  readonly state = computed(() => this.view()?.state ?? 'empty');

  /**
   * Never rejects. A failed read installs empty facts rather than leaving them
   * null, which is what renders the honest empty state instead of a blank page
   * - the behaviour the page had, and the reason this returns `false` rather
   * than throwing.
   */
  async load(): Promise<boolean> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.facts.set(await this.db.getAnalyticsFacts());
      this.now.set(Date.now());
      return true;
    } catch (e) {
      this.error.set(String(e));
      this.facts.set(NO_FACTS);
      return false;
    } finally {
      this.loading.set(false);
    }
  }

  setPeriod(p: AnalyticsPeriod): void {
    this.period.set(p);
  }
}
