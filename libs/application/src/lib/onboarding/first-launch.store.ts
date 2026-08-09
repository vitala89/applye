import { Injectable, inject, signal } from '@angular/core';
import { DbService } from '@applye/data';

/**
 * The first-launch welcome screen's one piece of work: recording that it has
 * been seen.
 *
 * **This store holds no state, and that is honest rather than a shortfall.**
 * The screen has none - it is a choreographed welcome with two buttons. What it
 * has is a gateway call, and the gateway belongs to this layer, so the call
 * moves and nothing else does. A store invented to give this one a reason to
 * hold signals would be worse than a small one.
 *
 * Skipping the tour also marks onboarding seen, so it never auto-opens; the
 * empty-profile banner still nudges from inside the app.
 */
@Injectable()
export class FirstLaunchStore {
  private readonly db = inject(DbService);

  /**
   * Filled by a failed write. The screen deliberately ignores it: a user who
   * cannot be told their preference was saved should still not be trapped on
   * the welcome screen, which is the behaviour this replaces.
   */
  readonly error = signal('');

  /** Never rejects, for the reason above. */
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
