import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Archive, ArchiveRestore, LucideAngularModule, Pencil, Trash2 } from 'lucide-angular';
import type { TrackerRow } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { inject } from '@angular/core';

/**
 * One row's action menu, and the delete confirmation that replaces its
 * contents in place.
 *
 * Unlike the export dialog and the column drawer, this one takes inputs: the
 * state it renders - which row, where the trigger was, and whether the delete
 * is being confirmed - is the page's, not a store's. **The confirmation stays
 * on the page deliberately.** The page resets it when a different row's menu
 * opens, and this component is reused rather than recreated when that happens,
 * so owning the flag here would carry one row's half-confirmed delete over to
 * the next row. That is a destructive action, so the extraction keeps the
 * behaviour provably identical rather than saving two lines of binding
 * (ADR-0005, amendment twenty-two).
 *
 * It is rendered at the page root rather than inside the table, because a
 * sticky cell's stacking context would clip or paint over it.
 */
@Component({
  selector: 'app-tracker-row-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './tracker-row-menu.component.html',
  styleUrl: './tracker-row-menu.component.scss',
})
export class TrackerRowMenuComponent {
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly row = input.required<TrackerRow>();
  readonly top = input.required<number>();
  readonly left = input.required<number>();
  readonly confirming = input(false);

  /** The backdrop was clicked: dismiss everything. */
  readonly closed = output<void>();
  readonly editRequested = output<void>();
  /** `true` archives, `false` restores - the caller writes, this only asks. */
  readonly archiveToggled = output<boolean>();
  readonly removeRequested = output<void>();
  readonly removeCancelled = output<void>();
  readonly removeConfirmed = output<void>();

  protected readonly icons = {
    pencil: Pencil,
    archive: Archive,
    restore: ArchiveRestore,
    trash: Trash2,
  };
}
