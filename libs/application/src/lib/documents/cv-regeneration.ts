// The pure parts of regenerating a CV section from the profile.
//
// Split out of `cv-detail.component.ts` alongside `CvRegenerationStore`. What
// is here decides what the AI is asked and what is done with the answer; the
// store performs the calls.

import type { CvParsedContent, CvSection, CvSectionKey, SupportedLanguage } from '@applye/core';

export type PersonalDetailsSection = Extract<CvSection, { key: 'personal_details' }>;

/** Merges an incoming profile field into the current personal-details value,
 * ignoring empty/whitespace-only incoming values so a blank field from the
 * model never overwrites an existing value. */
export function mergePersonalField<T extends string | undefined>(
  incoming: string | null | undefined,
  current: T,
): string | T {
  return incoming && incoming.trim() ? incoming : current;
}

/**
 * A new personal-details section with the seven contact fields merged in.
 *
 * **Immutable, where the page version assigned in place.** The old code mutated
 * the section object and then re-set the sections array to force a re-render,
 * which works only because the array reference changed - the section itself
 * stayed identical, so anything comparing sections by identity (an `OnPush`
 * child taking one as an input, a `track` expression) could not see the edit.
 * Returning a new object is what the rest of the section handling already does.
 */
export function mergePersonalDetails(
  section: PersonalDetailsSection,
  parsed: CvParsedContent['personalDetails'],
): PersonalDetailsSection {
  return {
    ...section,
    fullName: mergePersonalField(parsed.fullName, section.fullName),
    title: mergePersonalField(parsed.title, section.title),
    email: mergePersonalField(parsed.email, section.email),
    phone: mergePersonalField(parsed.phone, section.phone),
    address: mergePersonalField(parsed.address, section.address),
    website: mergePersonalField(parsed.website, section.website),
    linkedin: mergePersonalField(parsed.linkedin, section.linkedin),
  };
}

/**
 * The string a section's `sourceHash` is computed from. Everything that changes
 * what the model would be asked goes in, so an unchanged hash means the answer
 * would be the same and the call can be skipped.
 */
export function regenerationHashInput(
  profileMd: string,
  regionTag: string,
  archetypeTag: string,
  language: string,
  key: CvSectionKey,
): string {
  return [profileMd, regionTag, archetypeTag, language, key].join('|');
}

/** The language a generated section is written in: the document's own, else the
 * user's default, else English. */
export function resolveDocLanguage(
  docLanguage: SupportedLanguage | undefined,
  settingsDefault: SupportedLanguage | undefined,
): SupportedLanguage {
  return docLanguage ?? settingsDefault ?? 'en';
}

/**
 * Raised when the profile has no markdown to generate from. A typed error
 * rather than a message, because the application layer does not build
 * user-facing strings (ADR-0005, amendment three) - the page catches this and
 * chooses the wording.
 */
export class CvNoProfileError extends Error {
  constructor() {
    super('cv regeneration: the profile has no markdown');
    this.name = 'CvNoProfileError';
  }
}
