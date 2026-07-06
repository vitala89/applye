import { Injectable, signal } from '@angular/core';

/** Shared open-signal so the app gate, dashboard banner, and Settings/Profile
 *  buttons can all drive the same onboarding overlay. */
@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly _open = signal(false);
  readonly open = this._open.asReadonly();

  requestOpen(): void {
    this._open.set(true);
  }

  close(): void {
    this._open.set(false);
  }
}
