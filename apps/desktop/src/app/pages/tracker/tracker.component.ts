import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ApplicationTrackerFieldsInput, Settings, TrackerRow } from '@applye/core';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { ToastService } from '../../core/toast/toast.service';

type Range = 'month' | '3months' | 'all';
const RESPONDED = ['interview', 'offer', 'rejected'];

type EditableField =
  | 'contactName'
  | 'contactRole'
  | 'contactChannel'
  | 'nextAction'
  | 'nextActionAt'
  | 'salaryRange'
  | 'notes';

interface ColumnDef {
  key: string;
  labelKey: string;
  editable?: boolean;
  type?: 'date' | 'bool' | 'link';
}

// Job Tracker: 1:1 with the user's real xlsx tracker (19 fields). Export IS
// the Agentur fuer Arbeit "Eigenbemuehungen" report (ROADMAP §9). 0 tokens.
@Component({
  selector: 'app-tracker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ButtonDirective],
  templateUrl: './tracker.component.html',
  styleUrl: './tracker.component.scss',
})
export class TrackerComponent {
  private readonly db = inject(DbService);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;

  readonly rows = signal<TrackerRow[]>([]);
  readonly settings = signal<Settings | null>(null);
  readonly loading = signal(true);
  readonly range = signal<Range>('all');
  readonly statusFilter = signal<string>('');
  readonly exporting = signal(false);
  readonly applicantName = signal('');
  readonly columnMenuOpen = signal(false);

  readonly statuses = ['saved', 'applied', 'interview', 'offer', 'rejected', 'cancelled'];
  readonly isGerman = computed(() => this.settings()?.uiLanguage === 'de');

  readonly columns: ColumnDef[] = [
    { key: 'company', labelKey: 'tracker.col_company' },
    { key: 'title', labelKey: 'tracker.col_role' },
    { key: 'techStack', labelKey: 'tracker.col_tech_stack' },
    { key: 'location', labelKey: 'tracker.col_location' },
    { key: 'sourceUrl', labelKey: 'tracker.col_source_url', type: 'link' },
    { key: 'contactName', labelKey: 'tracker.col_contact_name', editable: true },
    { key: 'contactRole', labelKey: 'tracker.col_contact_role', editable: true },
    { key: 'contactChannel', labelKey: 'tracker.col_contact_channel', editable: true },
    { key: 'method', labelKey: 'tracker.col_method' },
    { key: 'appliedAt', labelKey: 'tracker.col_date' },
    { key: 'interview1At', labelKey: 'tracker.col_interview1' },
    { key: 'followUp2At', labelKey: 'tracker.col_followup2' },
    { key: 'status', labelKey: 'tracker.col_status' },
    { key: 'nextAction', labelKey: 'tracker.col_next_action', editable: true },
    { key: 'nextActionAt', labelKey: 'tracker.col_next_action_at', editable: true, type: 'date' },
    { key: 'salaryRange', labelKey: 'tracker.col_salary_range', editable: true },
    { key: 'contractType', labelKey: 'tracker.col_contract_type' },
    { key: 'blueCardEligible', labelKey: 'tracker.col_blue_card', type: 'bool' },
    { key: 'eorProvider', labelKey: 'tracker.col_eor_provider' },
    { key: 'notes', labelKey: 'tracker.col_notes', editable: true },
  ];

  readonly visibleColumns = signal<Record<string, boolean>>(
    Object.fromEntries(this.columns.map((c) => [c.key, true])),
  );

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

  isColumnVisible(key: string): boolean {
    return this.visibleColumns()[key] ?? true;
  }

  toggleColumn(key: string): void {
    this.visibleColumns.update((cols) => ({ ...cols, [key]: !cols[key] }));
  }

  toggleColumnMenu(): void {
    this.columnMenuOpen.update((open) => !open);
  }

