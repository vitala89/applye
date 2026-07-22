import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Route } from '@angular/router';
import { appRoutes } from '../app.routes';

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
