import { Injectable, Signal, computed, signal } from '@angular/core';
import { SupportedLanguage } from '@applye/core';
import { TRANSLATIONS } from '../translations/translations';

type TranslationMap = Record<string, unknown>;

function resolve(map: TranslationMap, key: string): string {
  const parts = key.split('.');
  let node: unknown = map;
  for (const part of parts) {
    node = (node as TranslationMap)?.[part];
    if (node === undefined) return key;
  }
  return typeof node === 'string' ? node : key;
}

@Injectable({ providedIn: 'root' })
export class TranslateService {
  private readonly _locale = signal<SupportedLanguage>('en');

  readonly locale: Signal<SupportedLanguage> = this._locale.asReadonly();

  /**
   * Signal returning a translation function for the current locale.
   * Reading t() in a template creates a reactive dependency - template
   * re-evaluates automatically when locale changes.
   *
   * Template: {{ t()('nav.dashboard') }}
   * Component: protected readonly t = inject(TranslateService).t;
   */
  readonly t = computed(() => {
    const map = (TRANSLATIONS[this._locale()] ?? TRANSLATIONS['en']) as TranslationMap;
    return (key: string): string => resolve(map, key);
  });

  /**
   * Translation function for an EXPLICIT locale, independent of the UI locale.
   * For documents whose language is a property of the document itself, not of
   * the app chrome - e.g. the German Eigenbemuehungen report must be fully
   * German even while the app runs in English.
   */
  tFor(locale: SupportedLanguage): (key: string) => string {
    const map = (TRANSLATIONS[locale] ?? TRANSLATIONS['en']) as TranslationMap;
    return (key: string): string => resolve(map, key);
  }

  setLocale(locale: SupportedLanguage): void {
    if (locale in TRANSLATIONS) {
      this._locale.set(locale);
    }
  }
}
