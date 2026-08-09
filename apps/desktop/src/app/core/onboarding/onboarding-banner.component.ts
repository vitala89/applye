import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { OnboardingBannerStore } from '@applye/application';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { OnboardingService } from './onboarding.service';

/** Dashboard nudge shown after the user skipped onboarding while their
 * profile is still empty. "Finish setup" reopens the overlay via the shared
 * OnboardingService signal (see onboarding.service.ts + app.ts gate). */
@Component({
  selector: 'app-onboarding-banner',
  standalone: true,
  imports: [ButtonDirective],
  providers: [OnboardingBannerStore],
  template: `
    @if (banner.visible()) {
      <div class="ob-banner" role="status">
        <span>{{ t()('onboarding.banner.text') }}</span>
        <span class="ob-banner__actions">
          <button appButton variant="primary" size="sm" (click)="finishSetup()">
            {{ t()('onboarding.banner.cta') }}
          </button>
          <button appButton variant="ghost" size="sm" (click)="banner.dismiss()">
            {{ t()('onboarding.banner.dismiss') }}
          </button>
        </span>
      </div>
    }
  `,
  styles: [
    `
      .ob-banner {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 1rem;
        border-radius: 8px;
        background: var(--surface-2, #1e1e24);
        margin-bottom: 1rem;
      }
      .ob-banner__actions {
        display: flex;
        gap: 0.5rem;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingBannerComponent implements OnInit {
  private readonly i18n = inject(TranslateService);
  private readonly onboarding = inject(OnboardingService);
  protected readonly t = this.i18n.t;
  protected readonly banner = inject(OnboardingBannerStore);

  ngOnInit(): void {
    void this.banner.load();
  }

  /** Hides the nudge and asks the shell to reopen the wizard - the second half
   * stays here, because `OnboardingService` is the app's and not the store's. */
  finishSetup(): void {
    this.banner.dismiss();
    this.onboarding.requestOpen();
  }
}
