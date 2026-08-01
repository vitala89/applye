/**
 * How a job's company and title are presented when the parser could not find
 * them. Pure, and the translator is injected, so the rule lives in one place
 * instead of being re-decided in each template.
 */

/** Translator shape: the app's `t()` accessor, narrowed to what is used here. */
export type TranslateFn = (key: string) => string;

/**
 * The "<company> - <title>" line shown as the page header for a job.
 *
 * Neither half collapses when it is missing. A header that silently drops an
 * absent company reads as though the posting never had one, and the header is
 * exactly where a user notices that the parser came up empty.
 */
export function jobHeaderTitle(
  company: string | undefined,
  title: string | undefined,
  t: TranslateFn,
): string {
  return `${company || t('jobs.company_unknown')} - ${title || t('jobs.title_unknown')}`;
}
