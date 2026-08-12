import { ErrorHandler, Injectable, inject } from '@angular/core';
import { ToastService } from '@applye/application';

@Injectable()
export class ToastErrorHandler implements ErrorHandler {
  private readonly toast = inject(ToastService);
  private reentrant = false;

  handleError(error: unknown): void {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);

    // Benign browser noise: "ResizeObserver loop completed with undelivered
    // notifications" fires when observed layout settles across frames. It is
    // harmless and self-corrects, but Angular's global error listener routes it
    // here where it would surface a scary toast. Swallow it (and the
    // ErrorEvent-with-no-error wrapper Angular reports it through) entirely.
    if (isBenignResizeObserverError(message)) return;

    // Always keep the console trail.
    console.error(error);
    // Guard against an error thrown while rendering a toast re-triggering us.
    if (this.reentrant) return;
    this.reentrant = true;
    try {
      this.toast.error(message);
    } finally {
      this.reentrant = false;
    }
  }
}

/** True for the harmless ResizeObserver loop notification (and Angular's
 * "ErrorEvent with no error" wrapper that carries it). */
function isBenignResizeObserverError(message: string): boolean {
  return message.includes('ResizeObserver loop');
}
