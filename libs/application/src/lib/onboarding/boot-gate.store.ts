import { Injectable, inject, signal } from '@angular/core';
import { ProfileSettingsGateway } from '@applye/data';
import { shouldAutoOpenOnboarding } from './onboarding-gate.util';

/** Which of the three things the app shows on open. */
export type BootScreen = 'first-launch' | 'onboarding' | 'app';

/**
 * The boot gate: which screen the app opens on, and recording that the user has
 * been through it.
 *
 * Both halves read and write the same two settings flags - `healthCheckSeen`
 * and `onboardingSeen` - so keeping them apart meant one layer wrote what
 * another read. The write half has been here since amendment thirty-five (as
 * `FirstLaunchStore`); the read half was the last `inject(ProfileSettingsGateway)` in a
 * component anywhere in the app, and the lint rule could not see it because the
 * file is called `app.ts` rather than `app.component.ts`.
 *
 * **It holds almost no state, and that is honest rather than a shortfall.** The
 * welcome screen is a choreographed sequence with two buttons; the gate itself
 * is one decision taken once. What they have is two gateway calls, and the
 * gateway belongs to this layer.
 *
 * Provided component-scoped in two places - the root component and the welcome
 * screen - so there are two instances. That is deliberate and harmless: the one
 * signal here is read only by the screen that owns the write, and giving a
 * stateless store a singleton lifetime would say something about it that is not
 * true.
 */
@Injectable()
export class BootGateStore {
  private readonly db = inject(ProfileSettingsGateway);

  /**
   * Filled by a failed write. The screen deliberately ignores it: a user who
   * cannot be told their preference was saved should still not be trapped on
   * the welcome screen, which is the behaviour this replaces.
   */
  readonly error = signal('');

  /**
   * Which screen to open on.
   *
   * **Fails open.** A settings read that throws answers `'app'`, because
   * blocking startup on a health-flag read would trap the user outside an
   * application whose data is otherwise fine.
   */
  async load(): Promise<BootScreen> {
    try {
      const settings = await this.db.getSettings();
      if (!settings.healthCheckSeen) return 'first-launch';
      return shouldAutoOpenOnboarding(settings) ? 'onboarding' : 'app';
    } catch {
      return 'app';
    }
  }

  /**
   * Records that the welcome screen has been seen. Skipping the tour also marks
   * onboarding seen, so it never auto-opens; the empty-profile banner still
   * nudges from inside the app.
   *
   * Never rejects, for the reason on `error`.
   */
  async dismiss(startOnboarding: boolean): Promise<boolean> {
    this.error.set('');
    try {
      await this.db.updateSettings(
        startOnboarding
          ? { healthCheckSeen: true }
          : { healthCheckSeen: true, onboardingSeen: true },
      );
      return true;
    } catch (e) {
      this.error.set(String(e));
      return false;
    }
  }
}
