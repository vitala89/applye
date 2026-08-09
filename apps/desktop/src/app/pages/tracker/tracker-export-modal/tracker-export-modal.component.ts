import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FileCheck2, FileDown, Info, LucideAngularModule, Table, X } from 'lucide-angular';
import { TrackerColumnsStore, TrackerReportStore, TrackerRowsStore } from '@applye/application';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../../core/toast/toast.service';
import { trackerColumnLabel } from '../tracker-column-label';
import { TrackerReportComponent } from '../tracker-report.component';

/**
 * The export preview dialog: the Eigenbemuehungen sheet, its four options and
 * the two writes that save it.
 *
 * It injects the three tracker stores rather than taking them as inputs. They
 * are provided on `TrackerComponent`, so a child rendered inside its template
 * resolves the same instances through the injector - which is why this
 * extraction needed no input plumbing for the data, and only `closed` on the
 * way out.
 *
 * Three things moved here from the page along with the markup, because each is
 * dialog chrome rather than page state: `today()`, `fitNoteText()` and the two
 * export methods. Their doc comments on the page said they lived there because
 * "the page closes the dialog and picks the wording" - with the dialog
 * extracted, the dialog is what does both.
 *
 * Extracted because `tracker.component.html` was 557 against a budget of 300
 * and the file-size gate refuses to let an over-budget file grow, which blocks
 * the `.jt-icon` fold behind it (ADR-0005, amendment twenty-one).
 */
@Component({
  selector: 'app-tracker-export-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, TrackerReportComponent],
  templateUrl: './tracker-export-modal.component.html',
  styleUrl: './tracker-export-modal.component.scss',
})
export class TrackerExportModalComponent {
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;

  protected readonly report = inject(TrackerReportStore);
  protected readonly rows = inject(TrackerRowsStore);
  protected readonly columns = inject(TrackerColumnsStore);

  /** The page owns whether the dialog exists; this says when it should stop. */
  readonly closed = output<void>();

  protected readonly icons = {
    reportOk: FileCheck2,
    close: X,
    fileDown: FileDown,
    table: Table,
    info: Info,
  };

  protected today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Human note about A4 fit: which columns are hidden (fit mode) or wrap to a
   * second line (all mode), for the current orientation. It names the columns
   * in the **UI** language even when the sheet itself is German, because it is
   * dialog chrome and not part of the document.
   */
  protected fitNoteText(): string {
    const overflow = this.report.fitInfo().overflow;
    if (!overflow.length) return '';
    const uiLabels = new Map(
      this.columns.visibleColumns().map((c) => [c.key, trackerColumnLabel(c, this.t())]),
    );
    const cols = overflow.map((c) => uiLabels.get(c.id) ?? c.label).join(', ');
    const orient = this.t()(this.report.landscape() ? 'tracker.landscape' : 'tracker.portrait');
    const key = this.report.mode() === 'fit' ? 'tracker.fit_note_hidden' : 'tracker.fit_note_wrap';
    return this.t()(key)
      .replace('{n}', String(overflow.length))
      .replace('{orient}', orient)
      .replace('{cols}', cols);
  }

  // The store writes and reports; this closes the dialog and picks the wording
  // (ADR-0005, amendment three).
  protected async exportCsv(): Promise<void> {
    try {
      const path = await this.report.exportCsv();
      this.closed.emit();
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
  protected async exportPdf(): Promise<void> {
    try {
      const path = await this.report.exportPdf(async (defaultPath) => {
        const { save } = await import('@tauri-apps/plugin-dialog');
        return save({ defaultPath, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      });
      if (!path) return; // cancelled
      this.closed.emit();
      this.toast.success(`${this.t()('tracker.saved_to')} ${path}`);
    } catch (e) {
      this.toast.error(String(e));
    }
  }
}
