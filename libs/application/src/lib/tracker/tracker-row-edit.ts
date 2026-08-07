// What the inline row editor reads out of a draft, and what it sends back.
//
// Split out of `tracker.component.ts` alongside `TrackerRowEditorStore`.
// Nothing here reads a signal or touches the gateway, which is what makes the
// two rules worth having on their own: **an emptied field clears the stored
// value**, and **a status write only happens when the status actually changed**.
// Both were previously buried in one 30-line method with no test.

import type { ApplicationTrackerFieldsInput, TrackerRow } from '@applye/core';
import { TrackerColumnDef, trackerFieldText } from './tracker-columns';

/**
 * The seven tracker fields the inline editor can write, plus the custom-column
 * blob. Everything else on a `TrackerRow` comes from the job posting or from
 * the pipeline and is not editable here.
 *
 * **An empty string becomes `undefined`, not `''`.** That is how clearing a
 * field in the grid clears the stored value rather than writing a blank one,
 * and it is the reason this is a function rather than a spread.
 */
export function buildTrackerFieldsInput(
  draft: TrackerRow,
  custom: Readonly<Record<string, string>>,
): ApplicationTrackerFieldsInput {
  return {
    id: draft.id,
    contactName: draft.contactName || undefined,
    contactRole: draft.contactRole || undefined,
    contactChannel: draft.contactChannel || undefined,
    nextAction: draft.nextAction || undefined,
    nextActionAt: draft.nextActionAt || undefined,
    salaryRange: draft.salaryRange || undefined,
    notes: draft.notes || undefined,
    customFields: JSON.stringify(custom),
  };
}

/**
 * Whether the draft's status differs from the row it was opened on, and is
 * therefore worth a second write.
 *
 * A status is never *cleared* from the grid - the editor offers a fixed list of
 * statuses with no blank option - so a falsy draft status means "not touched"
 * rather than "set to nothing", and must not write.
 */
export function trackerStatusChanged(draft: TrackerRow, original: TrackerRow | undefined): boolean {
  return !!draft.status && draft.status !== original?.status;
}

/**
 * One editable cell's current value while the row is being edited. Custom
 * columns come out of the draft's own map rather than the row's JSON blob,
 * because the blob is only rebuilt on save.
 */
export function trackerDraftValue(
  draft: TrackerRow | null,
  custom: Readonly<Record<string, string>>,
  col: TrackerColumnDef,
): string {
  if (!draft) return '';
  if (col.custom) return custom[col.key] ?? '';
  return trackerFieldText(draft as unknown as Record<string, unknown>, col);
}
