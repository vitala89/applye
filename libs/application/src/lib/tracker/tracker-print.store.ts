import { Injectable, inject, signal } from '@angular/core';
import type { TrackerRow } from '@applye/core';
import { DocumentsGateway, TrackerGateway } from '@applye/data';
import {
  TrackerSummary,
  reportTrackerRows,
  summarizeTrackerRows,
  trackerRangeStart,
} from './tracker-rows';

/**
 * The rows the hidden print window renders, for the silent WYSIWYG PDF export.
 *
 * **It loads its own rows rather than receiving the page's**, because the print
 * route runs in a separate Tauri window with only query parameters to go on.
 * That is why it exists at all, and why it shares
 * `reportTrackerRows`/`summarizeTrackerRows` with `TrackerRowsStore`: the sheet
 * and the screen have to agree on what a period selects, and before this the
 * two rules were separate copies with no test on either.
 *
 * Everything else the print route does - reading the query parameters, waiting
 * for fonts, tagging `<body>` for the print stylesheet - is browser work and
 * stays on the component. Only the two gateway calls are here.
 *
 * Component-scoped.
 */
@Injectable()
export class TrackerPrintStore {
  private readonly db = inject(DocumentsGateway);
  /** Rows come from `TrackerGateway`; `db` stays for `printWindowReady`,
   * which belongs to the documents domain. */
  private readonly tracker = inject(TrackerGateway);

  readonly rows = signal<TrackerRow[]>([]);
  readonly summary = signal<TrackerSummary>({ total: 0, rate: 0, avg: 0 });

  /**
   * Reads every row, then narrows and sorts it for the given period. Never
   * rejects: a failure prints an empty sheet rather than hanging the export,
   * which is what the route did - the hidden window has no way to report an
   * error to anyone.
   */
  async load(period: string): Promise<void> {
    let all: TrackerRow[];
    try {
      all = await this.tracker.trackerRows();
    } catch {
      all = [];
    }
    const rows = reportTrackerRows(all, trackerRangeStart(period));
    this.rows.set(rows);
    this.summary.set(summarizeTrackerRows(rows));
  }

  /** Tells Rust the DOM has settled and the window is safe to print. The
   * component decides *when*; this is only the call. */
  async markPrintWindowReady(): Promise<void> {
    await this.db.printWindowReady();
  }
}
