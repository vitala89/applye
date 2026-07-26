import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { provideRouter, Route } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appRoutes } from '../app.routes';
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
