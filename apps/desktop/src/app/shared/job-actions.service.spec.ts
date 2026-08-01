import { TestBed } from '@angular/core/testing';
import { DbService, JobsStore } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../core/toast/toast.service';
import { JobActionsService } from './job-actions.service';

describe('JobActionsService', () => {
  let svc: JobActionsService;
  let upserted: Record<string, unknown>[];
  let patched: { id: number; patch: Record<string, unknown> }[];
  let deleted: number[];
  let toasts: { kind: string; text: string }[];
  let upsertFails: boolean;
  let deleteFails: boolean;

  beforeEach(() => {
    upserted = [];
    patched = [];
    deleted = [];
    toasts = [];
    upsertFails = false;
    deleteFails = false;

    const db = {
      upsertApplication: (a: Record<string, unknown>) => {
        if (upsertFails) return Promise.reject(new Error('write failed'));
        upserted.push(a);
        // The DB is the source of truth for status: echo something different
        // from what was asked, so a caller mirroring the request instead of the
        // result is visible.
        return Promise.resolve({ ...a, id: 1, status: 'saved' });
      },
    };
    const store = {
      patchOverviewRow: (id: number, patch: Record<string, unknown>) => patched.push({ id, patch }),
      deleteJob: (id: number) => {
        if (deleteFails) return Promise.reject(new Error('delete failed'));
        deleted.push(id);
        return Promise.resolve();
      },
    };
    const toast = {
      success: (text: string) => toasts.push({ kind: 'success', text }),
      error: (text: string) => toasts.push({ kind: 'error', text }),
    };

    TestBed.configureTestingModule({
      providers: [
        JobActionsService,
        TranslateService,
        { provide: DbService, useValue: db },
        { provide: JobsStore, useValue: store },
        { provide: ToastService, useValue: toast },
      ],
    });
    svc = TestBed.inject(JobActionsService);
  });

  describe('save', () => {
    it('creates an application row and mirrors the status the DB recorded', async () => {
      const app = await svc.save(7, null);

      expect(app?.id).toBe(1);
      expect(upserted[0]).toEqual({ jobId: 7, status: 'saved' });
      expect(patched).toEqual([{ id: 7, patch: { status: 'saved' } }]);
      expect(svc.busy()).toBe(false);
    });

    it('updates the existing row rather than creating a second one', async () => {
      await svc.save(7, { id: 42, jobId: 7 } as never);

      expect(upserted[0]['id']).toBe(42);
    });

    it('reports the failure on the message line and clears busy', async () => {
      upsertFails = true;

      const app = await svc.save(7, null);

      expect(app).toBeNull();
      expect(svc.message()).toContain('write failed');
      expect(toasts.at(-1)?.kind).toBe('error');
      expect(svc.busy()).toBe(false);
      expect(patched).toEqual([]);
    });

    it('refuses to run while another action is in flight', async () => {
      svc.busy.set(true);

      expect(await svc.save(7, null)).toBeNull();
      expect(upserted).toEqual([]);
    });
  });

  describe('remove', () => {
    it('deletes the job and reports success', async () => {
      expect(await svc.remove(7)).toBe(true);
      expect(deleted).toEqual([7]);
      expect(toasts.at(-1)?.kind).toBe('success');
    });

    it('leaves deleting set on success, because the caller navigates away', async () => {
      await svc.remove(7);

      // Clearing it here would put the confirm back on screen for the frame
      // before the route changes.
      expect(svc.deleting()).toBe(true);
    });

    it('returns the page to a usable state on failure', async () => {
      deleteFails = true;
      svc.openDeleteConfirm();

      expect(await svc.remove(7)).toBe(false);
      expect(svc.deleting()).toBe(false);
      expect(svc.deleteConfirmOpen()).toBe(false);
      expect(svc.message()).toContain('delete failed');
    });

    it('refuses a second delete while one is running', async () => {
      svc.deleting.set(true);

      expect(await svc.remove(7)).toBe(false);
      expect(deleted).toEqual([]);
    });
  });

  it('opens and cancels the delete confirm', () => {
    svc.openDeleteConfirm();
    expect(svc.deleteConfirmOpen()).toBe(true);

    svc.cancelDeleteConfirm();
    expect(svc.deleteConfirmOpen()).toBe(false);
  });
});
