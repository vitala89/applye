import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  Activity,
  Archive,
  ArchiveRestore,
  ArrowUpRight,
  Check,
  CircleCheck,
  Clock,
  Columns3,
  FileCheck2,
  FileDown,
  Info,
  Layers,
  LucideAngularModule,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Table,
  Table2,
  Trash2,
  X,
} from 'lucide-angular';
import type {
  ApplicationStatus,
  ApplicationTrackerFieldsInput,
  Settings,
  SupportedLanguage,
  TrackerCustomColumn,
  TrackerRow,
} from '@applye/core';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../core/toast/toast.service';
import {
  ReportColumn,
  ReportMarket,
  ReportMode,
  reportFit,
  TrackerReportComponent,
} from './tracker-report.component';

type Range = 'month' | '3months' | 'all';
type Segment = 'active' | 'archived';
type ColType = 'text' | 'date' | 'number' | 'yesno' | 'select' | 'status' | 'link' | 'stage';
const RESPONDED = ['interview', 'offer', 'rejected'];

/** A rendered column - a built-in field or a user-defined custom column. */
interface ColumnDef {
  key: string;
  labelKey?: string;
  label?: string; // custom columns carry a literal label
  src: 'job' | 'app';
  editable?: boolean;
  type?: ColType;
  essential?: boolean;
  pin?: boolean;
  custom?: boolean;
}

// Job Tracker: 1:1 with the user's real xlsx tracker. Export IS the Agentur
// fuer Arbeit "Eigenbemuehungen" report (ROADMAP §9). 0 tokens. This screen is
// the design in docs/design/job-tracker-screen-brief.md → Job Tracker.dc.html.
@Component({
  selector: 'app-tracker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, TrackerReportComponent],
  templateUrl: './tracker.component.html',
  styleUrl: './tracker.component.scss',
})
export class TrackerComponent {
  private readonly db = inject(DbService);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly t = this.i18n.t;

  readonly icons = {
    fileDown: FileDown,
    columns: Columns3,
    pencil: Pencil,
    sparkles: Sparkles,
    menu: MoreHorizontal,
    check: Check,
    close: X,
    trash: Trash2,
    archive: Archive,
    restore: ArchiveRestore,
    link: ArrowUpRight,
    info: Info,
    empty: Table2,
    layers: Layers,
    activity: Activity,
    clock: Clock,
    reportOk: FileCheck2,
    table: Table,
    ok: CircleCheck,
    plus: Plus,
  };

  // ---- data ----
  readonly rows = signal<TrackerRow[]>([]);
  readonly customCols = signal<TrackerCustomColumn[]>([]);
  readonly settings = signal<Settings | null>(null);
  readonly loading = signal(true);

  // ---- toolbar / filters ----
  readonly segment = signal<Segment>('active');
  readonly range = signal<Range>('3months');
  readonly statusFilter = signal<string>('');
  readonly applicantName = signal('');

  // ---- panels / row state ----
  readonly showCols = signal(false);
  readonly showExport = signal(false);
  readonly editId = signal<number | null>(null);
  readonly draft = signal<TrackerRow | null>(null);
  readonly draftCustom = signal<Record<string, string>>({});
  readonly menuId = signal<number | null>(null);
  readonly menuRow = signal<TrackerRow | null>(null);
  readonly menuPos = signal<{ top: number; left: number } | null>(null);
  readonly confirmId = signal<number | null>(null);
  readonly saving = signal(false);
  readonly exporting = signal(false);

  // ---- export options ----
  readonly reportMarket = signal<ReportMarket>('de');
  readonly landscape = signal(false);
  readonly reportMode = signal<ReportMode>('fit');

  /** The report is a document in its own language, not app chrome: the German
   * Eigenbemuehungen sheet must read German even when the UI runs in English.
   * The chosen market therefore drives every string ON the sheet - headings,
   * column labels and the period - while the surrounding export dialog stays
   * in the UI language. */
  readonly reportLang = computed<SupportedLanguage>(() =>
    this.reportMarket() === 'de' ? 'de' : 'en',
  );
  private readonly reportT = computed(() => this.i18n.tFor(this.reportLang()));

  /** The report mirrors the user's visible tracker columns (built-in + custom
   * + Next Interview), each with an estimated print width for A4 fit. */
  readonly reportColumns = computed<ReportColumn[]>(() =>
    this.visibleColumns().map((c) => ({
      id: c.key,
      label: this.reportColLabel(c),
      type: c.custom ? (c.type ?? 'text') : (c.type ?? 'text'),
      width: this.colWidth(c),
      custom: !!c.custom,
    })),
  );
  readonly reportFitInfo = computed(() => reportFit(this.reportColumns(), this.landscape()));

