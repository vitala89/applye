import { ErrorHandler, Injectable, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Injectable()
export class ToastErrorHandler implements ErrorHandler {
  private readonly toast = inject(ToastService);
  private reentrant = false;

  handleError(error: unknown): void {
    // Always keep the console trail.
    console.error(error);
    // Guard against an error thrown while rendering a toast re-triggering us.
    if (this.reentrant) return;
    this.reentrant = true;
    try {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
      this.toast.error(message);
    } finally {
      this.reentrant = false;
    }
  }
}
