import { Injectable, computed, inject, signal } from '@angular/core';
import type { TrackerCustomColumn } from '@applye/core';
import { DbService } from '@applye/data';
import {
  TRACKER_ESSENTIAL_COLUMNS,
  TRACKER_OPTIONAL_COLUMNS,
  TrackerColumnDef,
  defaultTrackerColumnState,
  visibleTrackerColumns,
} from './tracker-columns';

/**
 * Which tracker columns exist and which are showing.
 *
 * **The visibility map lives here rather than on the page**, against the first
 * reading of ADR-0005's "view state stays on the page". It merges with the
 * gateway-loaded custom columns into `visibleColumns`, which the grid, the
 * column panel and the report's own column list all derive from; splitting the
 * two halves across layers would leave nothing owning the result
 * (ADR-0005, amendment eight).
 *
 * **It never notifies the user** (amendment three). `addColumn` and
 * `removeColumn` report their outcome and let a gateway failure throw; the page
 * decides the wording. It holds no `TranslateService` either: a column label is
 * UI text on this screen and the report's own language on the sheet, so the
 * caller labels it.
 *
 * Component-scoped, like the CV stores.
 */
@Injectable()
export class TrackerColumnsStore {
  private readonly db = inject(DbService);

  /** Built-in columns, constant. Exposed so the visibility panel can list the
   * two groups without re-deriving them on every change detection pass. */
  readonly essentialColumns = TRACKER_ESSENTIAL_COLUMNS;
  readonly optionalColumns = TRACKER_OPTIONAL_COLUMNS;

  readonly customColumns = signal<TrackerCustomColumn[]>([]);
  readonly columnState = signal<Record<string, boolean>>(defaultTrackerColumnState());

  /** The add-a-column form. Cleared by `addColumn` on success only. */
  readonly newColumnName = signal('');
  readonly newColumnType = signal<TrackerCustomColumn['type']>('text');

  readonly visibleColumns = computed<TrackerColumnDef[]>(() =>
    visibleTrackerColumns(this.columnState(), this.customColumns()),
  );

  /**
   * Reads the stored custom columns. Never rejects, and **a failure leaves the
   * current list alone** rather than emptying it: the page reloads its columns
   * after every row save, so clearing here would delete the user's columns from
   * the screen because an unrelated write failed. The page's own catch only
   * ever emptied the rows, and this preserves that.
   */
  async load(): Promise<void> {
    let stored: TrackerCustomColumn[];
    try {
      stored = await this.db.trackerCustomColumns();
    } catch {
      return;
    }
    this.customColumns.set(stored);
  }

  isVisible(key: string): boolean {
    return this.columnState()[key] ?? false;
  }

  toggle(key: string): void {
    this.columnState.update((state) => ({ ...state, [key]: !state[key] }));
  }

  /**
   * Creates a custom column from the form. Returns the created column, or
   * `null` when the name was blank - the caller must treat `null` as "no write
   * happened", not as failure. A gateway error propagates, and the form keeps
   * what the user typed so the attempt can be repeated.
   */
  async addColumn(): Promise<TrackerCustomColumn | null> {
    const label = this.newColumnName().trim();
    if (!label) return null;
    const id = 'cf_' + Date.now();
    const created = await this.db.addTrackerCustomColumn(id, label, this.newColumnType());
    this.customColumns.update((cols) => [...cols, created]);
    this.newColumnName.set('');
    this.newColumnType.set('text');
    return created;
  }

  /** Removes a custom column. A gateway error propagates and the list is left
   * alone, so the panel keeps showing a column that still exists. */
  async removeColumn(id: string): Promise<void> {
    await this.db.removeTrackerCustomColumn(id);
    this.customColumns.update((cols) => cols.filter((c) => c.id !== id));
  }
}
