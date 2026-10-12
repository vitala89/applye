/** Which regional document conventions a CV or cover letter is written to. */
export type DocumentRegionTag = 'de' | 'us' | 'uk' | 'generic';

/**
 * Which regional document conventions a posting's language implies.
 *
 * German postings use the German set. Every other language, and a missing
 * posting, uses the neutral set. The only input is a language tag, so the
 * rule lives with the document domain rather than with the job workflow.
 */
export function inferDocumentRegion(job: { language?: string } | null): DocumentRegionTag {
  return job?.language === 'de' ? 'de' : 'generic';
}
