import { splitTrailingParen } from './profile-education';

/** Split out of `profile-markdown.ts` when it passed its 400-line budget.
 * One `## section` of the profile document, parsed and serialised. */

/** A language + proficiency level, as edited in the structured profile UI. A
 * view over the plain `## Languages` string list, so `ProfileForm.languages`
 * stays `string[]` and the serializer / profile-compress are untouched. */
export interface LanguageEntry {
  language: string;
  /** CEFR level or free text ("C1", "Native"); empty means unspecified. */
  level: string;
}

export const EMPTY_LANGUAGE_ENTRY: LanguageEntry = { language: '', level: '' };

/** "English (C1)" -> { language: 'English', level: 'C1' }; "English" -> level ''. */
export function parseLanguageEntries(languages: readonly string[]): LanguageEntry[] {
  return (languages || [])
    .map((raw) => (raw || '').trim())
    .filter(Boolean)
    .map((item) => {
      const paren = splitTrailingParen(item);
      if (paren) return { language: paren.head, level: paren.body.trim() };
      return { language: item, level: '' };
    });
}

/** Inverse of parseLanguageEntries. Blank rows (no language) are dropped;
 * a row with a language but no level serializes bare. */
export function serializeLanguageEntries(entries: LanguageEntry[]): string[] {
  return entries
    .map((e) => {
      const lang = e.language.trim();
      if (!lang) return '';
      const level = e.level.trim();
      return level ? `${lang} (${level})` : lang;
    })
    .filter(Boolean);
}
