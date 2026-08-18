import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { ArrowUpRight, LucideAngularModule, Pencil, Sparkles } from 'lucide-angular';
import {
  TrackerColumnDef,
  TrackerColumnsStore,
  TrackerRowEditorStore,
  TrackerRowsStore,
  formatTrackerDate,
  trackerCellValue,
} from '@applye/application';
import { ApplicationStatus, TrackerRow } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { trackerColumnLabel } from '../tracker-column-label';
import { TrackerRowActionsComponent } from '../tracker-row-actions/tracker-row-actions.component';

/**
 * The tracker grid: the header, the rows, every cell's read and edit form, and
 * the scroll container the sticky columns stick inside.
 *
 * **It reads the three stores directly**, the way `tracker-column-drawer`,
 * `tracker-export-modal` and `tracker-summary-strip` already do - they are
 * provided on the page, so this is the same instance the page sees rather than
 * a second copy. What it does *not* own is anything that reaches outside the
 * grid: opening a job is navigation, saving reloads and raises a toast, and the
 * row menu is a fixed-position popup the page renders at its own root so no
 * sticky cell's stacking context can clip it. All four are outputs.
 *
 * The three cell helpers are here rather than on the page because the page has
 * no other caller for them: a template cannot import the pure column module, so
 * something in the component has to delegate, and this is the only component
 * that renders a cell.
 */
@Component({
  selector: 'app-tracker-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, TrackerRowActionsComponent],
  templateUrl: './tracker-table.component.html',
  styleUrl: './tracker-table.component.scss',
})
export class TrackerTableComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  protected readonly columns = inject(TrackerColumnsStore);
  protected readonly rows = inject(TrackerRowsStore);
  protected readonly editor = inject(TrackerRowEditorStore);

  /** Which row's menu is open. Page state: the store only knows the row. */
  readonly menuId = input.required<number | null>();

  readonly jobRequested = output<TrackerRow>();
  readonly saveRequested = output<void>();
  readonly menuToggled = output<{ row: TrackerRow; trigger: HTMLElement }>();
  readonly scrolled = output<void>();

  protected readonly icons = { pencil: Pencil, sparkles: Sparkles, link: ArrowUpRight };

  protected readonly statuses: ApplicationStatus[] = [
    'saved',
    'applied',
    'interview',
    'offer',
    'rejected',
    'cancelled',
  ];

  /** The rule itself lives in `tracker-column-label.ts`, because three
   * components under `pages/tracker/` name columns (ADR-0005, amendment
   * twenty-two). */
  protected colLabel(col: TrackerColumnDef): string {
    return trackerColumnLabel(col, this.t());
  }

  protected cellValue(row: TrackerRow, col: TrackerColumnDef): string {
    return trackerCellValue(row, col);
  }

  protected fmtDate(v: string): string {
    return formatTrackerDate(v);
  }

  protected statusLabel(v?: string): string {
    return v ? this.t()('status.' + v) : '·';
  }

  /** Reads the DOM event the store must not see, then delegates. */
  protected setDraft(col: TrackerColumnDef, e: Event): void {
    this.editor.setValue(col, (e.target as HTMLInputElement | HTMLSelectElement).value);
  }
}