  // ---- add-custom-column form ----
  readonly newColName = signal('');
  readonly newColType = signal<TrackerCustomColumn['type']>('text');

  readonly statuses: ApplicationStatus[] = [
    'saved',
    'applied',
    'interview',
    'offer',
    'rejected',
    'cancelled',
  ];
  readonly isGerman = computed(() => this.settings()?.uiLanguage === 'de');

  readonly baseColumns: ColumnDef[] = [
    { key: 'company', labelKey: 'tracker.col_company', src: 'job', essential: true, pin: true },
    { key: 'title', labelKey: 'tracker.col_role', src: 'job', essential: true },
    {
      key: 'status',
      labelKey: 'tracker.col_status',
      src: 'app',
      editable: true,
      type: 'status',
      essential: true,
    },
    { key: 'appliedAt', labelKey: 'tracker.col_date', src: 'app', type: 'date', essential: true },
    {
      key: 'nextAction',
      labelKey: 'tracker.col_next_action',
      src: 'app',
      editable: true,
      type: 'text',
      essential: true,
    },
    {
      key: 'nextActionAt',
      labelKey: 'tracker.col_next_action_at',
      src: 'app',
      editable: true,
      type: 'date',
      essential: true,
    },
    {
      key: 'nextStage',
      labelKey: 'tracker.col_next_stage',
      src: 'app',
      type: 'stage',
      essential: true,
    },
    { key: 'techStack', labelKey: 'tracker.col_tech_stack', src: 'job' },
    { key: 'location', labelKey: 'tracker.col_location', src: 'job' },
    { key: 'sourceUrl', labelKey: 'tracker.col_source_url', src: 'job', type: 'link' },
    { key: 'contactName', labelKey: 'tracker.col_contact_name', src: 'app', editable: true },
    { key: 'contactRole', labelKey: 'tracker.col_contact_role', src: 'app', editable: true },
    { key: 'contactChannel', labelKey: 'tracker.col_contact_channel', src: 'app', editable: true },
    { key: 'method', labelKey: 'tracker.col_method', src: 'app' },
    { key: 'interview1At', labelKey: 'tracker.col_interview1', src: 'app', type: 'date' },
    { key: 'followUp2At', labelKey: 'tracker.col_followup2', src: 'app', type: 'date' },
    { key: 'salaryRange', labelKey: 'tracker.col_salary_range', src: 'app', editable: true },
    { key: 'contractType', labelKey: 'tracker.col_contract_type', src: 'app' },
    { key: 'blueCardEligible', labelKey: 'tracker.col_blue_card', src: 'job', type: 'yesno' },
    { key: 'eorProvider', labelKey: 'tracker.col_eor_provider', src: 'app' },
    { key: 'notes', labelKey: 'tracker.col_notes', src: 'app', editable: true },
  ];

  readonly essentialKeys = new Set(this.baseColumns.filter((c) => c.essential).map((c) => c.key));

  readonly colState = signal<Record<string, boolean>>(
    Object.fromEntries(this.baseColumns.map((c) => [c.key, !!c.essential])),
  );

  /** Built-in visible columns, then every custom column (custom cols always show). */
  readonly visibleColumns = computed<ColumnDef[]>(() => {
    const state = this.colState();
    const base = this.baseColumns.filter((c) => state[c.key]);
    const custom: ColumnDef[] = this.customCols().map((c) => ({
      key: c.id,
      label: c.label,
      src: 'app',
      editable: true,
      type: c.type,
      custom: true,
    }));
    return [...base, ...custom];
  });

  readonly optionalColumns = computed(() => this.baseColumns.filter((c) => !c.essential));
  readonly essentialColumns = computed(() => this.baseColumns.filter((c) => c.essential));

  readonly activeCount = computed(() => this.rows().filter((r) => !r.archived).length);
  readonly archivedCount = computed(() => this.rows().filter((r) => r.archived).length);

  /** Grid rows: current segment + status filter + period. */
  readonly view = computed(() => {
    const seg = this.segment();
    const sf = this.statusFilter();
    const min = this.rangeStart(this.range());
    return this.rows().filter((r) => {
      if (seg === 'archived' ? !r.archived : r.archived) return false;
      if (sf && (r.status ?? '') !== sf) return false;
      if (min && (r.appliedAt ?? '') < min) return false;
      return true;
    });
  });

  /** Report rows: period-filtered, archived included, oldest first. */
  readonly reportRows = computed(() => {
    const min = this.rangeStart(this.range());
    return this.rows()
      .filter((r) => !min || (r.appliedAt ?? '') >= min)
      .slice()
      .sort((a, b) => ((a.appliedAt ?? '') < (b.appliedAt ?? '') ? -1 : 1));
  });

