#!/usr/bin/env node
/**
 * Writes apps/web/public/sitemap.xml from tools/site-paths.json.
 *
 * Run it before a production build (`npm run web:sitemap`) so the shipped
 * sitemap matches the routes that actually exist. The path list is verified
 * against app.routes.ts by apps/web/src/app/seo/seo.spec.ts, so a new page
 * cannot silently stay out of the sitemap.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'https://applye.dev';

/**
 * Mirrors `siteUrl` in src/app/site.ts, which cannot be imported here: this is
 * a plain Node script that runs before the Angular build. The trailing slash
 * is the form Cloudflare Pages serves - `/docs` 308s to `/docs/` - and a
 * sitemap full of redirecting URLs is reported as such rather than indexed.
 * A test asserts the two agree.
 */
const locFor = (path) => `${ORIGIN}${path.endsWith('/') ? path : `${path}/`}`;

const { paths } = JSON.parse(readFileSync(resolve(here, 'site-paths.json'), 'utf8'));
const lastmod = new Date().toISOString().slice(0, 10);

/** The landing page outranks the docs, which outrank the marketing long-tail. */
const priorityFor = (path) => {
  if (path === '/') return '1.0';
  if (path === '/docs') return '0.9';
  if (path.startsWith('/docs/')) return '0.7';
  return '0.6';
};

const urls = paths
  .map(
    (path) =>
      `  <url>\n` +
      `    <loc>${locFor(path)}</loc>\n` +
      `    <lastmod>${lastmod}</lastmod>\n` +
      `    <changefreq>weekly</changefreq>\n` +
      `    <priority>${priorityFor(path)}</priority>\n` +
      `  </url>`,
  )
  .join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

const out = resolve(here, '../public/sitemap.xml');
writeFileSync(out, xml, 'utf8');
console.log(`sitemap: ${paths.length} urls -> ${out}`);
