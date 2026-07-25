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

/** Shown once on first launch (gated by settings.healthCheckSeen, persisted in
 * SQLite - never localStorage). A choreographed welcome: a cursor flies in and
 * taps the logo, the mark morphs together, the wordmark reveals, then the
 * greeting, actions and the 0-token health check arrive in sequence. The whole
 * animation stands down under prefers-reduced-motion. Augmentation principle:
 * a failing check informs, it never blocks the user from continuing. */
@Component({
  selector: 'app-first-launch',
  standalone: true,
  imports: [HealthCheckPanelComponent, ButtonDirective],
  template: `
    <main class="welcome">
      <div class="welcome__stage">
        <!-- Logo lockup: a cursor taps the mark, the slash morphs in, the bar
             rises, then the wordmark reveals. -->
        <div class="welcome__logo" role="img" aria-label="Applye">
          <div class="welcome__mark-wrap">
            <svg
              class="welcome__mark"
              data-anim
              width="60"
              height="60"
              viewBox="0 0 64 64"
              fill="none"
              aria-hidden="true"
            >
              <polygon class="welcome__slash" data-anim points="37,10 45,10 15,54 7,54" />
              <rect class="welcome__bar" data-anim x="50" y="10" width="8" height="44" />
            </svg>
            <span class="welcome__ripple" data-anim aria-hidden="true"></span>
            <svg
              class="welcome__cursor"
              data-anim
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"
                fill="var(--text-primary)"
                stroke="var(--bg-app)"
                stroke-width="1.4"
                stroke-linejoin="round"
              />
            </svg>
          </div>
          <span class="welcome__wordmark" data-anim>applye</span>
        </div>

        <h1 class="welcome__title" data-anim>
          {{ t()('health.welcome_title')
          }}<span class="welcome__caret" data-anim aria-hidden="true"></span>
        </h1>
        <p class="welcome__tagline" data-anim>{{ t()('health.welcome_tagline') }}</p>

        <div class="welcome__actions" data-anim>
          <button appButton variant="primary" size="lg" type="button" (click)="finish(true)">
            {{ t()('health.cta_onboarding') }}
          </button>
          <button appButton variant="ghost" size="lg" type="button" (click)="finish(false)">
            {{ t()('health.cta_skip') }}
          </button>
        </div>
        <p class="welcome__hint" data-anim>{{ t()('health.recommend_onboarding') }}</p>

        <div class="welcome__divider" data-anim aria-hidden="true"></div>
        <p class="welcome__check-label" data-anim>{{ t()('health.welcome_subtitle') }}</p>
        <div class="welcome__check" data-anim>
          <app-health-check-panel [showContinue]="false" />
        </div>
      </div>
    </main>
  `,
  styles: [
    `
      /* Every vertical step below is a clamp on vh units, not a fixed px value.
       * The design was drawn for a maximised window and came to 822px tall,
       * which scrolls the moment the window is anything less than that - a
       * half-height window is the ordinary case, not an edge case. The upper
       * bound of each clamp is the original spec value, so a tall window is
       * pixel-identical to the design; shorter ones compress instead of
       * scrolling. */
      .welcome {
        min-height: 100vh;
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: clamp(40px, 9vh, 96px) 32px clamp(48px, 11vh, 120px);
        background: var(--bg-app);
        font-family: var(--font-sans);
      }
      .welcome__stage {
        width: 100%;
        max-width: 680px;
        display: flex;
        flex-direction: column;
        align-items: stretch;
      }

      /* ---- Logo lockup ---- */
      .welcome__logo {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 22px;
        margin-bottom: clamp(28px, 6vh, 64px);
        color: var(--text-primary);
      }
      .welcome__mark-wrap {
        position: relative;
        width: 60px;
        height: 60px;
      }
      .welcome__mark {
        display: block;
        overflow: visible;
        transform-origin: center;
        animation:
          welcome-mark-tap 0.4s ease 0.95s both,
          welcome-mark-glow 1.1s ease 1.05s both;
      }
      .welcome__slash {
        fill: currentColor;
        transform-box: fill-box;
        transform-origin: center;
        animation: welcome-slash-morph 0.8s cubic-bezier(0.2, 0, 0, 1) 1.05s both;
      }
      .welcome__bar {
        fill: var(--accent);
        transform-box: fill-box;
        transform-origin: center;
        animation: welcome-bar-rise 0.55s cubic-bezier(0.2, 0, 0, 1) 1.75s both;
      }
      .welcome__ripple {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 30px;
        height: 30px;
        border: 2px solid var(--accent);
        border-radius: 50%;
        opacity: 0;
        pointer-events: none;
        animation: welcome-ripple 0.8s ease-out 0.95s both;
      }
      .welcome__cursor {
        position: absolute;
        left: calc(50% - 3px);
        top: calc(50% - 3px);
        transform-origin: 3px 3px;
        pointer-events: none;
        opacity: 0;
        animation: welcome-pointer 1.9s cubic-bezier(0.4, 0, 0.2, 1) 0.1s both;
      }
      .welcome__wordmark {
        font-family: var(--font-mono);
        font-weight: 500;
        font-size: clamp(34px, 4.4vw, 48px);
        line-height: 1;
        letter-spacing: -0.03em;
        color: var(--text-primary);
        animation: welcome-word-reveal 0.6s cubic-bezier(0.2, 0, 0, 1) 2.3s both;
      }

      /* ---- Hero ---- */
      .welcome__title {
        margin: 0;
        text-align: center;
        font-family: var(--font-mono);
        font-weight: 500;
        font-size: clamp(34px, 5.2vw, 54px);
        line-height: 1.05;
        letter-spacing: -0.03em;
        color: var(--text-primary);
        text-wrap: balance;
        animation: welcome-rise 0.6s cubic-bezier(0.2, 0, 0, 1) 2.85s both;
      }
      .welcome__caret {
        display: inline-block;
        width: 18px;
        height: 0.82em;
        margin-left: 12px;
        vertical-align: -0.04em;
        background: var(--accent);
        animation:
          welcome-caret-show 0.01s linear 3.4s both,
          welcome-caret-blink 1.1s steps(1) 3.45s infinite;
      }
      .welcome__tagline {
        margin: clamp(14px, 2.4vh, 22px) auto 0;
        max-width: 480px;
        text-align: center;
        font-family: var(--font-sans);
        font-size: 18px;
        line-height: 1.55;
        color: var(--text-secondary);
        text-wrap: pretty;
        animation: welcome-rise 0.6s cubic-bezier(0.2, 0, 0, 1) 3.05s both;
      }

      /* ---- Actions ---- */
      .welcome__actions {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
        margin-top: clamp(24px, 5vh, 44px);
        animation: welcome-rise 0.6s cubic-bezier(0.2, 0, 0, 1) 3.25s both;
      }
      .welcome__hint {
        margin: clamp(12px, 2vh, 18px) auto 0;
        text-align: center;
        font-family: var(--font-sans);
        font-size: 14px;
        color: var(--text-tertiary);
        animation: welcome-rise 0.5s cubic-bezier(0.2, 0, 0, 1) 3.45s both;
      }

      /* ---- Health check ---- */
      .welcome__divider {
        height: 1px;
        background: var(--border-subtle);
        margin: clamp(28px, 6vh, 64px) 0 clamp(20px, 4.5vh, 40px);
        transform-origin: center;
        animation: welcome-line-grow 0.7s cubic-bezier(0.2, 0, 0, 1) 3.7s both;
      }
      .welcome__check-label {
        margin: 0 0 clamp(16px, 3vh, 28px);
        font-family: var(--font-sans);
        font-size: 15px;
        color: var(--text-tertiary);
        animation: welcome-rise 0.5s cubic-bezier(0.2, 0, 0, 1) 3.85s both;
      }
      .welcome__check {
        animation: welcome-rise 0.5s cubic-bezier(0.2, 0, 0, 1) 4.05s both;
      }

      /* Motion stands down entirely when the user asks for reduced motion:
         everything is shown at rest, no reveal, no blinking caret. */
      @media (prefers-reduced-motion: reduce) {
        [data-anim] {
          animation: none !important;
          opacity: 1 !important;
          transform: none !important;
          clip-path: none !important;
        }
        .welcome__caret {
          display: none;
        }
      }

      @keyframes welcome-slash-morph {
        0% {
          transform: rotate(30deg) scale(0.62, 0.78);
          opacity: 0;
        }
        22% {
          opacity: 1;
        }
        42% {
          transform: rotate(-8deg) scale(1.05, 1.02);
          opacity: 1;
        }
        66% {
          transform: rotate(4deg) scale(0.99, 1);
        }
        84% {
          transform: rotate(-1.5deg) scale(1, 1);
        }
        100% {
          transform: rotate(0) scale(1, 1);
          opacity: 1;
        }
      }
      @keyframes welcome-bar-rise {
        0% {
          transform: scaleY(0.04);
          opacity: 0;
        }
        55% {
          opacity: 1;
        }
        100% {
          transform: scaleY(1);
          opacity: 1;
        }
      }
      @keyframes welcome-mark-glow {
        0% {
          filter: drop-shadow(0 0 0 rgba(79, 91, 255, 0));
        }
        45% {
          filter: drop-shadow(0 0 16px rgba(79, 91, 255, 0.6));
        }
        100% {
          filter: drop-shadow(0 0 0 rgba(79, 91, 255, 0));
        }
      }
      @keyframes welcome-mark-tap {
        0% {
          transform: scale(1);
        }
        40% {
          transform: scale(0.9);
        }
        100% {
          transform: scale(1);
        }
      }
      @keyframes welcome-ripple {
        0% {
          transform: translate(-50%, -50%) scale(0.2);
          opacity: 0;
        }
        20% {
          opacity: 0.7;
        }
        100% {
          transform: translate(-50%, -50%) scale(2.4);
          opacity: 0;
        }
      }
      @keyframes welcome-pointer {
        0% {
          transform: translate(72px, 84px) rotate(-8deg) scale(1.08);
          opacity: 0;
        }
        16% {
          opacity: 1;
        }
        36% {
          transform: translate(0, 0) rotate(0) scale(1);
          opacity: 1;
        }
        45% {
          transform: translate(1px, 5px) rotate(0) scale(0.82);
          opacity: 1;
        }
        54% {
          transform: translate(0, 0) rotate(0) scale(1);
          opacity: 1;
        }
        74% {
          transform: translate(0, 0) rotate(-2deg) scale(1);
          opacity: 1;
        }
        100% {
          transform: translate(-30px, -40px) rotate(-10deg) scale(1);
          opacity: 0;
        }
      }
      @keyframes welcome-word-reveal {
        from {
          clip-path: inset(0 100% 0 0);
        }
        to {
          clip-path: inset(0 0 0 0);
        }
      }
      @keyframes welcome-rise {
        from {
          opacity: 0;
          transform: translateY(16px);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }
      @keyframes welcome-line-grow {
        from {
          opacity: 0;
          transform: scaleX(0);
        }
        to {
          opacity: 1;
          transform: scaleX(1);
        }
      }
      @keyframes welcome-caret-show {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      @keyframes welcome-caret-blink {
        0%,
        48% {
          opacity: 1;
        }
        49%,
        100% {
          opacity: 0;
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
