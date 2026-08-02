import { Job, Profile } from '@applye/core';
import { cvDraftHashInput } from './cv-draft.service';
import { coverLetterHashInput } from './cover-letter-draft.service';

/**
 * The exact input the linked CV's staleness is judged against, or null when
 * there is nothing to judge - no job means no hash and no question to ask.
 * Null is the caller's signal to answer "not stale" without a database read.
 */
export function cvStaleInput(
  job: Job | null,
  tailoredMd: string,
  language: string,
  region: string,
): string | null {
  if (!job?.id) return null;
  return cvDraftHashInput(job.id, tailoredMd, language, region);
}

/**
 * The same for the cover letter, which is keyed on the profile and the job
 * description rather than on a tailoring pass. Null when either is missing.
 */
export function coverLetterStaleInput(
  job: Job | null,
  profile: Profile | null,
  language: string,
  region: string,
): string | null {
  if (!job?.id || !profile?.fullMd) return null;
  return coverLetterHashInput(job.id, profile.fullMd, job.jdText ?? '', language, region);
}

/**
 * What committing an application should do with one of its two documents.
 *
 * `keep` covers two different situations that must not be confused: the
 * document is present and current, or there is nothing to build it from. Both
 * mean "generate nothing", and the difference is not this decision's to report.
 */
export type DocumentAction = 'create' | 'regenerate' | 'keep';

/**
 * The CV rule. A missing CV is created only when a tailoring pass has produced
 * something to build it from; a present one is rebuilt only when the caller
 * asked for stale documents to be refreshed **and** it is actually stale.
 *
 * `isStale` is a thunk rather than a boolean because the check costs a hash and
 * a database read, and most calls never need it. A test that asserts it was not
 * called is asserting the short circuit, which is the part that would silently
 * regress.
 */
export async function decideCvAction(input: {
  linked: boolean;
  tailoredMd: string;
  regenerateStale: boolean;
  isStale: () => Promise<boolean>;
}): Promise<DocumentAction> {
  if (!input.linked) return input.tailoredMd ? 'create' : 'keep';
  if (!input.regenerateStale || !input.tailoredMd) return 'keep';
  return (await input.isStale()) ? 'regenerate' : 'keep';
}

/**
 * The cover letter rule. Unlike the CV it has no tailoring precondition - it is
 * built from the profile and the job description, both of which exist by the
 * time an application can be committed - so a missing one is always created.
 */
export async function decideCoverLetterAction(input: {
  linked: boolean;
  regenerateStale: boolean;
  isStale: () => Promise<boolean>;
}): Promise<DocumentAction> {
  if (!input.linked) return 'create';
  if (!input.regenerateStale) return 'keep';
  return (await input.isStale()) ? 'regenerate' : 'keep';
}
