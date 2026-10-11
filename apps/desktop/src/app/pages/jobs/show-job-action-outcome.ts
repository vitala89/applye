import { JobActionsService } from '@applye/application';
import { ToastService } from '../../core/toast/toast.service';

/**
 * Toasts a job action that finished. A busy return leaves the epoch where it
 * was, so a second click does not repeat the previous notice.
 */
export async function showJobActionOutcome<T>(
  actions: JobActionsService,
  toast: ToastService,
  run: () => Promise<T>,
): Promise<T> {
  const before = actions.outcomeEpoch();
  const result = await run();
  if (actions.outcomeEpoch() === before) return result;
  const outcome = actions.outcome();
  if (outcome?.kind === 'success') toast.success(outcome.message);
  if (outcome?.kind === 'error') toast.error(outcome.message);
  return result;
}
