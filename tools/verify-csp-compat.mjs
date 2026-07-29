#!/usr/bin/env node
/**
 * Guard against a bug class that only appears in a packaged build.
 *
 * The desktop app runs under the CSP declared in `tauri.conf.json`. When that
 * policy's `script-src` omits `'unsafe-inline'` - which it should - the webview
 * refuses to run inline event handler attributes. Angular's `inlineCritical`
 * optimisation emits exactly that: it defers the real stylesheet with
 * `media="print"` and relies on an inline `onload` to switch it back to
 * `media="all"`. The handler never fires, the stylesheet never applies, and the
 * app renders with only its critical CSS - correct fonts, no layout at all.
 *
 * Nothing catches this earlier: `nx build` succeeds, every unit test passes, and
 * `npm run desktop:dev` is fine because the optimisation is production-only. The
 * first symptom is a shipped, unstyled application.
 *
 * Run after building the desktop frontend and before bundling.
 */
import { readFileSync, existsSync } from 'node:fs';

const INDEX = 'dist/apps/desktop/browser/index.html';
const CONF = 'apps/desktop/src-tauri/tauri.conf.json';

const fail = (msg) => {
  console.error(`\n  CSP compatibility check FAILED\n\n${msg}\n`);
  process.exit(1);
};

if (!existsSync(INDEX)) {
  fail(`No build output at ${INDEX}.\n  Run \`npx nx build desktop\` first.`);
}

const html = readFileSync(INDEX, 'utf8');
const csp = JSON.parse(readFileSync(CONF, 'utf8')).app?.security?.csp ?? '';

const scriptSrc = csp.match(/script-src([^;]*)/)?.[1] ?? '';
const inlineScriptAllowed = scriptSrc.includes("'unsafe-inline'");

// 1. Inline event handlers are dead code under a strict script-src.
const handlers = [...html.matchAll(/\son[a-z]+\s*=\s*"[^"]*"/gi)].map((m) => m[0].trim());
if (handlers.length > 0 && !inlineScriptAllowed) {
  fail(
    `index.html carries ${handlers.length} inline event handler(s), but the app's CSP\n` +
      `  script-src does not allow inline scripts, so none of them will ever run:\n\n` +
      handlers.map((h) => `    ${h}`).join('\n') +
      `\n\n  Usual cause: Angular's \`inlineCritical\` optimisation. Turn it off in\n` +
      `  apps/desktop/project.json under configurations.production.optimization.styles.`,
  );
}

// 2. A stylesheet parked on media="print" only reaches the screen via a handler.
const deferred = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/gi)]
  .map((m) => m[0])
  .filter((tag) => /media\s*=\s*"print"/i.test(tag));
if (deferred.length > 0 && !inlineScriptAllowed) {
  fail(
    `A stylesheet is deferred with media="print" and can only be activated by an\n` +
      `  inline handler, which this CSP blocks. The app would render unstyled:\n\n` +
      deferred.map((t) => `    ${t}`).join('\n'),
  );
}

// 3. Something has to actually style the app.
const sheets = (html.match(/<link[^>]+rel="stylesheet"/gi) ?? []).length;
if (sheets === 0 && !/<style[\s>]/i.test(html)) {
  fail('index.html references no stylesheet and carries no inline styles.');
}

console.log(`  CSP compatibility OK - ${sheets} stylesheet link(s), no handler-dependent styling.`);
