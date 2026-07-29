import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { MESSAGE_BUNDLES } from '../i18n/i18n.service';
import { DEFAULT_LOCALE, LOCALES, LocaleCode, localePath } from '../i18n/locales';
import { SITE_ORIGIN, siteUrl } from '../site';

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
        map((e) => ({ url: e.urlAfterRedirects, leaf: this.deepestRoute() })),
      )
      .subscribe(({ url, leaf }) => this.apply(url, leaf));
  }

  private deepestRoute(): ActivatedRouteSnapshot {
    let node = this.route.snapshot;
    while (node.firstChild) node = node.firstChild;
    return node;
  }

  /**
   * The page title, taken from the route rather than from `Title.getTitle()`.
   *
   * Angular's title strategy also listens for `NavigationEnd`, and nothing
   * orders the two listeners. Reading the document title here returned the
   * *previous* page's title, which shipped a stale `og:title` on every page
   * except the landing ones - every shared docs link showed the home page's
   * headline. The route snapshot is already resolved when the event fires.
   */
  private pageTitle(leaf: ActivatedRouteSnapshot): string {
    return leaf.title ?? this.title.getTitle();
  }

  private apply(url: string, leaf: ActivatedRouteSnapshot): void {
    const data = leaf.data as SeoRouteData;
    const title = this.pageTitle(leaf);
    const description = data.description ?? DEFAULT_DESCRIPTION;
    const canonical = siteUrl(url);
    const image = `${SITE_ORIGIN}${data.image ?? DEFAULT_IMAGE}`;

    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: canonical });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ name: 'twitter:title', content: title });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: image });

    this.meta.updateTag({ property: 'og:locale', content: data.locale ?? DEFAULT_LOCALE });

    this.setCanonical(canonical);
    this.setAlternates(data.locale);
    this.setStructuredData(url, data.locale, canonical, title);
  }

  /**
   * Per-route JSON-LD, replaced on every navigation.
   *
   * `index.html` carries a static `SoftwareApplication` block describing the
   * product, which is true on every page and is left alone. These blocks
   * describe the *page*, so they are marked `data-seo` and cleared before each
   * write - without that, a single-page app accumulates the structured data of
   * every page the reader has passed through.
   *
   * Both kinds describe something the visitor can actually see on the page:
   * the FAQ block mirrors the questions rendered on that landing page, and the
   * breadcrumbs mirror the docs hierarchy. Structured data that describes
   * content which is not on the page is a manual-action risk, not a bonus.
   */
  private setStructuredData(
    url: string,
    locale: LocaleCode | undefined,
    canonical: string,
    title: string,
  ): void {
    this.doc.head.querySelectorAll('script[data-seo]').forEach((node) => node.remove());

    const blocks = [
      locale ? this.faqPage(locale) : undefined,
      this.breadcrumbs(url, canonical, title),
    ];

    for (const block of blocks) {
      if (!block) continue;
      const script = this.doc.createElement('script');
      script.setAttribute('type', 'application/ld+json');
      script.setAttribute('data-seo', '');
      script.textContent = JSON.stringify(block);
      this.doc.head.appendChild(script);
    }
  }

  /** The landing page's own FAQ, in the language that page is written in. */
  private faqPage(locale: LocaleCode): object | undefined {
    const items = MESSAGE_BUNDLES[locale]?.faq.items ?? [];
    if (!items.length) return undefined;

    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      inLanguage: locale,
      mainEntity: items.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    };
  }

  /**
   * Breadcrumbs for the documentation only. Every other route is one level
   * below the home page, where a breadcrumb trail states the obvious.
   */
  private breadcrumbs(url: string, canonical: string, title: string): object | undefined {
    const path = url.split('#')[0].split('?')[0];
    if (path !== '/docs' && !path.startsWith('/docs/')) return undefined;

    const trail: { name: string; item: string }[] = [
      { name: 'Applye', item: siteUrl('/') },
      { name: 'Docs', item: siteUrl('/docs') },
    ];

    if (path !== '/docs') {
      // Titles read "The Dashboard · Applye Docs"; the crumb wants the leaf.
      trail.push({ name: title.split('·')[0].trim(), item: canonical });
    }

    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: trail.map((crumb, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: crumb.name,
        item: crumb.item,
      })),
    };
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
      link.setAttribute('href', siteUrl(path));
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
