import { Injectable, computed, inject, signal } from '@angular/core';
import type { SupportedLanguage } from '@applye/core';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { TrackerColumnsStore } from './tracker-columns.store';
import { trackerColumnWidth } from './tracker-columns';
import { ReportColumn, ReportMarket, ReportMode, reportFit } from './tracker-report';
import {
  buildTrackerCsv,
  buildTrackerReportText,
  trackerReportBaseName,
} from './tracker-report-content';
import { TrackerRowsStore } from './tracker-rows.store';

/**
 * Opens the platform's Save dialog and returns the chosen path, or `null` if
 * the user cancelled.
 *
 * Passed in rather than called: the Tauri dialog plugin is a shell action and
 * belongs to the app, and `exporting` has to stay true while the dialog is
 * open - the same reason `TrackerRowEditorStore.save` takes its reload
 * (ADR-0005, amendment six, third shape).
 */
export type TrackerSavePathChooser = (defaultName: string) => Promise<string | null>;

/**
 * The export dialog: which document to produce, and the two writes that
 * produce it.
 *
 * **This store injects `TranslateService`**, which is what ADR-0005 amendment
 * eight allows and this is the case it was allowed for. The Eigenbemuehungen
 * sheet is a document, not app chrome: its language follows the chosen market,
 * so a German sheet reads German out of an English app. The layer still never
 * notifies and never phrases an error - the toast and the dialog's open flag
 * stay on the page, which also labels the columns in the *UI* language for the
 * fit note beside them.
 *
 * Component-scoped.
 */
@Injectable()
export class TrackerReportStore {
  private readonly db = inject(DbService);
  private readonly i18n = inject(TranslateService);
  private readonly columnsStore = inject(TrackerColumnsStore);
  private readonly rowsStore = inject(TrackerRowsStore);

  readonly applicant = signal('');
  readonly market = signal<ReportMarket>('de');
  readonly landscape = signal(false);
  readonly mode = signal<ReportMode>('fit');
  readonly exporting = signal(false);

  /** The sheet's own language. `intl` prints English; every other market maps
   * to itself. Deliberately not the UI language. */
  readonly language = computed<SupportedLanguage>(() => (this.market() === 'de' ? 'de' : 'en'));

  /** Translates into the sheet's language rather than the app's. */
  private readonly t = computed(() => this.i18n.tFor(this.language()));

  /** The report mirrors the user's visible tracker columns, each labelled in
   * the report's language and carrying an estimated print width for A4 fit.
   * Custom columns keep the user's own wording - there is no translation. */
  readonly columns = computed<ReportColumn[]>(() => {
    const t = this.t();
    return this.columnsStore.visibleColumns().map((c) => ({
      id: c.key,
      label: c.custom ? (c.label ?? '') : t(c.labelKey ?? ''),
      type: c.type ?? 'text',
      width: trackerColumnWidth(c),
      custom: !!c.custom,
    }));
  });

  readonly fitInfo = computed(() => reportFit(this.columns(), this.landscape()));

  /** Printed ON the sheet, so it follows the report language, not the UI. */
  readonly periodLabel = computed(() => {
    const t = this.t();
    const range = this.rowsStore.range();
    if (range === 'all') return t('tracker.range_all');
    return range === 'month' ? t('tracker.range_month') : t('tracker.range_3months');
  });

  /**
   * Writes the CSV. Returns the path it was saved to, `null` when the user
   * cancelled the save or an export was already running. A gateway error
   * propagates.
   */
  async exportCsv(): Promise<string | null> {
    if (this.exporting()) return null;
    this.exporting.set(true);
    try {
      const stamp = this.stamp();
      const csv = buildTrackerCsv({
        columns: this.columns(),
        rows: this.rowsStore.reportRows(),
        periodLabel: this.periodLabel(),
        applicant: this.applicant(),
        generatedOn: stamp,
        t: this.t(),
      });
      return await this.db.exportReport(csv, 'csv', trackerReportBaseName(this.market(), stamp));
    } finally {
      this.exporting.set(false);
    }
  }

  /**
   * Renders the PDF from the preview's own DOM in a hidden window, so the file
   * equals the preview. Returns the path written, or `null` when the user
   * cancelled the Save dialog or an export was already running.
   *
   * The plain-text fallback goes along with it: Rust prints that when the
   * WYSIWYG render is unavailable, and it is a fixed seven-column layout rather
   * than the user's chosen columns.
   */
  async exportPdf(chooseSavePath: TrackerSavePathChooser): Promise<string | null> {
    if (this.exporting()) return null;
    this.exporting.set(true);
    try {
      const stamp = this.stamp();
      const savePath = await chooseSavePath(`${trackerReportBaseName(this.market(), stamp)}.pdf`);
      if (!savePath) return null;
      await this.db.trackerReportExportPdfWysiwyg({
        savePath,
        applicant: this.applicant(),
        period: this.rowsStore.range(),
        periodLabel: this.periodLabel(),
        market: this.market(),
        landscape: this.landscape(),
        mode: this.mode(),
        columns: JSON.stringify(this.columns()),
        fallbackContent: buildTrackerReportText(
          {
            rows: this.rowsStore.reportRows(),
            periodLabel: this.periodLabel(),
            applicant: this.applicant(),
            generatedOn: stamp,
            t: this.t(),
          },
          this.rowsStore.summary(),
        ),
      });
      return savePath;
    } finally {
      this.exporting.set(false);
    }
  }

  private stamp(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
