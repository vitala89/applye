import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { DEFAULT_LOCALE, LOCALES, LocaleCode, localePath } from '../i18n/locales';
import { SITE_ORIGIN } from '../site';

/** Route `data` fields this service understands. Set them in app.routes.ts. */
export interface SeoRouteData {
  /** Meta description for the page. Aim for 120-160 characters. */
  description?: string;
  /** Overrides the Open Graph image path (relative to the site origin). */
  image?: string;
  /** Set on the landing pages, which are the only localised routes. */
  locale?: LocaleCode;
}

const DEFAULT_DESCRIPTION =
  'A free, open-source desktop app for an AI-powered job search, running entirely on your own machine. Blunt recruiter checks, tailored CVs, a pipeline kanban.';

const DEFAULT_IMAGE = '/og/applye-og.png';

/**
 * Keeps per-route SEO tags in sync with navigation.
 *
 * `index.html` only carries the defaults, which is all a crawler sees for a
 * single-page app unless something rewrites them. This service rewrites the
 * description, canonical URL and Open Graph block on every navigation, using
 * the `description` field declared on each route.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        map((e) => ({ url: e.urlAfterRedirects, data: this.deepestData() })),
      )
      .subscribe(({ url, data }) => this.apply(url, data));
  }

  private deepestData(): SeoRouteData {
    let node = this.route.snapshot;
    while (node.firstChild) node = node.firstChild;
    return node.data as SeoRouteData;
  }

  private apply(url: string, data: SeoRouteData): void {
    const description = data.description ?? DEFAULT_DESCRIPTION;
    const canonical = `${SITE_ORIGIN}${url === '/' ? '' : url.split('#')[0].split('?')[0]}`;
    const image = `${SITE_ORIGIN}${data.image ?? DEFAULT_IMAGE}`;

    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:title', content: this.title.getTitle() });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: canonical });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ name: 'twitter:title', content: this.title.getTitle() });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: image });

    this.meta.updateTag({ property: 'og:locale', content: data.locale ?? DEFAULT_LOCALE });

    this.setCanonical(canonical);
    this.setAlternates(data.locale);
  }

  /**
   * Emits `hreflang` alternates, but only between the landing pages - the only
   * routes that exist in more than one language. Claiming an alternate for a
   * page that is English everywhere would be a lie to the crawler.
   */
  private setAlternates(locale: LocaleCode | undefined): void {
    this.doc.head
      .querySelectorAll('link[rel="alternate"][hreflang]')
      .forEach((node) => node.remove());

    if (!locale) return;

    const add = (hreflang: string, path: string) => {
      const link = this.doc.createElement('link');
      link.setAttribute('rel', 'alternate');
      link.setAttribute('hreflang', hreflang);
      link.setAttribute('href', `${SITE_ORIGIN}${path}`);
      this.doc.head.appendChild(link);
    };

    for (const l of LOCALES) add(l.code, localePath(l.code));
    add('x-default', localePath(DEFAULT_LOCALE));
  }

  private setCanonical(href: string): void {
    let link = this.doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.doc.head.appendChild(link);
    }
    link.setAttribute('href', href);
  }
}
