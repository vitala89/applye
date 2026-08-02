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

/**
 * The legitimacy notes a job carries, as a list.
 *
 * They are stored as a JSON array in one TEXT column, and a row written before
 * the column existed - or by a failed write - holds something that is not one.
 * Reading them is a parse with a defined answer for bad input, which is a rule,
 * not page logic.
 */
export function parseLegitimacyNotes(raw: string | undefined | null): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : [];
  } catch {
    return [];
  }
}
