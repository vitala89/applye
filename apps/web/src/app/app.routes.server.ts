import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Everything is prerendered to static HTML at build time, so each page ships
 * its own title, meta description and Open Graph tags for crawlers that do not
 * execute JavaScript (LinkedIn, Slack and Telegram link previews, among
 * others). The wildcard route is the 404 fallback and is rendered too.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
