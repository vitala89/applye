import { TestBed } from '@angular/core/testing';
import { SupportedLanguage } from '@applye/core';
import { TRANSLATIONS } from '../translations/translations';
import { TranslateService } from './translate.service';

describe('TranslateService', () => {
  let service: TranslateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TranslateService);
  });

  it('translates in the current UI locale', () => {
    service.setLocale('de');
    expect(service.t()('tracker.col_company')).toBe('Firma');
  });

  describe('tFor', () => {
    it('translates in an explicit locale regardless of the UI locale', () => {
      service.setLocale('en');
      expect(service.tFor('de')('tracker.col_company')).toBe('Firma');
      // The UI locale is untouched by a document-language lookup.
      expect(service.t()('tracker.col_company')).toBe('Company');
    });

    it('falls back to English for a locale with no entry for the key', () => {
      // ru is a partial bundle: a missing key must not blank the label.
      expect(service.tFor('ru')('tracker.col_role')).toBe('Role');
    });

    it('returns the key itself when it exists in no bundle', () => {
      expect(service.tFor('de')('tracker.does_not_exist')).toBe('tracker.does_not_exist');
    });
  });

  describe('partial locales', () => {
    // A partial locale is layered over English section by section. A shallow
    // merge drops every English key the locale's own section omits, and
    // `resolve()` then renders the raw key - so the user reads `actions.close`
    // where a button label belongs.
    const partial: SupportedLanguage[] = ['ru', 'es', 'fr', 'uk'];

    it.each(partial)('%s keeps English leaves its own section does not translate', (locale) => {
      const t = service.tFor(locale);
      expect(t('actions.close')).toBe('Close');
      expect(t('common.back')).toBe('Back');
      expect(t('common.next')).toBe('Next');
    });

    it.each(partial)('%s still overrides the leaves it does translate', (locale) => {
      expect(service.tFor(locale)('nav.dashboard')).not.toBe('Dashboard');
    });

    it('resolves every English key in every locale', () => {
      const leaves = (map: Record<string, unknown>, prefix = ''): string[] =>
        Object.entries(map).flatMap(([key, value]) => {
          const path = prefix ? `${prefix}.${key}` : key;
          return value !== null && typeof value === 'object' && !Array.isArray(value)
            ? leaves(value as Record<string, unknown>, path)
            : [path];
        });

      const englishKeys = leaves(TRANSLATIONS.en as Record<string, unknown>);
      const unresolved = (Object.keys(TRANSLATIONS) as SupportedLanguage[]).flatMap((locale) => {
        const t = service.tFor(locale);
        return englishKeys.filter((key) => t(key) === key).map((key) => `${locale}:${key}`);
      });

      expect(unresolved).toEqual([]);
    });
  });
});
