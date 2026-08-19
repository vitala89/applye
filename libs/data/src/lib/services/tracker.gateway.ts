import { Injectable } from '@angular/core';
import { TrackerCustomColumn, TrackerRow } from '@applye/core';
import { tauriInvoke } from '../tauri.invoke';

/**
 * The tracker table: its rows, the user-defined columns, archiving a row, and
 * the two report exports.
 *
 * **The fourth per-domain gateway** - see `CODE_QUALITY.md` for the migration
 * and `DraftsGateway` for the pattern.
 *
 * **The score cache deliberately did not come with it.** The domain list
 * described tracker as including `scoreCacheGet`/`Latest`/`Save`; the consumers
 * say otherwise - all three are read by `job-scoring.service.ts` and
 * `job-intake.service.ts`, and by nothing in the tracker. They go to the jobs
 * gateway. The description was wrong, not the boundary.
 *
 * The seven methods here were **interleaved through the Jobs section** rather
 * than gathered under a banner, which is the third gateway in a row to find
 * its methods mis-filed.
 */
@Injectable({ providedIn: 'root' })
export class TrackerGateway {
  /** Job Tracker rows: applications + jobs + last status change (0 tokens). */
  async trackerRows(): Promise<TrackerRow[]> {
    return tauriInvoke<TrackerRow[]>('db_tracker_rows');
  }

  /** Write a laid-out report (pdf/csv) via a native Save dialog; returns the
   * chosen path, or '' if the user cancels. */
  async exportReport(content: string, format: 'pdf' | 'csv', fileBase: string): Promise<string> {
    return tauriInvoke<string>('export_report', { content, format, fileBase });
  }

  /** Export the tracker report to a PDF at `savePath`, rendered by the hidden
   * `print/tracker-report` window so it matches the preview exactly. */
  async trackerReportExportPdfWysiwyg(params: {
    savePath: string;
    applicant: string;
    period: string;
    periodLabel: string;
    market: string;
    landscape: boolean;
    mode: string;
    columns: string;
    fallbackContent: string;
  }): Promise<string> {
    return tauriInvoke<string>('tracker_report_export_pdf_wysiwyg', params);
  }

  /** Soft-archive / restore a tracker row (kept in the report either way). */
  async setApplicationArchived(id: number, archived: boolean): Promise<void> {
    return tauriInvoke<void>('db_set_application_archived', { id, archived });
  }

  /** User-defined Job Tracker columns (definitions only). */
  async trackerCustomColumns(): Promise<TrackerCustomColumn[]> {
    return tauriInvoke<TrackerCustomColumn[]>('tracker_custom_columns_list');
  }

  async addTrackerCustomColumn(
    id: string,
    label: string,
    colType: string,
  ): Promise<TrackerCustomColumn> {
    return tauriInvoke<TrackerCustomColumn>('tracker_custom_column_add', { id, label, colType });
  }

  async removeTrackerCustomColumn(id: string): Promise<void> {
    return tauriInvoke<void>('tracker_custom_column_remove', { id });
  }
}
