import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  Archive,
  ArrowUpRight,
  Columns3,
  FileDown,
  Info,
  LucideAngularModule,
  Pencil,
  Sparkles,
  Table2,
} from 'lucide-angular';
import type { ApplicationStatus, TrackerRow } from '@applye/core';
import {
  TrackerColumnsStore,
  TrackerReportStore,
  TrackerRowEditorStore,
  TrackerRowsStore,
} from '@applye/application';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '@applye/application';
import { TrackerColumnDrawerComponent } from './tracker-column-drawer/tracker-column-drawer.component';
import { TrackerTableComponent } from './tracker-table/tracker-table.component';
import { TrackerRowMenuComponent } from './tracker-row-menu/tracker-row-menu.component';
import { TrackerSummaryStripComponent } from './tracker-summary-strip/tracker-summary-strip.component';
import { TrackerExportModalComponent } from './tracker-export-modal/tracker-export-modal.component';

// Job Tracker: 1:1 with the user's real xlsx tracker. Export IS the Agentur
// fuer Arbeit "Eigenbemuehungen" report (ROADMAP §9). 0 tokens. This screen is
// the design in docs/design/job-tracker-screen-brief.md → Job Tracker.dc.html.
@Component({
  selector: 'app-tracker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    LucideAngularModule,
    TrackerColumnDrawerComponent,
    TrackerExportModalComponent,
    TrackerRowMenuComponent,
    TrackerSummaryStripComponent,
    TrackerTableComponent,
  ],
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
   * They existed because the template was 557/300 and the ratchet refuses to
   * let an over-budget file grow: prefixing these bindings with `rows.` pushed
   * four of them past the print width, and prettier re-wrapped them into twelve
   * extra lines. The template is 278 now, so the reason has weakened rather
   * than vanished - three of the four are still bound six, one and one times by
   * the toolbar, and `summary` left with the strip that used it (ADR-0005,
   * amendment twenty-two).
   */
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

  // The five export-dialog aliases that stood here are gone with the dialog
  // (ADR-0005, amendment twenty-one). They existed only because this template
  // was at its budget and `report.` in front of eleven bindings re-wrapped four
  // of them - inside `tracker-export-modal/` there is no such pressure, so it
  // binds the store directly and the page holds nothing on the dialog's behalf.

  readonly icons = {
    fileDown: FileDown,
    columns: Columns3,
    pencil: Pencil,
    sparkles: Sparkles,
    archive: Archive,
    link: ArrowUpRight,
    info: Info,
    empty: Table2,
  };
  // `reportOk`, `table` and `plus` left with the dialog and the drawer that
  // used them. `ok: CircleCheck` went too, and that one was already dead before
  // this branch - nothing referenced it on `main` either (ADR-0005, amendment
  // twenty-two).

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

  // `colLabel`, `cellValue`, `fmtDate` and `statusLabel` moved into
  // `tracker-table/` with the only markup that called them. `setDraft` went with
  // them for the same reason (ADR-0005, amendment twenty-two).

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
  toggleMenu(row: TrackerRow, trigger: HTMLElement): void {
    if (this.menuId() === row.id) {
      this.closeMenus();
      return;
    }
    const r = trigger.getBoundingClientRect();
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
  // Both writes moved into `tracker-column-drawer/` with the markup that calls
  // them (ADR-0005, amendment twenty-two).

  // ---------- export ----------
  // `today()`, `fitNoteText()` and the two export writes moved into
  // `tracker-export-modal/` with the dialog they belong to. Their comments here
  // had said they lived on the page because "the page closes the dialog and
  // picks the wording"; the dialog now does both for itself, which is what
  // ADR-0005 asks of a page in the first place (amendment twenty-one).
}
