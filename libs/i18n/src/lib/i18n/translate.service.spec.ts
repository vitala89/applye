import { TestBed } from '@angular/core/testing';
import { SupportedLanguage } from '@applye/core';
import { stub } from '../translations/merge';
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

    it('returns the key itself when it exists in no bundle', () => {
      expect(service.tFor('de')('tracker.does_not_exist')).toBe('tracker.does_not_exist');
    });
  });

  describe('locale bundles', () => {
    // Every locale is complete today, so no shipped key exercises the English
    // fallback. `stub()` is still what makes a key added to `en` tomorrow show
    // up in English rather than as a raw dotted key, so it is tested directly
    // on a synthetic partial rather than on a gap that no longer exists.
    it('layers a partial locale over English without dropping the keys it omits', () => {
      const base = { section: { translated: 'Translated', untouched: 'Untouched' } };
      const merged = stub(base, { section: { translated: 'Übersetzt' } }) as {
        section: Record<string, string>;
      };

      expect(merged.section['translated']).toBe('Übersetzt');
      expect(merged.section['untouched']).toBe('Untouched');
    });

    const translated: SupportedLanguage[] = ['de', 'ru', 'es', 'fr', 'uk'];

    it.each(translated)('%s overrides the English leaves', (locale) => {
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
