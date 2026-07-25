import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import type { TrackerRow } from '@applye/core';
import { DbService } from '@applye/data';
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
 */
@Component({
  selector: 'app-tracker-report-print',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TrackerReportComponent],
  template: `
    @if (loaded()) {
      <app-tracker-report
        [rows]="rows()"
        [columns]="columns()"
        [applicant]="applicant()"
        [periodLabel]="periodLabel()"
        [market]="market()"
        [mode]="mode()"
        [landscape]="landscape()"
        [generatedOn]="generatedOn()"
        [total]="total()"
        [rate]="rate()"
        [avg]="avg()"
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
  private readonly db = inject(DbService);
  private readonly route = inject(ActivatedRoute);

  readonly loaded = signal(false);
  readonly rows = signal<TrackerRow[]>([]);
  readonly columns = signal<ReportColumn[]>([]);
  readonly applicant = signal('');
  readonly periodLabel = signal('');
  readonly market = signal<ReportMarket>('de');
  readonly mode = signal<ReportMode>('fit');
  readonly landscape = signal(false);
  readonly generatedOn = signal('');
  readonly total = signal(0);
  readonly rate = signal(0);
  readonly avg = signal(0);

  constructor() {
    void this.load();
  }

  private rangeStart(period: string): string | null {
    if (period === 'all') return null;
    const now = new Date();
    if (period === 'month') {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }
    return new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
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
    const period = q.get('period') ?? 'all';

    let all: TrackerRow[] = [];
    try {
      all = await this.db.trackerRows();
    } catch {
      all = [];
    }
    const min = this.rangeStart(period);
    const rows = all
      .filter((r) => !min || (r.appliedAt ?? '') >= min)
      .slice()
      .sort((a, b) => ((a.appliedAt ?? '') < (b.appliedAt ?? '') ? -1 : 1));
    this.rows.set(rows);

    const responded = rows.filter((r) =>
      ['interview', 'offer', 'rejected'].includes(r.status ?? ''),
    );
    const days = responded
      .map((r) => this.daysBetween(r.appliedAt, r.lastUpdate))
      .filter((d): d is number => d != null);
    this.total.set(rows.length);
    this.rate.set(rows.length ? Math.round((responded.length / rows.length) * 100) : 0);
    this.avg.set(days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0);

    this.loaded.set(true);
    await this.signalReady();
  }

  private daysBetween(a?: string, b?: string): number | null {
    if (!a || !b) return null;
    const d = (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
    return Number.isFinite(d) && d >= 0 ? Math.round(d) : null;
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
    await this.db.printWindowReady();
  }
}
