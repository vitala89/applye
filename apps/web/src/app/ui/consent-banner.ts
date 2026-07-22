import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, PLATFORM_ID } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalyticsService } from '../analytics/analytics.service';
import { ConsentService } from '../analytics/consent.service';

/**
 * Analytics opt-in bar. Shown once, until the visitor decides.
 *
 * Declining is a first-class button, not a buried link, and nothing loads
 * before an explicit "Allow". The decision can be changed later from the
 * cookies page.
 */
@Component({
  selector: 'app-consent-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <!-- Browser-only: the prerendered HTML must not show a bar to someone who
         already decided, which would flash away on hydration. -->
    @if (isBrowser && consent.needsDecision()) {
      <aside class="consent" role="region" aria-label="Analytics consent">
        <div class="consent__inner shell">
          <p class="consent__copy">
            We would like to count anonymous page views to see which docs are worth writing. No
            cookies and no requests to Google happen unless you allow it, and the app itself never
            sends anything either way.
            <a routerLink="/cookies">What is collected</a>
          </p>
          <div class="consent__actions">
            <button type="button" class="btn btn--ghost" (click)="decline()">Decline</button>
            <button type="button" class="btn btn--primary" (click)="allow()">
              Allow analytics
            </button>
          </div>
        </div>
      </aside>
    }
  `,
})
export class ConsentBanner {
  readonly consent = inject(ConsentService);
  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly analytics = inject(AnalyticsService);

  allow(): void {
    this.consent.grant();
    this.analytics.event('consent_decision', { decision: 'granted' });
  }

  decline(): void {
    this.consent.deny();
  }
}
