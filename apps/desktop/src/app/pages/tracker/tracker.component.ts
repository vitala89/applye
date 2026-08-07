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
  SupportedLanguage,
  TrackerRow,
} from '@applye/core';
import {
  TrackerColumnDef,
  TrackerColumnsStore,
  TrackerRowsStore,
  formatTrackerDate,
  trackerCellValue,
  trackerColumnWidth,
  trackerCustomValues,
  trackerFieldText,
} from '@applye/application';
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
  providers: [TrackerColumnsStore, TrackerRowsStore],
})
export class TrackerComponent {
  private readonly db = inject(DbService);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly t = this.i18n.t;

  /** Which columns exist and which are showing. The page labels them - the
   * store holds no `TranslateService`, because the same column list is rendered
   * in the UI language here and in the report's own language on the sheet. */
  protected readonly columns = inject(TrackerColumnsStore);

  /** The rows, the toolbar that narrows them, and the archive and delete
   * writes. The row menu, the delete confirmation and every toast stay here. */
  protected readonly rows = inject(TrackerRowsStore);

  /**
   * Read-only aliases onto the store, for the toolbar signals and the summary
   * the template binds most. Same device as `t` above. **They alias; they hold
   * nothing** - `segment.set(...)` writes straight through to the store.
   *
   * They exist because the template is already 557/300 and the ratchet refuses
   * to let an over-budget file grow: prefixing these fifteen bindings with
   * `rows.` pushed four of them past the print width, and prettier re-wrapped
   * them into twelve extra lines. Cutting the template is a separate phase, so
   * this keeps it byte-neutral rather than borrowing against that.
   */
  protected readonly summary = this.rows.summary;
  protected readonly segment = this.rows.segment;
  protected readonly range = this.rows.range;
  protected readonly statusFilter = this.rows.statusFilter;

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
  readonly applicantName = signal('');
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
    this.columns.visibleColumns().map((c) => ({
      id: c.key,
      label: this.reportColLabel(c),
      type: c.type ?? 'text',
      width: trackerColumnWidth(c),
      custom: !!c.custom,
    })),
  );
  readonly reportFitInfo = computed(() => reportFit(this.reportColumns(), this.landscape()));

  readonly statuses: ApplicationStatus[] = [
    'saved',
    'applied',
    'interview',
    'offer',
    'rejected',
    'cancelled',
  ];

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    await Promise.all([this.rows.load(), this.columns.load()]);
    // Default the report market to Germany when the app language is German
    // (the Eigenbemuehungen document is a German-office artefact). A failed
    // read leaves the market alone rather than defaulting it from nothing,
    // which is why the store separates that from a database with no settings.
    if (this.rows.loadError()) return;
    this.reportMarket.set(this.rows.settings()?.uiLanguage === 'de' ? 'de' : 'intl');
  }

  /** Column labels stay on the page: the grid names a column in the UI language
   * and the report names the same column in its own, so the store holds the
   * column and the caller supplies the words (ADR-0005, amendment eight). */
  colLabel(col: TrackerColumnDef): string {
    return col.custom ? (col.label ?? '') : this.t()(col.labelKey ?? '');
  }

  /** Same column, labelled in the REPORT's language. Custom columns keep the
   * user's own wording - we have no translation for those. */
  private reportColLabel(col: TrackerColumnDef): string {
    return col.custom ? (col.label ?? '') : this.reportT()(col.labelKey ?? '');
  }

  // Template-side delegates to the pure column module, which a template cannot
  // import directly.
  cellValue(row: TrackerRow, col: TrackerColumnDef): string {
    return trackerCellValue(row, col);
  }
  fmtDate(v: string): string {
    return formatTrackerDate(v);
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
    this.draftCustom.set({ ...trackerCustomValues(row) });
    this.editId.set(row.id);
    this.closeMenus();
  }
  cancelEdit(): void {
    this.editId.set(null);
    this.draft.set(null);
  }
  draftValue(col: TrackerColumnDef): string {
    const d = this.draft();
    if (!d) return '';
    if (col.custom) return this.draftCustom()[col.key] ?? '';
    return trackerFieldText(d as unknown as Record<string, unknown>, col);
  }
  setDraft(col: TrackerColumnDef, e: Event): void {
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
      const original = this.rows.all().find((r) => r.id === d.id);
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
      await this.rows.setArchived(row, archived);
      this.toast.success(this.t()(archived ? 'tracker.archived_ok' : 'tracker.restored_ok'));
    } catch (e) {
      this.toast.error(String(e));
    }
  }

  askRemove(row: TrackerRow): void {
    this.confirmId.set(row.id);
  }
  async confirmRemove(row: TrackerRow): Promise<void> {
    // Guarded here as well as in the store, and deliberately before the `try`:
    // the store's check decides whether to write, this one decides whether the
    // confirmation closes, and the page has always left it open for a row with
    // no job behind it.
    if (row.jobId == null) return;
    try {
      if (await this.rows.remove(row)) this.toast.success(this.t()('tracker.removed'));
    } catch (e) {
      this.toast.error(String(e));
    } finally {
      this.closeMenus();
    }
  }

  // ---------- custom columns ----------
  // The store writes and reports; the page decides what to say about it
  // (ADR-0005, amendment three).
  async addCustomColumn(): Promise<void> {
    try {
      if (await this.columns.addColumn()) this.toast.success(this.t()('tracker.custom_added'));
    } catch (e) {
      this.toast.error(String(e));
    }
  }
  async removeCustomColumn(id: string): Promise<void> {
    try {
      await this.columns.removeColumn(id);
    } catch (e) {
      this.toast.error(String(e));
    }
  }

  // ---------- export ----------
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
    const uiLabels = new Map(this.columns.visibleColumns().map((c) => [c.key, this.colLabel(c)]));
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
    return this.rows.range() === 'all'
      ? rt('tracker.range_all')
      : this.rows.range() === 'month'
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
        period: this.rows.range(),
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
      const v = trackerCustomValues(r)[col.id] ?? '';
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
    const lines = this.rows
      .reportRows()
      .map((r, i) => [String(i + 1), ...cols.map((c) => this.csvCell(r, c))].map(esc).join(','));
    return [...meta, '', head.map(esc).join(','), ...lines].join('\n');
  }
  private buildReportText(): string {
    const rows = this.rows.reportRows();
    const s = this.rows.summary();
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
