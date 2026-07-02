import { Injectable, signal } from '@angular/core';

/** Open/close state for the single shared Paste Job modal, so the topbar
 * button and the My Jobs button both drive the same modal instance. */
@Injectable({ providedIn: 'root' })
export class PasteJobModalService {
  private readonly openState = signal(false);
  readonly isOpen = this.openState.asReadonly();

  open(): void {
    this.openState.set(true);
  }

  close(): void {
    this.openState.set(false);
  }
}
