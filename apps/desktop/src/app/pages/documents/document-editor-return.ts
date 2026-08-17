import type { ParamMap } from '@angular/router';

/**
 * Where a document editor goes back to, read off its query params.
 *
 * The CV and cover-letter editors had identical copies of all four rules. They
 * differ only in the three values each passes in - its own back-button
 * translation keys and its own `documentType` - so the rules are here and the
 * values stay with the page.
 *
 * Everything in this module is a pure function of the params. The `router.navigate`
 * calls stay on the pages, because a navigation is an effect and this is the part
 * worth testing without a `TestBed`.
 */

/** The two keys a back button chooses between. */
export interface BackLabelKeys {
  /** Carries a `{job}` placeholder. */
  readonly job: string;
  readonly documents: string;
}

/** The wizard's own name for each editor's output. */
export type WizardDocumentType = 'cv' | 'cover_letter';

/** Opened from the apply wizard, so Back hands control back to it. */
export function isApplyWizardReturn(params: ParamMap): boolean {
  return params.get('returnTo') === 'applyWizard';
}

/** Job id to return to when opened from My Jobs, else null. */
export function myJobsReturnJobId(params: ParamMap): string | null {
  return params.get('returnTo') === 'myJobs' ? params.get('jobId') : null;
}

/**
 * The back button's label: the job it returns to, or plain "Documents".
 *
 * Both halves have to hold - a `jobLabel` with no `returnTo=myJobs` is a stale
 * link rather than a job to name, and a job with no label has nothing to
 * interpolate.
 */
export function backLabel(
  params: ParamMap,
  keys: BackLabelKeys,
  t: (key: string) => string,
): string {
  const jobLabel = params.get('jobLabel');
  return myJobsReturnJobId(params) && jobLabel
    ? t(keys.job).replace('{job}', jobLabel)
    : t(keys.documents);
}

/**
 * Query params that put the apply wizard back on its documents step.
 *
 * `documentId` prefers the record actually in hand and falls back to the id the
 * wizard sent, so a return before the first save still points somewhere.
 */
export function applyWizardReturnParams(
  params: ParamMap,
  documentType: WizardDocumentType,
  documentId: number | string | null,
  documentSaved: boolean,
): Record<string, string | number | null> {
  return {
    returnTo: 'applyWizard',
    wizardStep: 'documents',
    documentType,
    documentId: documentId ?? params.get('documentId'),
    reviewHash: params.get('reviewHash'),
    documentSaved: documentSaved ? '1' : '0',
  };
}
