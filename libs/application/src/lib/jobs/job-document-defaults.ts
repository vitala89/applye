import {
  type Application,
  type DocumentLibraryItem,
  type Job,
  type Settings,
  type SupportedLanguage,
  normalizeSupportedLanguage,
} from '@applye/core';

/**
 * Which language the Review documents step opens in.
 *
 * Precedence, and each step earns its place: an application that already
 * committed to a language keeps it, because changing it mid-application would
 * leave a German CV beside an English cover letter on the same job. Otherwise
 * the posting's own language, then the user's default, then English.
 */
export function documentReviewLanguageFor(
  application: Application | null,
  job: Job,
  settings: Settings | null,
): SupportedLanguage {
  return (
    application?.docLanguage ??
    normalizeSupportedLanguage(job.language ?? settings?.defaultDocLanguage)
  );
}

/** The base-CV dropdown for one job: what it offers, and what it opens on. */
export interface BaseCvChoices {
  matches: DocumentLibraryItem[];
  /** Null is "from scratch" - build the next tailoring off the profile. */
  selectedId: number | null;
}

/**
 * What the base-CV dropdown should offer for this job, and which entry it opens
 * on.
 *
 * The offer is the CVs written in this job's language, plus whatever the user
 * marked default. The selection defaults to **null**, meaning the profile: a
 * CV selected by accident would silently make the next tailoring build on
 * someone else's document.
 *
 * The one exception is this job's own tailored CV. A retailor should build on
 * the job's own document rather than a generic one, so a linked CV is pulled
 * into the list even when the language filter would have dropped it - without
 * that, a CV written in another language vanishes from the dropdown and the
 * choice silently resets to the profile.
 */
export function baseCvChoices(
  library: DocumentLibraryItem[],
  job: Job,
  settings: Settings | null,
  linkedCvId: number | null,
): BaseCvChoices {
  const language = job.language ?? settings?.defaultDocLanguage ?? 'en';
  const matches = library.filter((c) => c.language === language || c.isDefault);

  if (linkedCvId != null && !matches.some((c) => c.id === linkedCvId)) {
    const linked = library.find((c) => c.id === linkedCvId);
    if (linked) matches.unshift(linked);
  }

  return {
    matches,
    selectedId: linkedCvId != null && matches.some((c) => c.id === linkedCvId) ? linkedCvId : null,
  };
}
