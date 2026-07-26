import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { DEFAULT_LOCALE, LocaleCode, localePath, LOCALES } from './locales';
import { Messages } from './messages';
import { de } from './messages/de';
import { en } from './messages/en';
import { es } from './messages/es';
import { pl } from './messages/pl';
import { ru } from './messages/ru';
import { uk } from './messages/uk';

const BUNDLES: Record<LocaleCode, Messages> = { en, de, es, pl, ru, uk };

/**
 * The same bundles, by locale, for code that has a locale but no service -
 * `SeoService` builds the landing page's FAQ structured data straight from the
 * route's declared locale rather than from whatever the reader last chose.
 */
export const MESSAGE_BUNDLES: Record<LocaleCode, Messages> = BUNDLES;

const STORAGE_KEY = 'applye-locale';

/**
 * Resolves the active locale from the route and exposes its message bundle.
 *
 * There are two locales, and the difference matters:
 *
 * - `pageLocale` is the language of the *content* on screen. It comes from the
 *   route (`data.locale`) and is `en` everywhere except the translated landing
 *   pages. SEO tags and the document `lang` follow this one, because claiming
 *   German for an English docs page would be a lie to the crawler.
 * - `uiLocale` is the language the *reader chose*. It is remembered across
 *   navigation, so following an English-only link (the docs, the changelog)
 *   does not silently throw someone back to English shell text, and the logo
 *   returns them to their own landing page rather than the English one.
 *
 * Locale is still a property of the URL, not a redirect trigger: `/de` is
 * always German for everyone, which keeps the pages cacheable, prerenderable
 * and linkable. The remembered choice only decides which URL our own links
 * point at - it never rewrites the URL you actually opened.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly page = signal<LocaleCode>(DEFAULT_LOCALE);
  private readonly chosen = signal<LocaleCode>(DEFAULT_LOCALE);

  /** Language of the content on this route. Drives `lang` and the SEO tags. */
  readonly locale = this.page.asReadonly();
  /** Language the reader picked, remembered across pages. Drives the shell. */
  readonly uiLocale = this.chosen.asReadonly();

  /** Bundle for the current page's content (used by the landing page). */
  readonly m = computed(() => BUNDLES[this.page()]);
  /** Bundle for the shell: nav, footer, consent bar, language switcher. */
  readonly ui = computed(() => BUNDLES[this.chosen()]);

  /** Where the logo and any other "home" link should go. */
  readonly homePath = computed(() => localePath(this.chosen()));

  readonly locales = LOCALES;

  constructor() {
    this.chosen.set(this.readStored() ?? DEFAULT_LOCALE);
    this.apply();
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => this.apply());
  }

  private apply(): void {
    const routeLocale = this.readRouteLocale();
    this.page.set(routeLocale ?? DEFAULT_LOCALE);

    // Opening a localised landing page *is* choosing that language - including
    // when someone arrives from a shared link rather than the switcher.
    if (routeLocale) this.remember(routeLocale);

    this.doc.documentElement.setAttribute('lang', routeLocale ?? DEFAULT_LOCALE);
  }

  private remember(code: LocaleCode): void {
    this.chosen.set(code);
    if (!this.isBrowser) return;
    try {
      this.doc.defaultView?.localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // Private mode or storage disabled: the choice holds for this session.
    }
  }

  private readStored(): LocaleCode | null {
    if (!this.isBrowser) return null;
    try {
      const v = this.doc.defaultView?.localStorage.getItem(STORAGE_KEY);
      return v && v in BUNDLES ? (v as LocaleCode) : null;
    } catch {
      return null;
    }
  }

  /** The route's declared locale, or null on the English-only pages. */
  private readRouteLocale(): LocaleCode | null {
    let node = this.route.snapshot;
    while (node.firstChild) node = node.firstChild;
    const code = node.data['locale'] as LocaleCode | undefined;
    return code && code in BUNDLES ? code : null;
  }
}
