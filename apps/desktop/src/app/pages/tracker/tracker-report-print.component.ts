import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TrackerPrintStore } from '@applye/application';
import {
  ReportColumn,
  ReportMarket,
  ReportMode,
  TrackerReportComponent,
} from './tracker-report.component';

/**
 * Print-only report route (`print/tracker-report`), loaded by a HIDDEN Tauri
 * window during the silent WYSIWYG PDF export (`tracker_report_export_pdf_wysiwyg`).
 * Renders the SAME `<app-tracker-report>` as the export preview, so the saved
 * PDF IS the preview's render - then signals readiness to Rust once fonts and
 * layout have settled. Params (applicant, period, market) arrive as query args.
 *
 * The rows and their summary come from `TrackerPrintStore`, which shares its
 * period and summary rules with the tracker page's own store. They used to be a
 * second copy here, and two copies of "what the last three months means" with
 * no test on either is how the sheet and the screen come to disagree.
 */
@Component({
  selector: 'app-tracker-report-print',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TrackerReportComponent],
  providers: [TrackerPrintStore],
  template: `
    @if (loaded()) {
      <app-tracker-report
        [rows]="print.rows()"
        [columns]="columns()"
        [applicant]="applicant()"
        [periodLabel]="periodLabel()"
        [market]="market()"
        [mode]="mode()"
        [landscape]="landscape()"
        [generatedOn]="generatedOn()"
        [total]="print.summary().total"
        [rate]="print.summary().rate"
        [avg]="print.summary().avg"
        [print]="true"
      />
    }
  `,
  styles: [
    `
      :host {
        display: block;
        background: #fff;
      }
    `,
  ],
})
export class TrackerReportPrintComponent {
  private readonly route = inject(ActivatedRoute);
  protected readonly print = inject(TrackerPrintStore);

  readonly loaded = signal(false);
  readonly columns = signal<ReportColumn[]>([]);
  readonly applicant = signal('');
  readonly periodLabel = signal('');
  readonly market = signal<ReportMarket>('de');
  readonly mode = signal<ReportMode>('fit');
  readonly landscape = signal(false);
  readonly generatedOn = signal('');

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const q = this.route.snapshot.queryParamMap;
    this.applicant.set(q.get('applicant') ?? '');
    this.market.set((q.get('market') as ReportMarket) ?? 'de');
    this.mode.set((q.get('mode') as ReportMode) ?? 'fit');
    this.landscape.set(q.get('landscape') === 'true');
    this.periodLabel.set(q.get('periodLabel') ?? '');
    this.generatedOn.set(new Date().toISOString().slice(0, 10));
    try {
      this.columns.set(JSON.parse(q.get('columns') ?? '[]') as ReportColumn[]);
    } catch {
      this.columns.set([]);
    }

    await this.print.load(q.get('period') ?? 'all');

    this.loaded.set(true);
    await this.signalReady();
  }

  /** Wait for fonts + a settle tick, then tell Rust the DOM is safe to print.
   * Mirrors the CV print route; plain timeouts (an off-screen window throttles
   * rAF) with a hard cap so the export can never hang. */
  private async signalReady(): Promise<void> {
    const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | void> =>
      Promise.race([p, new Promise<void>((r) => setTimeout(r, ms))]);
    if (document.fonts) {
      await withTimeout(document.fonts.ready, 3000);
    }
    await new Promise((r) => setTimeout(r, 250));
    await new Promise((r) => setTimeout(r, 250));
    // Flags the print-media rules (styles.scss) that hide the app shell so only
    // the report sheet prints - same mechanism as the CV export.
    document.body.classList.add('printing-report');
    await new Promise((r) => setTimeout(r, 50));
    await this.print.markPrintWindowReady();
  }
}
