/**
 * Site locales, mirroring the six languages the README ships in.
 *
 * English lives at the root (`/`); every other locale gets a prefixed landing
 * page (`/de`, `/es`, ...). Only the landing page and the shell are localised
 * today - the docs stay in English, and the localised landing says so plainly
 * rather than pretending otherwise. That is a deliberate choice: a half
 * machine-translated documentation set would be worse than an honest link to
 * the English one.
 */
export interface Locale {
  /** BCP-47 language code, used for `lang`, `hreflang` and the URL prefix. */
  code: 'en' | 'de' | 'es' | 'pl' | 'ru' | 'uk';
  /** The language's name in its own language, as a reader expects to see it. */
  label: string;
}

export const LOCALES: readonly Locale[] = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'pl', label: 'Polski' },
  { code: 'ru', label: 'Русский' },
  { code: 'uk', label: 'Українська' },
];

export type LocaleCode = Locale['code'];

export const DEFAULT_LOCALE: LocaleCode = 'en';

/** URL path for a locale's landing page: `/` for English, `/de` and so on. */
export function localePath(code: LocaleCode): string {
  return code === DEFAULT_LOCALE ? '/' : `/${code}`;
}
