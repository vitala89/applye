import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Settings, TrackerRow } from '@applye/core';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';

type Range = 'month' | '3months' | 'all';
const RESPONDED = ['interview', 'offer', 'rejected'];

// Job Tracker: export/reporting over applications. This IS the Agentur fuer
// Arbeit "Eigenbemuehungen" report (ROADMAP §9). 0 tokens.
@Component({
  selector: 'app-tracker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './tracker.component.html',
  styleUrl: './tracker.component.scss',
})
export class TrackerComponent {
  private readonly db = inject(DbService);
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly rows = signal<TrackerRow[]>([]);
  readonly settings = signal<Settings | null>(null);
  readonly loading = signal(true);
  readonly range = signal<Range>('all');
  readonly statusFilter = signal<string>('');
  readonly exportMsg = signal('');
  readonly exporting = signal(false);

  readonly statuses = ['saved', 'applied', 'interview', 'offer', 'rejected'];
  readonly isGerman = computed(() => this.settings()?.uiLanguage === 'de');

  readonly view = computed(() => {
    const r = this.range();
    const sf = this.statusFilter();
    const min = this.rangeStart(r);
    return this.rows().filter((row) => {
      if (sf && (row.status ?? '') !== sf) return false;
      if (min && (row.appliedAt ?? '') < min) return false;
      return true;
    });
  });

  readonly summary = computed(() => {
    const rows = this.view();
    const total = rows.length;
    const responded = rows.filter((r) => RESPONDED.includes(r.status ?? ''));
    const rate = total ? Math.round((responded.length / total) * 100) : 0;
    const days = responded
      .map((r) => this.daysBetween(r.appliedAt, r.lastUpdate))
      .filter((d): d is number => d != null);
    const avg = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0;
    return { total, rate, avg };
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [rows, settings] = await Promise.all([this.db.trackerRows(), this.db.getSettings()]);
      this.rows.set(rows);
      this.settings.set(settings);
    } catch {
      this.rows.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private rangeStart(r: Range): string | null {
    if (r === 'all') return null;
    const now = new Date();
    if (r === 'month') {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }
    return new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  }

  private daysBetween(a?: string, b?: string): number | null {
    if (!a || !b) return null;
    const d = (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
    return Number.isFinite(d) && d >= 0 ? Math.round(d) : null;
  }

  async exportPdf(): Promise<void> {
    await this.doExport('pdf');
  }
  async exportCsv(): Promise<void> {
    await this.doExport('csv');
  }

  private async doExport(format: 'pdf' | 'csv'): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.exportMsg.set('');
    try {
      const content = format === 'csv' ? this.buildCsv() : this.buildReportText();
      const stamp = new Date().toISOString().slice(0, 10);
      const path = await this.db.exportReport(content, format, `eigenbemuehungen-${stamp}`);
      this.exportMsg.set(`${this.t()('tracker.saved_to')} ${path}`);
    } catch (e) {
      this.exportMsg.set(String(e));
    } finally {
      this.exporting.set(false);
    }
  }

  private buildCsv(): string {
    const head = [
      '#',
      this.t()('tracker.col_date'),
      this.t()('tracker.col_company'),
      this.t()('tracker.col_role'),
      this.t()('tracker.col_location'),
      this.t()('tracker.col_method'),
      this.t()('tracker.col_status'),
      this.t()('tracker.col_update'),
      this.t()('tracker.col_notes'),
    ];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = this.view().map((r, i) =>
      [
        i + 1,
        r.appliedAt ?? '',
        r.company ?? '',
        r.title ?? '',
        r.location ?? '',
        r.method ?? '',
        r.status ?? '',
        (r.lastUpdate ?? '').slice(0, 10),
        (r.notes ?? '').replace(/\n/g, ' '),
      ]
        .map((c) => esc(String(c)))
        .join(','),
    );
    return [head.map(esc).join(','), ...lines].join('\n');
  }

  /** Plain-line layout for the Agentur PDF (padded columns, headings via #/##). */
  private buildReportText(): string {
    const rows = this.view();
    const s = this.summary();
    const col = (v: string, w: number) => (v.length > w ? v.slice(0, w - 1) + '…' : v).padEnd(w);
    const header =
      col('#', 4) +
      col(this.t()('tracker.col_date'), 12) +
      col(this.t()('tracker.col_company'), 22) +
      col(this.t()('tracker.col_role'), 24) +
      col(this.t()('tracker.col_status'), 12);
    const body = rows.map(
      (r, i) =>
        col(String(i + 1), 4) +
        col(r.appliedAt ?? '', 12) +
        col(r.company ?? '', 22) +
        col(r.title ?? '', 24) +
        col(r.status ?? '', 12),
    );
    const period =
      this.range() === 'all'
        ? this.t()('tracker.range_all')
        : this.range() === 'month'
          ? this.t()('tracker.range_month')
          : this.t()('tracker.range_3months');
    return [
      `# ${this.t()('tracker.report_title')}`,
      `${this.t()('tracker.report_period')}: ${period}`,
      '',
      '## ' + this.t()('tracker.title'),
      header,
      ...body,
      '',
      `${this.t()('tracker.total')}: ${s.total}   ${this.t()('tracker.response_rate')}: ${s.rate}%   ${this.t()('tracker.avg_days')}: ${s.avg}`,
    ].join('\n');
  }
}