  inputValue(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  /** Generic cell reader for the column loop — dates are sliced to
   * YYYY-MM-DD (also what a `type="date"` input expects as its value). */
  cellValue(row: TrackerRow, key: string): string {
    const v = (row as unknown as Record<string, unknown>)[key];
    if (v == null) return '';
    if (key.endsWith('At')) return String(v).slice(0, 10);
    return String(v);
  }

  /** Inline edit — patches only the tracker fields, never touching cv/cover
   * letter paths or application_method (see the Rust command doc comment). */
  patchField(row: TrackerRow, field: EditableField, value: string): void {
    const merged: TrackerRow = { ...row, [field]: value || undefined };
    this.rows.update((rs) => rs.map((r) => (r.id === row.id ? merged : r)));

    const input: ApplicationTrackerFieldsInput = {
      id: row.id,
      contactName: merged.contactName,
      contactRole: merged.contactRole,
      contactChannel: merged.contactChannel,
      nextAction: merged.nextAction,
      nextActionAt: merged.nextActionAt,
      salaryRange: merged.salaryRange,
      notes: merged.notes,
    };
    this.db.updateApplicationTrackerFields(input).catch(() => void this.load());
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
    try {
      const content = format === 'csv' ? this.buildCsv() : this.buildReportText();
      const stamp = new Date().toISOString().slice(0, 10);
      const path = await this.db.exportReport(content, format, `eigenbemuehungen-${stamp}`);
      this.toast.success(`${this.t()('tracker.saved_to')} ${path}`);
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.exporting.set(false);
    }
  }

  private periodLabel(): string {
    return this.range() === 'all'
      ? this.t()('tracker.range_all')
      : this.range() === 'month'
        ? this.t()('tracker.range_month')
        : this.t()('tracker.range_3months');
  }

  /** Combined contact cell for the official report: name + email/LinkedIn. */
  private contactDisplay(r: TrackerRow): string {
    return [r.contactName, r.contactChannel].filter(Boolean).join(' — ');
  }

  /** Official layout (ROADMAP §9): period, applicant, generated date, then
   * date applied / company / position / method / status / contact. */
  private buildCsv(): string {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const meta = [
      [this.t()('tracker.report_period'), this.periodLabel()],
      [this.t()('tracker.report_name'), this.applicantName()],
      [this.t()('tracker.report_generated'), new Date().toISOString().slice(0, 10)],
    ].map((row) => row.map((c) => esc(String(c))).join(','));

    const head = [
      '#',
      this.t()('tracker.col_date'),
      this.t()('tracker.col_company'),
      this.t()('tracker.col_role'),
      this.t()('tracker.col_method'),
      this.t()('tracker.col_status'),
      this.t()('tracker.col_contact'),
      this.t()('tracker.col_location'),
      this.t()('tracker.col_update'),
      this.t()('tracker.col_notes'),
    ];
    const lines = this.view().map((r, i) =>
      [
        i + 1,
        r.appliedAt ?? '',
        r.company ?? '',
        r.title ?? '',
        r.method ?? '',
        r.status ?? '',
        this.contactDisplay(r),
        r.location ?? '',
        (r.lastUpdate ?? '').slice(0, 10),
        (r.notes ?? '').replace(/\n/g, ' '),
      ]
        .map((c) => esc(String(c)))
        .join(','),
    );
    return [...meta, '', head.map(esc).join(','), ...lines].join('\n');
  }

  /** Plain-line layout for the Agentur PDF (padded columns, headings via #/##). */
  private buildReportText(): string {
    const rows = this.view();
    const s = this.summary();
    const col = (v: string, w: number) => (v.length > w ? v.slice(0, w - 1) + '…' : v).padEnd(w);
    const header =
      col('#', 4) +
      col(this.t()('tracker.col_date'), 12) +
      col(this.t()('tracker.col_company'), 20) +
      col(this.t()('tracker.col_role'), 20) +
      col(this.t()('tracker.col_method'), 12) +
      col(this.t()('tracker.col_status'), 11) +
      col(this.t()('tracker.col_contact'), 24);
    const body = rows.map(
      (r, i) =>
        col(String(i + 1), 4) +
        col(r.appliedAt ?? '', 12) +
        col(r.company ?? '', 20) +
        col(r.title ?? '', 20) +
        col(r.method ?? '', 12) +
        col(r.status ?? '', 11) +
        col(this.contactDisplay(r), 24),
    );
    return [
      `# ${this.t()('tracker.report_title')}`,
      `${this.t()('tracker.report_period')}: ${this.periodLabel()}`,
      `${this.t()('tracker.report_name')}: ${this.applicantName()}`,
      `${this.t()('tracker.report_generated')}: ${new Date().toISOString().slice(0, 10)}`,
      '',
      '## ' + this.t()('tracker.title'),
      header,
      ...body,
      '',
      `${this.t()('tracker.total')}: ${s.total}   ${this.t()('tracker.response_rate')}: ${s.rate}%   ${this.t()('tracker.avg_days')}: ${s.avg}`,
    ].join('\n');
  }
}
