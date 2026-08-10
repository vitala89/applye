import type { CvContent, CvSection } from '@applye/core';

/**
 * The filename to suggest in the save dialog for a CV.
 *
 * Germany is the one market with a filename convention strong enough to be
 * worth honouring: `Nachname_Vorname_Lebenslauf.ext` is what a recruiter there
 * expects to receive, and a generic slug reads as carelessness (ROADMAP §16.6).
 * Every other region, and every DE document whose personal-details section
 * carries no usable full name, falls back to a slug of the label.
 *
 * Not a `market-conventions/{region}.json` config: one market with one rule
 * does not need a lookup table, and the second one that appears is what should
 * pay for it (§16.2).
 */
export function suggestCvFilename(
  item: { label?: string; regionTag?: string; contentJson?: string },
  format: string,
): string {
  if ((item.regionTag ?? '').toLowerCase() === 'de' && item.contentJson) {
    try {
      const content = JSON.parse(item.contentJson) as CvContent;
      const personal = content.sections.find(
        (s): s is Extract<CvSection, { key: 'personal_details' }> => s.key === 'personal_details',
      );
      const parts = (personal?.fullName ?? '').trim().split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        const nachname = parts[parts.length - 1];
        const vorname = parts.slice(0, -1).join('_');
        return `${nachname}_${vorname}_Lebenslauf.${format}`;
      }
    } catch {
      // Unparseable stored content is not a reason to refuse a filename - fall
      // through to the generic slug below.
    }
  }
  const slug = (item.label ?? 'cv').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return `${slug}.${format}`;
}
