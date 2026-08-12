import { TestBed } from '@angular/core/testing';
import { DbService, JobsStore } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../shell/toast.service';
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
    let ensured: number;

    const commit = () => {
      if (commitFails) return Promise.reject(new Error('document commit failed'));
      order.push('commit');
      return Promise.resolve();
    };

    const ensure = () => {
      ensured += 1;
      order.push('ensure');
      return Promise.resolve({ id: 5, jobId: 7 } as never);
    };

    beforeEach(() => {
      ensured = 0;
    });

    it('never writes an application row of its own', async () => {
      // The page owns creation, because it also holds the signal every later
      // step reads. A row written here would be invisible to that signal, and
      // the next step to ask for a draft would write a second one.
      await svc.markApplied(ensure, commit);

      expect(upserted).toEqual([]);
    });

    it('asks the caller for the application exactly once', async () => {
      await svc.markApplied(ensure, commit);

      expect(ensured).toBe(1);
    });

    it('has the application in hand before the documents are committed', async () => {
      // Reversed, the commit would create its own row and the status would
      // land on a different one.
      await svc.markApplied(ensure, commit);

      expect(order).toEqual(['ensure', 'commit', 'status:applied']);
    });

    it('mirrors the status the database recorded, not the one asked for', async () => {
      const result = await svc.markApplied(ensure, commit);

      expect(result?.status).toBe('interview');
      expect(patched).toEqual([{ id: 7, patch: { status: 'interview' } }]);
    });

    it('flags the long step while the documents are being prepared', async () => {
      // The commit generates whatever the application is missing and can run
      // for minutes. Without this the button is simply dead, which reads as a
      // hang - `busy` cannot say it, because saving a lead raises that too.
      let duringCommit: boolean | undefined;
      await svc.markApplied(ensure, () => {
        duringCommit = svc.applying();
        return Promise.resolve();
      });

      expect(duringCommit).toBe(true);
    });

    it('drops the flag when the documents fail, with the button live again', async () => {
      commitFails = true;

      await svc.markApplied(ensure, commit);

      expect(svc.applying()).toBe(false);
    });

    it('leaves busy set on success, because the caller navigates away', async () => {
      // Same rule as `remove`: clearing it first puts a usable button back on
      // screen for the frame before the route changes.
      await svc.markApplied(ensure, commit);

      expect(svc.busy()).toBe(true);
    });

    it('returns the page to a usable state when the documents fail', async () => {
      commitFails = true;

      expect(await svc.markApplied(ensure, commit)).toBeNull();
      expect(svc.busy()).toBe(false);
      expect(svc.message()).toContain('document commit failed');
      expect(toasts.at(-1)?.kind).toBe('error');
    });

    it('returns the page to a usable state when the application cannot be created', async () => {
      const failing = () => Promise.reject(new Error('draft failed'));

      expect(await svc.markApplied(failing, commit)).toBeNull();
      expect(order).toEqual([]);
      expect(svc.busy()).toBe(false);
      expect(svc.message()).toContain('draft failed');
    });

    it('does not touch the overview row when the status write fails', async () => {
      // A row saying applied for an application that is not would outlive the
      // error message.
      statusFails = true;

      expect(await svc.markApplied(ensure, commit)).toBeNull();
      expect(patched).toEqual([]);
      expect(svc.busy()).toBe(false);
    });

    it('refuses a second run while one is in flight', async () => {
      svc.busy.set(true);

      expect(await svc.markApplied(ensure, commit)).toBeNull();
      expect(order).toEqual([]);
      expect(ensured).toBe(0);
    });
  });

  it('opens and cancels the delete confirm', () => {
    svc.openDeleteConfirm();
    expect(svc.deleteConfirmOpen()).toBe(true);

    svc.cancelDeleteConfirm();
    expect(svc.deleteConfirmOpen()).toBe(false);
  });
});
