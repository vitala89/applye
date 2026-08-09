import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { effect, inject, Injectable, PLATFORM_ID } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { I18nService } from '../i18n/i18n.service';
import { ConsentService } from './consent.service';
import {
  ClientOs,
  detectOs,
  EventName,
  EventParams,
  sanitiseParams,
  SourceSection,
} from './events';
import { GA_MEASUREMENT_ID } from './measurement-id';

export type Gtag = (...args: unknown[]) => void;

export interface GtagWindow extends Window {
  dataLayer?: unknown[];
  gtag?: Gtag;
}

/**
 * Google Analytics 4, wired so that it cannot run without consent.
 *
 * The gtag script tag is injected only after `ConsentService` reports
 * `granted`. Until then the page makes no request to Google, sets no cookie,
 * and queues nothing. Once loaded, GA runs with IP anonymisation on and both
 * ad-personalisation signals off, so it reports traffic shape and nothing else.
 *
 * The measurable surface is fixed by `events.ts`: every payload passes through
 * `sanitiseParams`, so a call site cannot widen collection past the list the
 * `/cookies` page shows visitors. GA's own enhanced measurement is switched off
 * on the data stream, and `send_page_view` is false, so nothing is collected
 * that this file did not send on purpose.
 *
 * `GA_MEASUREMENT_ID` is generated at build time from an environment variable
 * and stays `G-PLACEHOLDER` unless one is set, so dev servers, tests and
 * preview builds never reach a real property.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly consent = inject(ConsentService);
  private readonly i18n = inject(I18nService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private loaded = false;

  /**
   * False while the measurement ID is still the placeholder, so a build with an
   * unset ID never fires a request at Google with a junk property id.
   */
  private readonly configured =
    GA_MEASUREMENT_ID !== 'G-PLACEHOLDER' && /^G-[A-Z0-9]{6,}$/.test(GA_MEASUREMENT_ID);

  constructor() {
    if (!this.isBrowser) return;

    effect(() => {
      if (this.consent.granted()) {
        this.load();
      }
    });

    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.pageView(e.urlAfterRedirects));
  }

  /**
   * Records one of the named events from `events.ts`.
   *
   * `locale` rides along on everything: the site ships six landing pages, and a
   * traffic report that cannot tell them apart cannot answer which translation
   * is worth maintaining.
   */
  event(name: EventName, params: EventParams = {}): void {
    this.gtag()?.('event', name, {
      ...sanitiseParams(params),
      locale: this.i18n.locale(),
    });
  }

  /**
   * A click on a link that leads to an installer or the releases page.
   *
   * This counts *intent*, not installs. The link leaves for GitHub, so the file
   * transfer itself happens where no site analytics can see it; the honest
   * count of completed downloads comes from the GitHub releases API instead
   * (see docs/internal/ANALYTICS_SETUP.md).
   */
  downloadClick(section: SourceSection, url: string): void {
    this.event('download_click', {
      source_section: section,
      os: this.os(),
      link_url: url,
      link_domain: domainOf(url),
    });
  }

  /** A click that leaves applye.dev. */
  outboundClick(url: string, text: string): void {
    this.event('outbound_click', {
      link_url: url,
      link_domain: domainOf(url),
      link_text: text,
    });
  }

  /** A click on a tracked call to action that stays on the site. */
  ctaClick(id: string, section: SourceSection): void {
    this.event('cta_click', { cta_id: id, source_section: section });
  }

  /** The reader switched the site language. */
  localeSwitch(from: string, to: string): void {
    this.event('locale_switch', { from_locale: from, to_locale: to });
  }

  private os(): ClientOs {
    return detectOs(this.doc.defaultView?.navigator.userAgent ?? '');
  }

  private pageView(path: string): void {
    this.event('page_view', { page_path: path, page_title: this.doc.title });
  }

  private load(): void {
    if (this.loaded || !this.configured) return;
    this.loaded = true;

    const win = this.doc.defaultView as GtagWindow | null;
    if (!win) return;

    const gtag = installGtag(win);

    const script = this.doc.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    this.doc.head.appendChild(script);

    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID, {
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      // Page views are sent by the router subscription so SPA navigation is counted.
      send_page_view: false,
    });

    this.pageView(this.router.url);
  }

  private gtag(): Gtag | undefined {
    if (!this.isBrowser || !this.consent.granted()) return undefined;
    return (this.doc.defaultView as GtagWindow | null)?.gtag;
  }
}

/**
 * Installs the `gtag` shim and returns it.
 *
 * `dataLayer.push(arguments)` is load-bearing, not a stylistic copy of Google's
 * snippet. gtag.js reads a queued command only when the pushed value is an
 * `arguments` object; a plain array is not recognised as a command and is
 * silently ignored. Shipping the array form cost the property every hit between
 * launch and 2026-08-09: the script loaded, `window.gtag` existed, the container
 * registered under the measurement ID, `dataLayer` filled up - and `js` and
 * `config` never ran, so no destination was ever configured and not one
 * `/g/collect` request left the page. The failure is invisible from the console:
 * nothing throws, nothing warns, and GA4 simply reports "data collection isn't
 * active". Hence the rest-parameter lint rule is disabled here rather than
 * obeyed, and a test pins the pushed value's type.
 */
export function installGtag(win: GtagWindow): Gtag {
  win.dataLayer = win.dataLayer ?? [];
  function gtag(): void {
    // eslint-disable-next-line prefer-rest-params
    win.dataLayer?.push(arguments);
  }
  win.gtag = gtag as Gtag;
  return gtag as Gtag;
}

/** Bare host of a URL, so reports group by destination rather than by query string. */
function domainOf(url: string): string {
  try {
    return new URL(url, 'https://applye.dev').hostname;
  } catch {
    return '';
  }
}
