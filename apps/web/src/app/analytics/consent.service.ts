import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

/** What the visitor decided about analytics. `unset` means we have not asked yet. */
export type ConsentState = 'unset' | 'granted' | 'denied';

const STORAGE_KEY = 'applye-analytics-consent';

/**
 * Stores the visitor's analytics decision.
 *
 * Nothing is loaded, set, or sent before `grant()` is called: while the state
 * is `unset` or `denied` the site runs with zero third-party requests and zero
 * cookies. The decision itself lives in localStorage, not in a cookie, so
 * declining leaves no tracking surface behind at all.
 */
@Injectable({ providedIn: 'root' })
export class ConsentService {
  private readonly doc = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly state = signal<ConsentState>('unset');

  /** Current decision. */
  readonly consent = this.state.asReadonly();
  /** True only after an explicit opt-in. */
  readonly granted = computed(() => this.state() === 'granted');
  /** The banner shows only while no decision exists. */
  readonly needsDecision = computed(() => this.state() === 'unset');

  constructor() {
    if (this.isBrowser) {
      this.state.set(this.read());
    }
  }

  grant(): void {
    this.write('granted');
  }

  deny(): void {
    this.write('denied');
  }

  /**
   * Clears the stored decision and reloads, so a visitor can change their mind.
   * A reload is the honest way to revoke: it guarantees the already-loaded
   * analytics script is gone from the page, not merely told to stop.
   */
  revoke(): void {
    this.write('unset');
    this.doc.defaultView?.location.reload();
  }

  private write(next: ConsentState): void {
    this.state.set(next);
    if (!this.isBrowser) return;
    try {
      if (next === 'unset') {
        this.doc.defaultView?.localStorage.removeItem(STORAGE_KEY);
      } else {
        this.doc.defaultView?.localStorage.setItem(STORAGE_KEY, next);
      }
    } catch {
      // Private mode or storage disabled: the decision holds for this session only.
    }
  }

  private read(): ConsentState {
    try {
      const v = this.doc.defaultView?.localStorage.getItem(STORAGE_KEY);
      return v === 'granted' || v === 'denied' ? v : 'unset';
    } catch {
      return 'unset';
    }
  }
}
