import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { BootGateStore } from '@applye/application';
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
  templateUrl: './first-launch.component.html',
  styleUrl: './first-launch.component.scss',
  providers: [BootGateStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FirstLaunchComponent {
  private readonly store = inject(BootGateStore);
  private readonly i18n = inject(TranslateService);
  protected readonly t = this.i18n.t;

  readonly dismissed = output<FirstLaunchDismiss>();

  /** Persist that the welcome was seen, then hand back the user's intent.
   *  The store's return value is deliberately ignored: even if persisting the
   *  flags fails, never trap the user on this screen. */
  async finish(startOnboarding: boolean): Promise<void> {
    await this.store.dismiss(startOnboarding);
    this.dismissed.emit({ startOnboarding });
  }
}
