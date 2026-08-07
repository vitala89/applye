import { Injectable, inject, signal } from '@angular/core';
import type { ApplicationStatus, TrackerRow } from '@applye/core';
import { DbService } from '@applye/data';
import { TrackerColumnDef, trackerCustomValues } from './tracker-columns';
import {
  buildTrackerFieldsInput,
  trackerDraftValue,
  trackerStatusChanged,
} from './tracker-row-edit';
import { TrackerRowsStore } from './tracker-rows.store';

/**
 * Reloads whatever the page considers "the tracker" after a successful save.
 *
 * Passed in rather than called, because the page's own `load` refreshes the
 * columns and the report market alongside the rows, and this library cannot see
 * it (ADR-0005, amendment six, third shape). Taking it as a parameter is also
 * what keeps `saving` true for the whole operation, reload included, exactly as
 * the page did before the split.
 */
export type TrackerEditReload = () => Promise<void>;

/**
 * The inline row editor: one row's draft, the custom values being typed into
 * it, and the two writes that persist them.
 *
 * It injects `TrackerRowsStore` to read the row a draft was opened on, because
 * the status write is conditional on the status having actually changed - it
 * does not write the list, which stays the rows store's own.
 *
 * **It never notifies the user** (ADR-0005, amendment three). `save` reports
 * whether a write happened and lets a gateway failure throw; the toast stays on
 * the page.
 *
 * Component-scoped.
 */
@Injectable()
export class TrackerRowEditorStore {
  private readonly db = inject(DbService);
  private readonly rows = inject(TrackerRowsStore);

  readonly editId = signal<number | null>(null);
  readonly draft = signal<TrackerRow | null>(null);
  readonly draftCustom = signal<Record<string, string>>({});
  readonly saving = signal(false);

  isEditing(row: TrackerRow): boolean {
    return this.editId() === row.id;
  }

  /**
   * Opens a row for editing, over a copy of it. The custom values are decoded
   * out of the row's blob once, here, and edited as a map until save.
   *
   * **Both copies survive mutation testing, and only the first is defensive.**
   * `row` belongs to `TrackerRowsStore`'s list, and spreading it is what stops
   * an in-place edit of the draft reaching the grid - nothing edits in place
   * today, because `setValue` spreads on every write, but that is one careless
   * line away. The second spread copies what `trackerCustomValues` just
   * allocated and can never be load-bearing; it is kept so the pair reads as
   * one rule rather than as an oversight.
   */
  start(row: TrackerRow): void {
    this.draft.set({ ...row });
    this.draftCustom.set({ ...trackerCustomValues(row) });
    this.editId.set(row.id);
  }

  /** Closes the editor and discards the draft. `draftCustom` is deliberately
   * left alone: `start` always overwrites it, and clearing it here would blank
   * the cells for one frame while the row collapses. */
  cancel(): void {
    this.editId.set(null);
    this.draft.set(null);
  }

  value(col: TrackerColumnDef): string {
    return trackerDraftValue(this.draft(), this.draftCustom(), col);
  }

  /** Records one cell's new value. A custom column goes into the map; anything
   * else onto the draft row. */
  setValue(col: TrackerColumnDef, value: string): void {
    if (col.custom) {
      this.draftCustom.update((m) => ({ ...m, [col.key]: value }));
      return;
    }
    this.draft.update((d) => (d ? { ...d, [col.key]: value } : d));
  }

  /**
   * Writes the draft, then the status if it changed, then closes the editor and
   * reloads through the callback. Returns `false` when there was nothing to do
   * - no draft open, or a save already running - which the caller must treat as
   * "no write happened" rather than as failure. A gateway error propagates, and
   * the editor stays open over the draft so the attempt can be repeated.
   */
  async save(reload: TrackerEditReload): Promise<boolean> {
    const draft = this.draft();
    if (!draft || this.saving()) return false;
    this.saving.set(true);
    try {
      await this.db.updateApplicationTrackerFields(
        buildTrackerFieldsInput(draft, this.draftCustom()),
      );
      const original = this.rows.all().find((r) => r.id === draft.id);
      if (trackerStatusChanged(draft, original)) {
        await this.db.setApplicationStatus(draft.id, draft.status as ApplicationStatus);
      }
      this.editId.set(null);
      this.draft.set(null);
      await reload();
      return true;
    } finally {
      this.saving.set(false);
    }
  }
}
