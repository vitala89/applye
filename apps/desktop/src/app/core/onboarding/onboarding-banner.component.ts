import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { OnboardingService } from './onboarding.service';
import { shouldShowOnboardingBanner } from './onboarding-gate.util';

/** Dashboard nudge shown after the user skipped onboarding while their
 * profile is still empty. "Finish setup" reopens the overlay via the shared
 * OnboardingService signal (see onboarding.service.ts + app.ts gate). */
@Component({
  selector: 'app-onboarding-banner',
  standalone: true,
  imports: [ButtonDirective],
  template: `
    @if (visible()) {
      <div class="ob-banner" role="status">
        <span>{{ t()('onboarding.banner.text') }}</span>
        <span class="ob-banner__actions">
          <button appButton variant="primary" size="sm" (click)="finishSetup()">
            {{ t()('onboarding.banner.cta') }}
          </button>
          <button appButton variant="ghost" size="sm" (click)="visible.set(false)">
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
  private readonly db = inject(DbService);
  private readonly i18n = inject(TranslateService);
  private readonly onboarding = inject(OnboardingService);
  protected readonly t = this.i18n.t;
  readonly visible = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      const [settings, profile] = await Promise.all([this.db.getSettings(), this.db.getProfile()]);
      this.visible.set(shouldShowOnboardingBanner(settings, profile));
    } catch {
      this.visible.set(false);
    }
  }

  finishSetup(): void {
    this.visible.set(false);
    this.onboarding.requestOpen();
  }
}
