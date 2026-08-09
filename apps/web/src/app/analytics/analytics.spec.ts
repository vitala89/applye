import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AnalyticsService, GtagWindow, installGtag } from './analytics.service';
import { ConsentService } from './consent.service';
import { detectOs, sanitiseParams } from './events';
import { GA_MEASUREMENT_ID } from './measurement-id';

const gaScripts = () => document.querySelectorAll('script[src*="googletagmanager"]').length;

describe('analytics consent gating', () => {
  beforeEach(() => {
    localStorage.clear();
    document.querySelectorAll('script[src*="googletagmanager"]').forEach((s) => s.remove());
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('loads nothing before a decision is made', () => {
    TestBed.inject(AnalyticsService);
    expect(TestBed.inject(ConsentService).consent()).toBe('unset');
    expect(gaScripts()).toBe(0);
  });

  it('loads nothing when the visitor declines', () => {
    TestBed.inject(AnalyticsService);
    TestBed.inject(ConsentService).deny();
    TestBed.tick();
    expect(gaScripts()).toBe(0);
  });

  it('still loads nothing on consent while the measurement ID is a placeholder', () => {
    TestBed.inject(AnalyticsService);
    TestBed.inject(ConsentService).grant();
    TestBed.tick();
    // site.ts ships G-PLACEHOLDER; a junk property must never be contacted.
    expect(gaScripts()).toBe(0);
  });

  it('remembers the decision across service instances', () => {
    TestBed.inject(ConsentService).deny();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    expect(TestBed.inject(ConsentService).consent()).toBe('denied');
  });

  it('sends nothing to gtag before consent, even when a call site asks it to', () => {
    const win = window as typeof window & { gtag?: unknown; dataLayer?: unknown[] };
    // Pretend GA is already on the page: the guard must be the consent state,
    // not merely the absence of the script.
    const calls: unknown[][] = [];
    win.gtag = (...args: unknown[]) => calls.push(args);

    const analytics = TestBed.inject(AnalyticsService);
    analytics.downloadClick('hero', 'https://github.com/vitala89/applye/releases');
    analytics.outboundClick('https://example.com/x', 'Example');
    analytics.ctaClick('read_docs', 'hero');
    analytics.localeSwitch('en', 'de');

    expect(calls).toEqual([]);
    delete win.gtag;
  });
});

describe('the gtag shim', () => {
  const fakeWindow = (): GtagWindow => ({}) as unknown as GtagWindow;

  it('queues each command as an arguments object, which is the only form gtag.js reads', () => {
    const win = fakeWindow();
    const gtag = installGtag(win);

    gtag('js', new Date());
    gtag('config', 'G-TESTID123', { send_page_view: false });

    // A plain array here is the shape that shipped between launch and
    // 2026-08-09: gtag.js ignores it, so `config` never runs, no destination is
    // configured, and the property receives nothing while every visible sign -
    // the injected script, window.gtag, a growing dataLayer - says it works.
    expect(win.dataLayer).toHaveLength(2);
    for (const queued of win.dataLayer ?? []) {
      expect(Object.prototype.toString.call(queued)).toBe('[object Arguments]');
      expect(Array.isArray(queued)).toBe(false);
    }
  });

  it('keeps the command and its parameters intact in the queue', () => {
    const win = fakeWindow();
    installGtag(win)('event', 'download_click', { os: 'macos' });

    const queued = Array.from((win.dataLayer ?? [])[0] as ArrayLike<unknown>);
    expect(queued).toEqual(['event', 'download_click', { os: 'macos' }]);
  });

  it('reuses a dataLayer the page already has rather than dropping queued commands', () => {
    const win = fakeWindow();
    win.dataLayer = ['pre-existing'];
    installGtag(win)('event', 'page_view');

    expect(win.dataLayer).toHaveLength(2);
    expect(win.dataLayer?.[0]).toBe('pre-existing');
  });

  it('publishes the shim on the window, so call sites reach the same queue', () => {
    const win = fakeWindow();
    const gtag = installGtag(win);
    expect(win.gtag).toBe(gtag);
  });
});

describe('event contract', () => {
  it('drops any parameter that is not on the documented allow list', () => {
    const out = sanitiseParams({
      os: 'macos',
      email: 'someone@example.com',
      user_id: '42',
      cta_id: 'read_docs',
    });
    expect(out).toEqual({ os: 'macos', cta_id: 'read_docs' });
  });

  it('drops empty and non-string values rather than sending blanks', () => {
    expect(sanitiseParams({ os: '', locale: undefined, cta_id: 7 })).toEqual({});
  });

  it('caps a parameter so a long value cannot become a payload', () => {
    const { link_text } = sanitiseParams({ link_text: 'x'.repeat(1000) });
    expect(link_text).toHaveLength(300);
  });

  it('reads the platform from the user agent, and does not mistake mobile for desktop', () => {
    expect(detectOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('macos');
    expect(detectOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
    expect(detectOs('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
    // Android reports "Linux" and iPadOS reports "Mac": neither is a desktop
    // installer target, so neither may be counted as one.
    expect(detectOs('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('other');
    expect(detectOs('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('other');
    expect(detectOs('')).toBe('other');
  });

  it('keeps the shipped measurement ID a placeholder', () => {
    // The real ID is written at build time by tools/generate-analytics-config.mjs.
    // Committing one would turn every checkout and CI run into live traffic.
    expect(GA_MEASUREMENT_ID).toBe('G-PLACEHOLDER');
  });

  it('declares the measurement ID as a widened string, not a literal', () => {
    // Without the `: string` annotation TypeScript infers the literal type of
    // the committed placeholder, and the guard in analytics.service.ts fails to
    // compile the moment a real ID is generated in. That breaks production
    // builds and nothing else, so the annotation is pinned here rather than
    // left to be rediscovered on a release.
    const source = readFileSync(join(__dirname, 'measurement-id.ts'), 'utf8');
    expect(source).toMatch(/^export const GA_MEASUREMENT_ID: string = '.*';$/m);
  });
});
