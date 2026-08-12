import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  ArrowDown,
  ArrowUp,
  CircleX,
  LucideAngularModule,
  Search,
  Trash2,
  Upload,
} from 'lucide-angular';
import { APPLICATION_STATUSES } from '@applye/core';
import type { JobOverview } from '@applye/core';
import { ANALYSED_STATUS, MyJobsStore, TracklistImportStore, rowStatus } from '@applye/application';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { PasteJobModalService } from '../../shared/paste-job-modal/paste-job-modal.service';
import { ToastService } from '@applye/application';

// My Jobs: the full job database as a sortable/filterable table. Read-only,
// 0 tokens. Sort/filter/search run client-side over the local overview list.
@Component({
  selector: 'app-my-jobs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, ButtonDirective],
  templateUrl: './my-jobs.component.html',
  styleUrl: './my-jobs.component.scss',
  providers: [MyJobsStore, TracklistImportStore],
})
export class MyJobsComponent {
  protected readonly table = inject(MyJobsStore);
  protected readonly importer = inject(TracklistImportStore);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;
  protected readonly pasteJobModal = inject(PasteJobModalService);
  protected readonly icons = {
    search: Search,
    up: ArrowUp,
    down: ArrowDown,
    upload: Upload,
    trash: Trash2,
    dangerGlyph: CircleX,
  };

  /** Real statuses plus the pseudo-status unclaimed rows carry, so the filter
   * can select them like any other. */
  readonly statuses = [...APPLICATION_STATUSES, ANALYSED_STATUS];
  protected readonly rowStatus = rowStatus;
  readonly legitimacies = ['green', 'yellow', 'red'];

  /**
   * Still English, and still hardcoded, exactly as before this screen moved -
   * the store publishes the counts and the page writes the sentence, so this is
   * where the untranslated string now lives. Filed as a defect rather than
   * fixed inside a migration.
   */
  readonly importSummary = computed(() => {
    const total = this.importer.total();
    const skipped = this.importer.skipped().length;
    return (
      `Found ${total} row${total === 1 ? '' : 's'}. ` +
      `${this.importer.willAdd()} will be added. ${this.importer.duplicates()} already exist. ` +
      `${skipped} skipped.`
    );
  });

  /** Same caveat as `importSummary`. */
  readonly importDoneMsg = computed(() => {
    const r = this.importer.result();
    if (!r) return '';
    return (
      `Imported ${r.inserted} job${r.inserted === 1 ? '' : 's'}. ` +
      `${r.skippedDuplicate} skipped as duplicate.`
    );
  });

  constructor() {
    void this.table.load();
  }

  open(id: number): void {
    void this.router.navigate(['/jobs', id]);
  }

  requestDelete(row: JobOverview, event: Event): void {
    event.stopPropagation();
    this.table.requestDelete(row);
  }

  onDeleteBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.table.cancelDelete();
    }
  }

  /** A refusal - nothing targeted, or a delete already running - says nothing. */
  async confirmDelete(): Promise<void> {
    const ok = await this.table.confirmDelete();
    if (ok === null) return;
    if (ok) this.toast.success(this.t()('jobs.delete_ok'));
    else this.toast.error(this.table.error());
  }

  // ── Import tracklist ────────────────────────────────────────────────────────

  /**
   * Picking the file is the app's job: no file under `libs/` imports a Tauri
   * plugin, and the store takes the path from here (ADR-0005, amendment
   * thirty-six).
   */
  async pickAndDetect(): Promise<void> {
    if (this.importer.busy()) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({
      multiple: false,
      filters: [{ name: 'Tracklist', extensions: ['csv', 'xlsx', 'xls', 'json', 'txt'] }],
    });
    if (!path || Array.isArray(path)) return;

    if ((await this.importer.detect(path)) === false) {
      this.toast.error(this.importer.error());
    }
  }

  async confirmImport(): Promise<void> {
    const ok = await this.importer.confirm();
    if (ok === null) return;
    if (!ok) {
      this.toast.error(this.importer.error());
      return;
    }
    await this.table.load();
    const inserted = this.importer.result()?.inserted ?? 0;
    this.toast.success(this.t()('myjobs.import_done').replace('{n}', String(inserted)));
  }
}
