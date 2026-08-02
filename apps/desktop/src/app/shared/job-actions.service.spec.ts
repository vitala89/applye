import { TestBed } from '@angular/core/testing';
import { DbService, JobsStore } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../core/toast/toast.service';
import { JobActionsService } from './job-actions.service';
import { JobIdentityResolverService } from './job-identity-resolver.service';

describe('JobActionsService', () => {
  let svc: JobActionsService;
  let upserted: Record<string, unknown>[];
  let patched: { id: number; patch: Record<string, unknown> }[];
  let deleted: number[];
  let forgotten: number[];
  let toasts: { kind: string; text: string }[];
  let upsertFails: boolean;
  let deleteFails: boolean;
  let statusFails: boolean;
  let commitFails: boolean;
  let order: string[];

  beforeEach(() => {
    upserted = [];
    patched = [];
    deleted = [];
    forgotten = [];
    toasts = [];
    upsertFails = false;
    deleteFails = false;
    statusFails = false;
    commitFails = false;
    order = [];

    const db = {
      upsertApplication: (a: Record<string, unknown>) => {
        if (upsertFails) return Promise.reject(new Error('write failed'));
        upserted.push(a);
        // The DB is the source of truth for status: echo something different
        // from what was asked, so a caller mirroring the request instead of the
        // result is visible.
        return Promise.resolve({ ...a, id: 1, status: 'saved' });
      },
      setApplicationStatus: (id: number, status: string) => {
        if (statusFails) return Promise.reject(new Error('status write failed'));
        order.push(`status:${status}`);
        // Same trick again: the DB records `interview` where `applied` was
        // asked for, so mirroring the request rather than the result shows up.
        return Promise.resolve({ id, jobId: 7, status: 'interview' });
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
        {
          provide: JobIdentityResolverService,
          useValue: { clear: (id: number) => forgotten.push(id) },
        },
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

    it('stops the identification badge offering a job that no longer exists', async () => {
      await svc.remove(7);

      expect(forgotten).toEqual([7]);
    });

    it('keeps the badge when the delete failed', async () => {
      deleteFails = true;

      await svc.remove(7);

      expect(forgotten).toEqual([]);
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

  describe('markApplied', () => {
    const commit = () => {
      if (commitFails) return Promise.reject(new Error('document commit failed'));
      order.push('commit');
      return Promise.resolve();
    };

    it('creates the application row when the job has none', async () => {
      await svc.markApplied(7, null, commit);

      expect(upserted[0]).toMatchObject({ jobId: 7, status: 'saved' });
    });

    it('reuses the application the job already has', async () => {
      await svc.markApplied(7, { id: 5, jobId: 7 } as never, commit);

      expect(upserted).toEqual([]);
    });

    it('commits the documents before the status flips to applied', async () => {
      // Order is the point: a job marked applied must already own its CV and
      // cover letter, or the user is applied to a job with nothing attached.
      await svc.markApplied(7, { id: 5, jobId: 7 } as never, commit);

      expect(order).toEqual(['commit', 'status:applied']);
    });

    it('mirrors the status the database recorded, not the one asked for', async () => {
      const result = await svc.markApplied(7, { id: 5, jobId: 7 } as never, commit);

      expect(result?.status).toBe('interview');
      expect(patched).toEqual([{ id: 7, patch: { status: 'interview' } }]);
    });

    it('leaves busy set on success, because the caller navigates away', async () => {
      // Same rule as `remove`: clearing it first puts a usable button back on
      // screen for the frame before the route changes.
      await svc.markApplied(7, { id: 5, jobId: 7 } as never, commit);

      expect(svc.busy()).toBe(true);
    });

    it('returns the page to a usable state when the documents fail', async () => {
      commitFails = true;

      expect(await svc.markApplied(7, { id: 5, jobId: 7 } as never, commit)).toBeNull();
      expect(svc.busy()).toBe(false);
      expect(svc.message()).toContain('document commit failed');
      expect(toasts.at(-1)?.kind).toBe('error');
    });

    it('does not touch the overview row when the status write fails', async () => {
      // A row saying applied for an application that is not would outlive the
      // error message.
      statusFails = true;

      expect(await svc.markApplied(7, { id: 5, jobId: 7 } as never, commit)).toBeNull();
      expect(patched).toEqual([]);
      expect(svc.busy()).toBe(false);
    });

    it('refuses a second run while one is in flight', async () => {
      svc.busy.set(true);

      expect(await svc.markApplied(7, null, commit)).toBeNull();
      expect(order).toEqual([]);
    });
  });

  it('opens and cancels the delete confirm', () => {
    svc.openDeleteConfirm();
    expect(svc.deleteConfirmOpen()).toBe(true);

    svc.cancelDeleteConfirm();
    expect(svc.deleteConfirmOpen()).toBe(false);
  });
});
