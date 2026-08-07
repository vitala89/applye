import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
import type { ApplicationStatus, TrackerRow } from '@applye/core';
import {
  TrackerColumnDef,
  TrackerColumnsStore,
  TrackerReportStore,
  TrackerRowEditorStore,
  TrackerRowsStore,
  formatTrackerDate,
  trackerCellValue,
} from '@applye/application';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../core/toast/toast.service';
import { TrackerReportComponent } from './tracker-report.component';

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
  providers: [TrackerColumnsStore, TrackerRowsStore, TrackerRowEditorStore, TrackerReportStore],
})
export class TrackerComponent {
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

  /** One row's draft and the two writes that persist it. The row menu closes
   * from here; the store only knows which row is open. */
  protected readonly editor = inject(TrackerRowEditorStore);

  /** The export dialog's options and its two writes. **This one holds a
   * `TranslateService`** - the sheet is a document whose language follows the
   * chosen market, not the UI (ADR-0005, amendment eight). */
  protected readonly report = inject(TrackerReportStore);

  // Export-dialog aliases, for the same reason as the toolbar ones above: the
  // template is at its budget and `report.` in front of eleven bindings
  // re-wraps four of them.
  protected readonly applicantName = this.report.applicant;
  protected readonly reportMarket = this.report.market;
  protected readonly landscape = this.report.landscape;
  protected readonly reportMode = this.report.mode;
  protected readonly exporting = this.report.exporting;

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
  readonly menuId = signal<number | null>(null);
  readonly menuRow = signal<TrackerRow | null>(null);
  readonly menuPos = signal<{ top: number; left: number } | null>(null);
  readonly confirmId = signal<number | null>(null);

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
    this.report.market.set(this.rows.settings()?.uiLanguage === 'de' ? 'de' : 'intl');
  }

  /** Column labels stay on the page: the grid names a column in the UI language
   * and the report names the same column in its own, so the store holds the
   * column and the caller supplies the words (ADR-0005, amendment eight). */
  colLabel(col: TrackerColumnDef): string {
    return col.custom ? (col.label ?? '') : this.t()(col.labelKey ?? '');
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
  // Opening a row also closes the row menu, which is page state; the store only
  // knows which row is open.
  startEdit(row: TrackerRow): void {
    this.editor.start(row);
    this.closeMenus();
  }

  /** Reads the DOM event the store must not see, then delegates. */
  setDraft(col: TrackerColumnDef, e: Event): void {
    this.editor.setValue(col, (e.target as HTMLInputElement | HTMLSelectElement).value);
  }

  // The store writes and reports; the page decides what to say about it, and
  // supplies the reload, which refreshes the columns and the report market
  // alongside the rows (ADR-0005, amendments three and six).
  async saveEdit(): Promise<void> {
    try {
      if (await this.editor.save(() => this.load())) {
        this.toast.success(this.t()('tracker.saved'));
      }
    } catch (e) {
      this.toast.error(String(e));
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
   * second line (all mode), for the current orientation. Stays on the page
   * because it is dialog chrome rather than part of the sheet, so it names the
   * columns in the **UI** language even when the sheet itself is German. */
  fitNoteText(): string {
    const overflow = this.report.fitInfo().overflow;
    if (!overflow.length) return '';
    const uiLabels = new Map(this.columns.visibleColumns().map((c) => [c.key, this.colLabel(c)]));
    const cols = overflow.map((c) => uiLabels.get(c.id) ?? c.label).join(', ');
    const orient = this.t()(this.report.landscape() ? 'tracker.landscape' : 'tracker.portrait');
    const key = this.report.mode() === 'fit' ? 'tracker.fit_note_hidden' : 'tracker.fit_note_wrap';
    return this.t()(key)
      .replace('{n}', String(overflow.length))
      .replace('{orient}', orient)
      .replace('{cols}', cols);
  }

  // The store writes and reports; the page closes the dialog and picks the
  // wording (ADR-0005, amendment three).
  async exportCsv(): Promise<void> {
    try {
      const path = await this.report.exportCsv();
      this.showExport.set(false);
      if (path) this.toast.success(`${this.t()('tracker.saved_to')} ${path}`);
    } catch (e) {
      this.toast.error(String(e));
    }
  }

  /**
   * PDF renders the preview's own DOM (hidden print window) so the file matches
   * the preview exactly. The native Save dialog is a Tauri shell action and so
   * belongs to the app; it is handed to the store rather than called after it,
   * which is what keeps `exporting` true while the dialog is open.
   */
  async exportPdf(): Promise<void> {
    try {
      const path = await this.report.exportPdf(async (defaultPath) => {
        const { save } = await import('@tauri-apps/plugin-dialog');
        return save({ defaultPath, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      });
      if (!path) return; // cancelled
      this.showExport.set(false);
      this.toast.success(`${this.t()('tracker.saved_to')} ${path}`);
    } catch (e) {
      this.toast.error(String(e));
    }
  }
}
