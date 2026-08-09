import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Sparkles, Trash2, X } from 'lucide-angular';
import { TrackerColumnDef, TrackerColumnsStore } from '@applye/application';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../../core/toast/toast.service';
import { trackerColumnLabel } from '../tracker-column-label';

/**
 * The column manager: which columns show, and the custom ones the user adds.
 *
 * Like the export dialog, it injects `TrackerColumnsStore` rather than taking
 * inputs - the store is provided on `TrackerComponent`, so a child inside its
 * template resolves the same instance. Every piece of state this drawer reads
 * or writes already belonged to that store, so `closed` is the only thing that
 * crosses the boundary.
 *
 * The two custom-column writes came here with the markup for the same reason
 * the export writes went to the dialog: the store writes and reports, and the
 * component decides what to say about it (ADR-0005, amendments three and
 * twenty-two).
 */
@Component({
  selector: 'app-tracker-column-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './tracker-column-drawer.component.html',
  styleUrl: './tracker-column-drawer.component.scss',
})
export class TrackerColumnDrawerComponent {
  private readonly i18n = inject(TranslateService);
  private readonly toast = inject(ToastService);
  protected readonly t = this.i18n.t;

  protected readonly columns = inject(TrackerColumnsStore);

  /** The page owns whether the drawer exists; this says when it should stop. */
  readonly closed = output<void>();

  protected readonly icons = {
    close: X,
    sparkles: Sparkles,
    trash: Trash2,
    plus: Plus,
  };

  protected colLabel(col: TrackerColumnDef): string {
    return trackerColumnLabel(col, this.t());
  }

  protected async addCustomColumn(): Promise<void> {
    try {
      if (await this.columns.addColumn()) this.toast.success(this.t()('tracker.custom_added'));
    } catch (e) {
      this.toast.error(String(e));
    }
  }

  protected async removeCustomColumn(id: string): Promise<void> {
    try {
      await this.columns.removeColumn(id);
    } catch (e) {
      this.toast.error(String(e));
    }
  }
}
