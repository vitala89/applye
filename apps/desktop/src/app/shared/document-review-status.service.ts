import { Injectable, inject, signal } from '@angular/core';
import { ToastService } from '../core/toast/toast.service';
import { ReviewDocumentKind } from '@applye/application';

/**
 * The one status line under the Review documents step, and the two
 * choose-existing dialogs beside it.
 *
 * Every action in that step - create a CV, create a cover letter, link an
 * existing one, enter the step - repeated the same four moves: clear the line,
 * do the work, name what happened, and on a throw put the text on the line, mark
 * it as an error and raise a toast. Nine copies of that shape is duplicated
 * knowledge, not repeated syntax, and one of them getting the order wrong is
 * invisible: a stale failure left on screen looks exactly like a fresh one.
 *
 * Component-scoped through the page's `providers`, because the line belongs to
 * the job open on this page and must not outlive it.
 */
@Injectable()
export class DocumentReviewStatusService {
  private readonly toast = inject(ToastService);

  readonly status = signal('');
  readonly error = signal(false);
  readonly chooseCvOpen = signal(false);
  readonly chooseCoverLetterOpen = signal(false);

  clear(): void {
    this.status.set('');
    this.error.set(false);
  }

  /** Names what happened, and clears an error a previous attempt left behind. */
  succeed(message: string): void {
    this.status.set(message);
    this.error.set(false);
  }

  /**
   * An expected refusal: a precondition the user can see and fix, such as
   * asking for a CV before anything has been tailored. Deliberately silent -
   * the message is already on the step the user is looking at, and a toast for
   * it would be the second copy of a sentence they can read.
   */
  refuse(message: string): void {
    this.status.set(message);
    this.error.set(true);
  }

  /**
   * An unexpected failure: whatever the database, the AI provider or the
   * filesystem threw. Toasted as well as shown, because the user may have
   * navigated away from the step by the time it lands.
   */
  fail(cause: unknown): void {
    const message = String(cause);
    this.status.set(message);
    this.error.set(true);
    this.toast.error(message);
  }

  /**
   * Runs one Review-documents action against the status line: clears it first,
   * so a previous failure cannot be mistaken for this one, and turns a throw
   * into `fail` plus a null result rather than letting it escape into the
   * template. A body that refuses or succeeds sets its own message.
   */
  async run<T>(body: () => Promise<T>): Promise<T | null> {
    this.clear();
    try {
      return await body();
    } catch (e) {
      this.fail(e);
      return null;
    }
  }

  closeChooser(kind: ReviewDocumentKind): void {
    if (kind === 'cv') this.chooseCvOpen.set(false);
    else this.chooseCoverLetterOpen.set(false);
  }

  /** Moving to another job: nothing about the previous one stays on screen. */
  reset(): void {
    this.clear();
    this.chooseCvOpen.set(false);
    this.chooseCoverLetterOpen.set(false);
  }
}