  readonly summary = computed(() => {
    const rows = this.reportRows();
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
      const [rows, cols, settings] = await Promise.all([
        this.db.trackerRows(),
        this.db.trackerCustomColumns(),
        this.db.getSettings(),
      ]);
      this.rows.set(rows);
      this.customCols.set(cols);
      this.settings.set(settings);
      // Default the report market to Germany when the app language is German
      // (the Eigenbemuehungen document is a German-office artefact).
      this.reportMarket.set(settings?.uiLanguage === 'de' ? 'de' : 'intl');
    } catch {
      this.rows.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  colLabel(col: ColumnDef): string {
    return col.custom ? (col.label ?? '') : this.t()(col.labelKey ?? '');
  }

  /** Same column, labelled in the REPORT's language. Custom columns keep the
   * user's own wording - we have no translation for those. */
  private reportColLabel(col: ColumnDef): string {
    return col.custom ? (col.label ?? '') : this.reportT()(col.labelKey ?? '');
  }

  /** Rough print width (mm) per column, for the A4 fit calculation. */
  private colWidth(col: ColumnDef): number {
    if (col.custom) return 30;
    const byKey: Record<string, number> = {
      company: 34,
      title: 40,
      status: 22,
      appliedAt: 22,
      nextAction: 36,
      nextActionAt: 26,
      nextStage: 34,
      techStack: 38,
      location: 28,
      sourceUrl: 22,
      contactName: 34,
      contactRole: 26,
      contactChannel: 34,
      method: 18,
      interview1At: 22,
      followUp2At: 24,
      salaryRange: 26,
      contractType: 22,
      blueCardEligible: 22,
      eorProvider: 22,
      notes: 44,
    };
    return byKey[col.key] ?? 28;
  }
  isColumnVisible(key: string): boolean {
    return this.colState()[key] ?? false;
  }
  toggleColumn(key: string): void {
    this.colState.update((c) => ({ ...c, [key]: !c[key] }));
  }

  private customValues(row: TrackerRow): Record<string, string> {
    if (!row.customFields) return {};
    try {
      return JSON.parse(row.customFields) as Record<string, string>;
    } catch {
      return {};
    }
  }
  cellValue(row: TrackerRow, col: ColumnDef): string {
    if (col.custom) return this.customValues(row)[col.key] ?? '';
    const v = (row as unknown as Record<string, unknown>)[col.key];
    if (v == null) return '';
    if (col.type === 'yesno') return v ? 'yes' : 'no';
    if (col.key.endsWith('At')) return String(v).slice(0, 10);
    return String(v);
  }

  fmtDate(v: string): string {
    if (!v) return '';
    const [y, m, d] = v.slice(0, 10).split('-');
    const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return m ? `${d} ${mo[+m - 1]} ${y.slice(2)}` : v;
  }
  statusLabel(v?: string): string {
    return v ? this.t()('status.' + v) : '·';
  }

  // ---------- row link ----------
  openJob(row: TrackerRow): void {
    if (row.jobId == null) return;
    void this.router.navigate(['/jobs', row.jobId]);
  }

  // ---------- editing ----------
  isEditing(row: TrackerRow): boolean {
    return this.editId() === row.id;
  }
  startEdit(row: TrackerRow): void {
    this.draft.set({ ...row });
    this.draftCustom.set({ ...this.customValues(row) });
    this.editId.set(row.id);
    this.closeMenus();
  }
  cancelEdit(): void {
    this.editId.set(null);
    this.draft.set(null);
  }
  draftValue(col: ColumnDef): string {
    const d = this.draft();
    if (!d) return '';
    if (col.custom) return this.draftCustom()[col.key] ?? '';
    const v = (d as unknown as Record<string, unknown>)[col.key];
    if (v == null) return '';
    if (col.type === 'yesno') return v ? 'yes' : 'no';
    if (col.key.endsWith('At')) return String(v).slice(0, 10);
    return String(v);
  }
  setDraft(col: ColumnDef, e: Event): void {
    const value = (e.target as HTMLInputElement | HTMLSelectElement).value;
    if (col.custom) {
      this.draftCustom.update((m) => ({ ...m, [col.key]: value }));
      return;
    }
    this.draft.update((d) => (d ? { ...d, [col.key]: value } : d));
  }

  async saveEdit(): Promise<void> {
    const d = this.draft();
    if (!d || this.saving()) return;
    this.saving.set(true);
    const custom = this.draftCustom();
    const input: ApplicationTrackerFieldsInput = {
      id: d.id,
      contactName: d.contactName || undefined,
      contactRole: d.contactRole || undefined,
      contactChannel: d.contactChannel || undefined,
      nextAction: d.nextAction || undefined,
      nextActionAt: d.nextActionAt || undefined,
      salaryRange: d.salaryRange || undefined,
      notes: d.notes || undefined,
      customFields: JSON.stringify(custom),
    };
    try {
      await this.db.updateApplicationTrackerFields(input);
      const original = this.rows().find((r) => r.id === d.id);
      if (d.status && d.status !== original?.status) {
        await this.db.setApplicationStatus(d.id, d.status as ApplicationStatus);
      }
      this.editId.set(null);
      this.draft.set(null);
      await this.load();
      this.toast.success(this.t()('tracker.saved'));
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.saving.set(false);
    }
  }

  // ---------- row menu / archive / remove ----------
  /** Opens the row menu as a FIXED-position popup anchored to the trigger, so
   * it escapes the table's overflow/sticky clipping (a positioned popup inside
   * an overflow-scroll ancestor gets cut off). */
  toggleMenu(row: TrackerRow, event: Event): void {
    if (this.menuId() === row.id) {
      this.closeMenus();
      return;
    }
    const el = event.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    this.menuPos.set({ top: r.bottom + 4, left: Math.max(8, r.right - 200) });
    this.menuRow.set(row);
    this.menuId.set(row.id);
    this.confirmId.set(null);
  }
  closeMenus(): void {
    this.menuId.set(null);
    this.menuRow.set(null);
    this.menuPos.set(null);
    this.confirmId.set(null);
  }

  async setArchived(row: TrackerRow, archived: boolean): Promise<void> {
    this.closeMenus();
    try {
      await this.db.setApplicationArchived(row.id, archived);
      this.rows.update((rs) => rs.map((r) => (r.id === row.id ? { ...r, archived } : r)));
      this.toast.success(this.t()(archived ? 'tracker.archived_ok' : 'tracker.restored_ok'));
    } catch (e) {
      this.toast.error(String(e));
    }
  }

  askRemove(row: TrackerRow): void {
    this.confirmId.set(row.id);
  }
  async confirmRemove(row: TrackerRow): Promise<void> {
    if (row.jobId == null) return;
    try {
      await this.db.deleteJob(row.jobId);
      this.rows.update((rs) => rs.filter((r) => r.id !== row.id));
      this.toast.success(this.t()('tracker.removed'));
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.closeMenus();
    }
  }

  // ---------- custom columns ----------
  async addCustomColumn(): Promise<void> {
    const label = this.newColName().trim();
    if (!label) return;
    const id = 'cf_' + Date.now();
    const type = this.newColType();
    try {
      const col = await this.db.addTrackerCustomColumn(id, label, type);
      this.customCols.update((cs) => [...cs, col]);
      this.newColName.set('');
      this.newColType.set('text');
      this.toast.success(this.t()('tracker.custom_added'));
    } catch (e) {
      this.toast.error(String(e));
    }
  }
  async removeCustomColumn(id: string): Promise<void> {
    try {
      await this.db.removeTrackerCustomColumn(id);
      this.customCols.update((cs) => cs.filter((c) => c.id !== id));
    } catch (e) {
      this.toast.error(String(e));
    }
  }

  // ---------- export ----------
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
  today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Human note about A4 fit: which columns are hidden (fit mode) or wrap to a
   * second line (all mode), for the current orientation. */
  fitNoteText(): string {
    const overflow = this.reportFitInfo().overflow;
    if (!overflow.length) return '';
    // The note is dialog chrome, not part of the sheet, so it names the columns
    // in the UI language even when the sheet itself is German.
    const uiLabels = new Map(this.visibleColumns().map((c) => [c.key, this.colLabel(c)]));
    const cols = overflow.map((c) => uiLabels.get(c.id) ?? c.label).join(', ');
    const orient = this.t()(this.landscape() ? 'tracker.landscape' : 'tracker.portrait');
    const key = this.reportMode() === 'fit' ? 'tracker.fit_note_hidden' : 'tracker.fit_note_wrap';
    return this.t()(key)
      .replace('{n}', String(overflow.length))
      .replace('{orient}', orient)
      .replace('{cols}', cols);
  }
  periodLabelPublic(): string {
    return this.periodLabel();
  }
  /** Printed ON the sheet, so it follows the report language, not the UI. */
  private periodLabel(): string {
    const rt = this.reportT();
    return this.range() === 'all'
      ? rt('tracker.range_all')
      : this.range() === 'month'
        ? rt('tracker.range_month')
        : rt('tracker.range_3months');
  }

  private reportBase(): string {
    const stamp = new Date().toISOString().slice(0, 10);
    return this.reportMarket() === 'de'
      ? `eigenbemuehungen-${stamp}`
      : `job-application-report-${stamp}`;
  }

  /** CSV stays the plain deterministic export (spreadsheet-friendly). */
  async exportCsv(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    try {
      const path = await this.db.exportReport(this.buildCsv(), 'csv', this.reportBase());
      this.showExport.set(false);
      if (path) this.toast.success(`${this.t()('tracker.saved_to')} ${path}`);
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.exporting.set(false);
    }
  }

  /** PDF renders the preview's own DOM (hidden print window) so the file
   * matches the preview exactly. Path chosen via the native Save dialog. */
  async exportPdf(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({
        defaultPath: `${this.reportBase()}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (!path) return; // cancelled
      await this.db.trackerReportExportPdfWysiwyg({
        savePath: path,
        applicant: this.applicantName(),
        period: this.range(),
        periodLabel: this.periodLabel(),
        market: this.reportMarket(),
        landscape: this.landscape(),
        mode: this.reportMode(),
        columns: JSON.stringify(this.reportColumns()),
        fallbackContent: this.buildReportText(),
      });
      this.showExport.set(false);
      this.toast.success(`${this.t()('tracker.saved_to')} ${path}`);
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.exporting.set(false);
    }
  }

  private contactDisplay(r: TrackerRow): string {
    return [r.contactName, r.contactChannel].filter(Boolean).join(' - ');
  }
  /** CSV cell value for a report column - a spreadsheet has no width limit, so
   * CSV always includes every visible column (no A4 fit dropping). */
  private csvCell(r: TrackerRow, col: ReportColumn): string {
    const rec = r as unknown as Record<string, unknown>;
    if (col.custom) {
      const v = this.customValues(r)[col.id] ?? '';
      return col.type === 'date' && v ? v.slice(0, 10) : v;
    }
    switch (col.type) {
      case 'status':
        return r.status ? this.reportT()('status.' + r.status) : '';
      case 'stage':
        return r.nextStageLabel
          ? `${r.nextStageLabel}${r.nextStageAt ? ' ' + r.nextStageAt.slice(0, 10) : ''}`
          : '';
      case 'link':
        return r.sourceUrl ?? '';
      case 'yesno':
        return rec[col.id] == null ? '' : rec[col.id] ? 'yes' : 'no';
      case 'date':
        return rec[col.id] ? String(rec[col.id]).slice(0, 10) : '';
      default:
        return rec[col.id] != null ? String(rec[col.id]).replace(/\n/g, ' ') : '';
    }
  }
  private buildCsv(): string {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const cols = this.reportColumns();
    const rt = this.reportT();
    const meta = [
      [rt('tracker.report_period'), this.periodLabel()],
      [rt('tracker.report_name'), this.applicantName()],
      [rt('tracker.report_generated'), new Date().toISOString().slice(0, 10)],
    ].map((row) => row.map((c) => esc(String(c))).join(','));
    const head = ['#', ...cols.map((c) => c.label)];
    const lines = this.reportRows().map((r, i) =>
      [String(i + 1), ...cols.map((c) => this.csvCell(r, c))].map(esc).join(','),
    );
    return [...meta, '', head.map(esc).join(','), ...lines].join('\n');
  }
  private buildReportText(): string {
    const rows = this.reportRows();
    const s = this.summary();
    const col = (v: string, w: number) => (v.length > w ? v.slice(0, w - 1) + '…' : v).padEnd(w);
    const rt = this.reportT();
    const header =
      col('#', 4) +
      col(rt('tracker.col_date'), 12) +
      col(rt('tracker.col_company'), 20) +
      col(rt('tracker.col_role'), 20) +
      col(rt('tracker.col_method'), 12) +
      col(rt('tracker.col_status'), 11) +
      col(rt('tracker.col_contact'), 24);
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
      `# ${rt('tracker.report_title')}`,
      `${rt('tracker.report_period')}: ${this.periodLabel()}`,
      `${rt('tracker.report_name')}: ${this.applicantName()}`,
      `${rt('tracker.report_generated')}: ${new Date().toISOString().slice(0, 10)}`,
      '',
      '## ' + rt('tracker.title'),
      header,
      ...body,
      '',
      `${rt('tracker.total')}: ${s.total}   ${rt('tracker.response_rate')}: ${s.rate}%   ${rt('tracker.avg_days')}: ${s.avg}`,
    ].join('\n');
  }
}
