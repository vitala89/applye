import { Injectable, inject, signal } from '@angular/core';
import { ProfileSettingsGateway } from '@applye/data';
import { shouldShowOnboardingBanner } from './onboarding-gate.util';

/**
 * Whether the dashboard's "finish setup" nudge is showing.
 *
 * One boolean, which is the smallest state this layer has owned - and it is
 * here for the reason the size does not change: the banner had to read
 * `getSettings` and `getProfile` to decide, so the component was injecting the
 * gateway (ADR-0005, amendment twenty-five). The predicate came down with the
 * store, because `libs/application` cannot import from the app.
 *
 * **It does not open the wizard.** That goes through the app's
 * `OnboardingService`, a shared signal the app shell also watches, and this
 * layer has no business knowing about it - the same boundary that keeps the
 * other stores from navigating or raising toasts (amendment three).
 */
@Injectable()
export class OnboardingBannerStore {
  private readonly db = inject(ProfileSettingsGateway);

  readonly visible = signal(false);

  /**
   * Never rejects. A failed read means the nudge stays hidden, which is the
   * behaviour the component had: a banner is not worth an error state, and
   * showing it on a read that failed would nag a user whose profile may well
   * be complete.
   */
  async load(): Promise<void> {
    try {
      const [settings, profile] = await Promise.all([this.db.getSettings(), this.db.getProfile()]);
      this.visible.set(shouldShowOnboardingBanner(settings, profile));
    } catch {
      this.visible.set(false);
    }
  }

  dismiss(): void {
    this.visible.set(false);
  }
}
