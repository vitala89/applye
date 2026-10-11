import { signal } from '@angular/core';
import { JobActionsService } from '@applye/application';
import { ToastService } from '../../core/toast/toast.service';
import { showJobActionOutcome } from './show-job-action-outcome';

describe('showJobActionOutcome', () => {
  const toast = { success: jest.fn(), error: jest.fn() } as unknown as ToastService;

  function actions(epoch = 0) {
    return {
      outcome: signal<{ kind: 'success' | 'error'; message: string } | null>(null),
      outcomeEpoch: signal(epoch),
    } as unknown as JobActionsService;
  }

  beforeEach(() => {
    toast.success = jest.fn();
    toast.error = jest.fn();
  });

  it('says nothing when the action was already busy', async () => {
    const svc = actions();

    await showJobActionOutcome(svc, toast, async () => false);

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('toasts the outcome recorded by the action', async () => {
    const svc = actions();

    await showJobActionOutcome(svc, toast, async () => {
      svc.outcome.set({ kind: 'error', message: 'write failed' });
      svc.outcomeEpoch.update((n) => n + 1);
      return null;
    });

    expect(toast.error).toHaveBeenCalledWith('write failed');
    expect(toast.success).not.toHaveBeenCalled();
  });
});
