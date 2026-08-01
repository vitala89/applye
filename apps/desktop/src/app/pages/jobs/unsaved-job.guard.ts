import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { UnsavedJobPromptService } from '../../shared/unsaved-job-prompt/unsaved-job-prompt.service';

/** What the guard needs from the page, so it does not depend on the whole of it. */
export interface AnalysedJobPage {
  job: () => { id?: number } | null;
  application: () => unknown | null;
}

/**
 * Warns before leaving a job that was analysed and never claimed.
 *
 * One condition covers every case without a special rule for any of them: a job
 * is loaded and it has no application. Saving or marking applied creates one, so
 * neither prompts - including the wizard's own navigation after Mark as Applied,
 * which would otherwise be interrupted by its own success.
 *
 * Typed-but-never-parsed text does not prompt. Nothing has been computed for it,
 * and prompting would fire every time the user changed their mind about a paste.
 */
export const unsavedJobGuard: CanDeactivateFn<AnalysedJobPage> = (page) => {
  if (!page.job() || page.application()) return true;
  return inject(UnsavedJobPromptService).ask();
};
