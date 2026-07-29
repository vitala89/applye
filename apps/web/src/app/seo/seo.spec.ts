import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { provideRouter, Route } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appRoutes } from '../app.routes';
import { SEARCH_INDEXABLE, SITE_ORIGIN, siteUrl } from '../site';
import { SeoService } from './seo.service';

@Component({ selector: 'app-blank', standalone: true, template: '' })
class Blank {}

/** Flattens the route tree into concrete URL paths, skipping wildcards. */
function collectPaths(routes: Route[], prefix = ''): string[] {
  const out: string[] = [];
  for (const route of routes) {
    if (route.path === '**') continue;
    const path = route.path === '' ? prefix : `${prefix}/${route.path}`;
    if (route.component || route.loadComponent) {
      out.push(path === '' ? '/' : path);
    }
    if (route.children) {
      out.push(...collectPaths(route.children, path));
    }
  }
  return out;
}

const sitePaths: string[] = JSON.parse(
  readFileSync(join(__dirname, '../../../tools/site-paths.json'), 'utf8'),
).paths;

describe('SEO route manifest', () => {
  const routed = collectPaths(appRoutes);

  it('lists every routed page in site-paths.json', () => {
    const missing = routed.filter((p) => !sitePaths.includes(p));
    expect(missing).toEqual([]);
  });

  it('does not list paths that no longer route anywhere', () => {
    const stale = sitePaths.filter((p) => !routed.includes(p));
    expect(stale).toEqual([]);
  });

  it('gives every routed page a meta description', () => {
    const walk = (routes: Route[]): string[] =>
      routes.flatMap((route) => {
        // Layout routes (those with children) delegate their meta to the child
        // that actually renders, so only leaf routes need a description.
        const isLeaf = (route.component || route.loadComponent) && !route.children;
        const missing = isLeaf && !route.data?.['description'] ? [route.path ?? ''] : [];
        return [...missing, ...(route.children ? walk(route.children) : [])];
      });

    expect(walk(appRoutes.filter((r) => r.path !== '**'))).toEqual([]);
  });

  /**
   * `SeoService.breadcrumbs` takes the leaf crumb from the page title, cutting
   * at the separator. A docs title without one would put the whole string,
   * "Applye Docs" and all, into the breadcrumb.
   */
  it('gives every docs page a title the breadcrumb can cut down', () => {
    const docs = appRoutes.find((r) => r.path === 'docs');
    const children = (docs?.children ?? []).filter((r) => r.path !== '');

    const unusable = children
      .map((r) => String(r.title ?? ''))
      .filter((title) => !title.includes('·') || title.split('·')[0].trim() === '');

    expect(unusable).toEqual([]);
  });

  it('keeps descriptions inside the length search engines display', () => {
    const walk = (routes: Route[]): string[] =>
      routes.flatMap((route) => {
        const description = route.data?.['description'] as string | undefined;
        const tooLong = description && description.length > 200 ? [route.path ?? ''] : [];
        return [...tooLong, ...(route.children ? walk(route.children) : [])];
      });

    expect(walk(appRoutes)).toEqual([]);
  });
});

describe('search indexing switch', () => {
  const headers = readFileSync(join(__dirname, '../../../public/_headers'), 'utf8');
  const sendsNoindex = headers
    .split('\n')
    .some((line) => /^\s*X-Robots-Tag:\s*noindex/i.test(line));

  /**
   * Two files have to agree, and neither is obvious from the other. The flag is
   * what a reader of the source sees; the header is what a crawler sees. Left
   * to drift, the likely failure is a site that is live, finished, and quietly
   * still telling Google to stay away.
   */
  it('keeps the noindex header and SEARCH_INDEXABLE in step', () => {
    expect(sendsNoindex).toBe(!SEARCH_INDEXABLE);
  });

  it('lets crawlers fetch, so they can read the noindex it is sent', () => {
    const robots = readFileSync(join(__dirname, '../../../public/robots.txt'), 'utf8');
    expect(robots).not.toMatch(/^\s*Disallow:\s*\/\s*$/m);
  });
});

/**
 * The build writes `de/index.html`, so Cloudflare Pages answers `/de` with a
 * 308 to `/de/`. Every URL handed to a crawler therefore has to carry the
 * slash, or the sitemap points at redirects and each landing page names a
 * redirecting URL as its own canonical. The symptom is not an error anywhere -
 * it is Search Console quietly reporting "Page with redirect" instead of
 * indexing, which is why this is pinned rather than left to review.
 */
describe('trailing slashes', () => {
  const sitemap = readFileSync(join(__dirname, '../../../public/sitemap.xml'), 'utf8');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  it('has a sitemap that is not empty, so the checks below mean something', () => {
    expect(locs.length).toBeGreaterThan(0);
  });

  it('ends every sitemap URL with a slash, matching what the server serves', () => {
    expect(locs.filter((loc) => !loc.endsWith('/'))).toEqual([]);
  });

  it('builds canonical URLs in the same form', () => {
    expect(siteUrl('/')).toBe(`${SITE_ORIGIN}/`);
    expect(siteUrl('/de')).toBe(`${SITE_ORIGIN}/de/`);
    expect(siteUrl('/docs/guide/tour')).toBe(`${SITE_ORIGIN}/docs/guide/tour/`);
  });

  it('does not double the slash on a path that already has one', () => {
    expect(siteUrl('/docs/')).toBe(`${SITE_ORIGIN}/docs/`);
  });

  it('drops the fragment and query a canonical must never carry', () => {
    expect(siteUrl('/docs#install')).toBe(`${SITE_ORIGIN}/docs/`);
    expect(siteUrl('/docs?ref=x')).toBe(`${SITE_ORIGIN}/docs/`);
  });

  it('agrees with the sitemap generator, which cannot import it', () => {
    const generator = readFileSync(join(__dirname, '../../../tools/generate-sitemap.mjs'), 'utf8');
    const paths: string[] = JSON.parse(
      readFileSync(join(__dirname, '../../../tools/site-paths.json'), 'utf8'),
    ).paths;
    expect(generator).toContain('endsWith');
    for (const path of paths) expect(locs).toContain(siteUrl(path));
  });
});

describe('SeoService tags', () => {
  /**
   * A regression test for a bug that shipped silently: `og:title` was read
   * from `Title.getTitle()` while Angular's title strategy was still one
   * navigation behind, so every page except the landing ones advertised the
   * home page's headline when shared.
   */
  it('takes og:title from the route being navigated to, not the previous one', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'first', component: Blank, title: 'First page · Applye' },
          { path: 'second', component: Blank, title: 'Second page · Applye' },
        ]),
      ],
    });

    TestBed.inject(SeoService);
    const harness = await RouterTestingHarness.create();
    const meta = TestBed.inject(Meta);

    await harness.navigateByUrl('/first');
    expect(meta.getTag('property="og:title"')?.content).toBe('First page · Applye');

    await harness.navigateByUrl('/second');
    expect(meta.getTag('property="og:title"')?.content).toBe('Second page · Applye');
  });
});
