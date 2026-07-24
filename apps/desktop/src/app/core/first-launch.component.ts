import { Component, inject, output } from '@angular/core';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ButtonDirective } from '@applye/ui';
import { HealthCheckPanelComponent } from './health-check-panel.component';

/** Intent emitted when the welcome screen is dismissed: whether the user chose
 *  to start the onboarding tour or to set up on their own. */
export interface FirstLaunchDismiss {
  startOnboarding: boolean;
}

/** Shown once on first launch (gated by settings.healthCheckSeen, persisted
 * in SQLite - never localStorage). A calm, animated welcome: it greets the
 * user, points at onboarding, and keeps the 0-token health check visible as a
 * trust signal. Augmentation principle applies: a failing check informs, it
 * never blocks the user from continuing. */
@Component({
  selector: 'app-first-launch',
  standalone: true,
  imports: [HealthCheckPanelComponent, ButtonDirective],
  template: `
    <div class="welcome">
      <div class="welcome__stage">
        <div class="welcome__logo" role="img" aria-label="Applye">
          <svg class="welcome__mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <polygon points="37,10 45,10 15,54 7,54" fill="currentColor" />
            <rect
              class="welcome__bar"
              x="50"
              y="10"
              width="8"
              height="44"
              fill="var(--indigo-600, #4f5bff)"
            />
          </svg>
          <span class="welcome__wordmark">applye</span>
        </div>

        <h1 class="welcome__title">{{ t()('health.welcome_title') }}</h1>
        <p class="welcome__tagline">{{ t()('health.welcome_tagline') }}</p>

        <div class="welcome__actions">
          <button appButton variant="primary" size="md" type="button" (click)="finish(true)">
            {{ t()('health.cta_onboarding') }}
          </button>
          <button appButton variant="ghost" size="md" type="button" (click)="finish(false)">
            {{ t()('health.cta_skip') }}
          </button>
        </div>
        <p class="welcome__hint">{{ t()('health.recommend_onboarding') }}</p>

        <div class="welcome__check">
          <p class="welcome__check-label">{{ t()('health.welcome_subtitle') }}</p>
          <app-health-check-panel [showContinue]="false" />
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .welcome {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: var(--space-8);
        background: var(--bg-app);
      }

      .welcome__stage {
        width: 100%;
        max-width: 440px;
        text-align: center;
      }

      .welcome__logo {
        display: inline-flex;
        align-items: center;
        gap: var(--space-3);
        color: var(--text-primary);
      }
      .welcome__mark {
        width: 52px;
        height: 52px;
      }
      .welcome__bar {
        transform-box: fill-box;
        transform-origin: bottom;
      }
      .welcome__wordmark {
        font-family: var(--font-brand, monospace);
        font-size: var(--text-h2, 28px);
        font-weight: var(--weight-semibold, 600);
        letter-spacing: var(--tracking-tight, -0.01em);
        color: var(--text-primary);
      }

      .welcome__title {
        margin: var(--space-6) 0 var(--space-2);
        font-family: var(--font-brand, monospace);
        font-size: var(--text-h1);
        font-weight: var(--weight-semibold, 600);
        color: var(--text-primary);
        text-wrap: balance;
      }
      .welcome__tagline {
        margin: 0 auto;
        max-width: 40ch;
        font-size: var(--text-body);
        line-height: var(--leading-relaxed, 1.6);
        color: var(--text-secondary);
        text-wrap: pretty;
      }

      .welcome__actions {
        display: flex;
        justify-content: center;
        gap: var(--space-3);
        margin-top: var(--space-7);
      }
      .welcome__hint {
        margin: var(--space-3) 0 0;
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }

      .welcome__check {
        margin-top: var(--space-8);
        padding-top: var(--space-6);
        border-top: var(--border-width, 1px) solid var(--border-subtle);
        text-align: left;
      }
      .welcome__check-label {
        margin: 0 0 var(--space-4);
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }

      /* Reveal is additive: everything above is visible by default, so the
         screen is never blank in reduced-motion or headless renders. Motion
         only runs when the user has not asked to reduce it. */
      @media (prefers-reduced-motion: no-preference) {
        .welcome__logo,
        .welcome__title,
        .welcome__tagline,
        .welcome__actions,
        .welcome__hint,
        .welcome__check {
          opacity: 0;
          animation: welcome-rise 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .welcome__mark {
          animation: welcome-mark-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .welcome__bar {
          transform: scaleY(0);
          animation: welcome-bar-grow 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.28s both;
        }
        .welcome__logo {
          animation-delay: 0s;
        }
        .welcome__title {
          animation-delay: 0.38s;
        }
        .welcome__tagline {
          animation-delay: 0.5s;
        }
        .welcome__actions {
          animation-delay: 0.64s;
        }
        .welcome__hint {
          animation-delay: 0.76s;
        }
        .welcome__check {
          animation-delay: 0.92s;
        }
      }

      @keyframes welcome-rise {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }
      @keyframes welcome-mark-in {
        from {
          opacity: 0;
          transform: scale(0.82);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }
      @keyframes welcome-bar-grow {
        from {
          transform: scaleY(0);
        }
        to {
          transform: scaleY(1);
        }
      }
    `,
  ],
})
export class FirstLaunchComponent {
  private readonly db = inject(DbService);
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly dismissed = output<FirstLaunchDismiss>();

  /** Persist that the welcome was seen, then hand back the user's intent.
   *  Skipping the tour also marks onboarding seen so it never auto-opens; the
   *  empty-profile banner still nudges from inside the app. */
  async finish(startOnboarding: boolean): Promise<void> {
    try {
      await this.db.updateSettings(
        startOnboarding
          ? { healthCheckSeen: true }
          : { healthCheckSeen: true, onboardingSeen: true },
      );
    } catch {
      // Even if persisting the flags fails, never trap the user on this screen.
    }
    this.dismissed.emit({ startOnboarding });
  }
}
