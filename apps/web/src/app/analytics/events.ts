/**
 * The complete list of what applye.dev measures.
 *
 * This file is the contract. `/cookies` and `/privacy` describe it in prose to
 * visitors, `analytics.spec.ts` asserts nothing outside it can be sent, and the
 * GA4 property registers `EVENT_PARAMS` as custom dimensions. If an event is
 * added here, all three have to move with it - that coupling is deliberate,
 * because an undocumented event on a privacy-first site is a broken promise.
 *
 * Names are snake_case to match GA4's own conventions, and every one of them is
 * a custom event: no GA4 automatic or enhanced-measurement event is used, and
 * enhanced measurement is switched off on the data stream so nothing is
 * collected that does not appear below.
 */

/** Every event the site may ever send. */
export const EVENT_NAMES = [
  /** A route change. Sent manually because GA's own SPA page views are off. */
  'page_view',
  /** The visitor accepted or declined analytics. */
  'consent_decision',
  /** A click on something that leads to an installer or the releases page. */
  'download_click',
  /** A click that leaves applye.dev for another domain. */
  'outbound_click',
  /** A click on a tracked call to action that stays on the site. */
  'cta_click',
  /** The visitor changed the site language. */
  'locale_switch',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/**
 * Every parameter any event may carry. Anything not on this list is dropped
 * before it reaches gtag, so a careless call site cannot widen collection.
 *
 * Each of these except `page_path` and `page_title` needs a matching
 * event-scoped custom dimension in the GA4 property, or it is recorded and
 * never reportable. See docs/internal/ANALYTICS_SETUP.md.
 */
export const EVENT_PARAMS = [
  'page_path',
  'page_title',
  'locale',
  'decision',
  'os',
  'source_section',
  'cta_id',
  'link_domain',
  'link_url',
  'link_text',
  'from_locale',
  'to_locale',
] as const;

export type EventParam = (typeof EVENT_PARAMS)[number];

export type EventParams = Partial<Record<EventParam, string>>;

/**
 * Where on the page the interaction happened. Without this, every download
 * click looks alike and there is no way to learn which surface actually
 * converts.
 */
export type SourceSection = 'hero' | 'nav' | 'footer' | 'docs' | 'compare' | 'press' | 'landing';

/**
 * The visitor's operating system, guessed from the user agent.
 *
 * This describes the *visitor*, not the file: the download link points at the
 * GitHub releases page, and which asset they pick there happens on a domain we
 * cannot and should not observe. Knowing which platform the demand comes from
 * is the question worth answering, and it needs no new data collection - the
 * user agent is already sent with every request.
 */
export type ClientOs = 'macos' | 'windows' | 'linux' | 'other';

export function detectOs(userAgent: string): ClientOs {
  const ua = userAgent.toLowerCase();
  // Order matters: Android reports "linux", and iPadOS reports "mac".
  if (/android|iphone|ipad|ipod/.test(ua)) return 'other';
  if (/mac os x|macintosh/.test(ua)) return 'macos';
  if (/windows/.test(ua)) return 'windows';
  if (/linux|x11|cros/.test(ua)) return 'linux';
  return 'other';
}

/** Keeps only parameters on the allow list, and only non-empty strings. */
export function sanitiseParams(params: Record<string, unknown>): EventParams {
  const allowed = new Set<string>(EVENT_PARAMS);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!allowed.has(key)) continue;
    if (typeof value !== 'string' || value.length === 0) continue;
    // A cap, so an absurd link text or path cannot become a payload.
    out[key] = value.slice(0, 300);
  }
  return out as EventParams;
}
