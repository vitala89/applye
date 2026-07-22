import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, signal } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { DEFAULT_LOCALE, LocaleCode, LOCALES } from './locales';
import { Messages } from './messages';
import { de } from './messages/de';
import { en } from './messages/en';
import { es } from './messages/es';
import { pl } from './messages/pl';
import { ru } from './messages/ru';
import { uk } from './messages/uk';

const BUNDLES: Record<LocaleCode, Messages> = { en, de, es, pl, ru, uk };

/**
 * Resolves the active locale from the route and exposes its message bundle.
 *
 * Locale is a property of the URL, not of a cookie or a browser header: `/de`
 * is always German for everyone, which is what makes the pages cacheable,
 * prerenderable and linkable. Routes declare their locale in `data.locale`;
 * anything without one is English.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly current = signal<LocaleCode>(DEFAULT_LOCALE);

  readonly locale = this.current.asReadonly();
  readonly m = computed(() => BUNDLES[this.current()]);
  readonly locales = LOCALES;

  constructor() {
    this.apply(this.readLocale());
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => this.apply(this.readLocale()));
  }

  private apply(code: LocaleCode): void {
    this.current.set(code);
    // Keep the document language honest for screen readers and for crawlers.
    this.doc.documentElement.setAttribute('lang', code);
  }

  private readLocale(): LocaleCode {
    let node = this.route.snapshot;
    while (node.firstChild) node = node.firstChild;
    const code = node.data['locale'] as LocaleCode | undefined;
    return code && code in BUNDLES ? code : DEFAULT_LOCALE;
  }
}
