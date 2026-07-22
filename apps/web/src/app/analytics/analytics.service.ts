import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { effect, inject, Injectable, PLATFORM_ID } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { GA_MEASUREMENT_ID } from '../site';
import { ConsentService } from './consent.service';

type Gtag = (...args: unknown[]) => void;

interface GtagWindow extends Window {
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
 * PLACEHOLDER: `GA_MEASUREMENT_ID` in site.ts still holds `G-PLACEHOLDER`.
 * Analytics stays disabled until a real ID is set, so development builds and
 * previews never pollute the property.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly consent = inject(ConsentService);
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

  /** Records a named interaction (download click, consent decision, and so on). */
  event(name: string, params: Record<string, unknown> = {}): void {
    this.gtag()?.('event', name, params);
  }

  private pageView(path: string): void {
    this.gtag()?.('event', 'page_view', {
      page_path: path,
      page_title: this.doc.title,
    });
  }

  private load(): void {
    if (this.loaded || !this.configured) return;
    this.loaded = true;

    const win = this.doc.defaultView as GtagWindow | null;
    if (!win) return;

    win.dataLayer = win.dataLayer ?? [];
    const gtag: Gtag = (...args: unknown[]) => {
      win.dataLayer?.push(args);
    };
    win.gtag = gtag;

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
