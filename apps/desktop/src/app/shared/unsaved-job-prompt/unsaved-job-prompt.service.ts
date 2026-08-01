import { Injectable, signal } from '@angular/core';

/**
 * The "you analysed this job but never saved it" prompt.
 *
 * A route guard cannot render anything, and the jobs page cannot host this
 * without growing - so the state lives here and the dialog is mounted once at
 * the shell, the same shape the Paste Job modal already uses.
 */
@Injectable({ providedIn: 'root' })
export class UnsavedJobPromptService {
  private readonly openState = signal(false);
  private decide: ((leave: boolean) => void) | null = null;

  readonly isOpen = this.openState.asReadonly();

  /** Resolves true when the user chooses to leave, false when they stay. */
  ask(): Promise<boolean> {
    // A second ask while one is open would strand the first navigation waiting
    // on a promise nothing will settle, so the earlier one is answered first.
    this.decide?.(false);
    this.openState.set(true);
    return new Promise<boolean>((resolve) => {
      this.decide = resolve;
    });
  }

  leave(): void {
    this.answer(true);
  }

  stay(): void {
    this.answer(false);
  }

  private answer(leave: boolean): void {
    this.openState.set(false);
    const decide = this.decide;
    this.decide = null;
    decide?.(leave);
  }
}
