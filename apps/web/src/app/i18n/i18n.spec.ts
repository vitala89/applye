import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { appRoutes } from '../app.routes';
import { I18nService } from './i18n.service';
import { LOCALES } from './locales';
import { Messages } from './messages';
import { de } from './messages/de';
import { en } from './messages/en';
import { es } from './messages/es';
import { pl } from './messages/pl';
import { ru } from './messages/ru';
import { uk } from './messages/uk';

const BUNDLES: Record<string, Messages> = { en, de, es, pl, ru, uk };

/** Every leaf string in a bundle, as `path -> value`. */
function flatten(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  if (Array.isArray(value)) {
    return Object.assign({}, ...value.map((v, i) => flatten(v, `${prefix}[${i}]`)));
  }
  if (value && typeof value === 'object') {
    return Object.assign(
      {},
      ...Object.entries(value).map(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k)),
    );
  }
  return {};
}

describe('locale bundles', () => {
  const english = flatten(en);

  it('ships a bundle for every declared locale', () => {
    expect(LOCALES.map((l) => l.code).filter((c) => !BUNDLES[c])).toEqual([]);
  });

  for (const locale of LOCALES) {
    describe(locale.code, () => {
      const bundle = flatten(BUNDLES[locale.code]);

      it('has exactly the same keys as English', () => {
        expect(Object.keys(bundle).sort()).toEqual(Object.keys(english).sort());
      });

      it('has no empty strings', () => {
        expect(Object.entries(bundle).filter(([, v]) => v.trim() === '')).toEqual([]);
      });

      if (locale.code !== 'en') {
        it('actually translates the headline rather than copying English', () => {
          expect(bundle['hero.titleTop']).not.toBe(english['hero.titleTop']);
          expect(bundle['faq.items[0].a']).not.toBe(english['faq.items[0].a']);
        });
      }

      it('has a landing route', () => {
        const path = locale.code === 'en' ? '' : locale.code;
        expect(appRoutes.some((r) => r.path === path && r.data?.['locale'] === locale.code)).toBe(
          true,
        );
      });
    });
  }

  it('remembers a chosen language across English-only pages', () => {
    localStorage.setItem('applye-locale', 'ru');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });

    const i18n = TestBed.inject(I18nService);

    // The route carries no locale (it stands in for the docs), so the page
    // content stays English while the shell and the logo keep the choice.
    expect(i18n.locale()).toBe('en');
    expect(i18n.uiLocale()).toBe('ru');
    expect(i18n.ui().nav.docs).toBe(ru.nav.docs);
    expect(i18n.homePath()).toBe('/ru');

    localStorage.clear();
  });

  it('falls back to English when nothing was chosen', () => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });

    const i18n = TestBed.inject(I18nService);
    expect(i18n.uiLocale()).toBe('en');
    expect(i18n.homePath()).toBe('/');
  });

  it('ignores a junk value in storage', () => {
    localStorage.setItem('applye-locale', 'klingon');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });

    expect(TestBed.inject(I18nService).uiLocale()).toBe('en');
    localStorage.clear();
  });

  it('pairs one icon with every principle', () => {
    // The landing pairs icons to principles by index, so a locale that adds or
    // drops a principle would silently shift the icons.
    for (const locale of LOCALES) {
      expect(BUNDLES[locale.code].principles).toHaveLength(en.principles.length);
      expect(BUNDLES[locale.code].features.items).toHaveLength(en.features.items.length);
    }
  });
});
