/**
 * Pure derivation of the badge shown on the apply wizard's CV and cover-letter
 * cards. Kept out of the page component so the states can be tested directly.
 */
export type ReviewDocumentStatus =
  'missing' | 'generating' | 'needs_input' | 'linked' | 'needs_review' | 'ready';

export interface DocumentCardState {
  /** A draft run for this job and document kind is in flight. */
  readonly preparing: boolean;
  /** That run is parked on a dialog and cannot finish until the user answers. */
  readonly awaitingInput: boolean;
  /** A document of this kind is linked to the application. */
  readonly linked: boolean;
  /** Final checks have been computed against some document set. */
  readonly hasCheckedInput: boolean;
  /** Final checks are stale relative to the current documents. */
  readonly outdated: boolean;
}

/**
 * A preparing card reports `needs_input` rather than `generating` while the
 * flow waits on the user, so a blocked draft never looks like a working one.
 */
export function documentCardStatus(state: DocumentCardState): ReviewDocumentStatus {
  if (state.preparing) return state.awaitingInput ? 'needs_input' : 'generating';
  if (!state.linked) return 'missing';
  if (state.outdated) return 'needs_review';
  return state.hasCheckedInput ? 'ready' : 'linked';
}

export function documentStatusKey(status: ReviewDocumentStatus): string {
  return `jobs.wizard.document_status_${status}`;
}
