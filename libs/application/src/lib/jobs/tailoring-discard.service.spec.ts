import { TestBed } from '@angular/core/testing';
import { DbService } from '@applye/data';
import { ToastService } from '../shell/toast.service';
import { DocumentReviewStatusService } from './document-review-status.service';
import { LinkedDocumentsService } from '../documents/linked-documents.service';
import { TailorScoreService } from './tailor-score.service';
import { TailoringDiscardService, applicationDrafts } from './tailoring-discard.service';

describe('applicationDrafts', () => {
  const draft = { id: 1, isApplicationDraft: true } as never;
  const committed = { id: 2, isApplicationDraft: false } as never;
  const unsaved = { id: null, isApplicationDraft: true } as never;

  it('keeps only the drafts this application owns', () => {
    expect(applicationDrafts([draft, committed, null])).toEqual([draft]);
  });

  it('skips a draft with no row to delete', () => {
    expect(applicationDrafts([unsaved])).toEqual([]);
  });

  it('never returns a document the user committed to their library', () => {
    // Deleting a committed document would destroy work the discard was never
    // asked to touch.
    expect(applicationDrafts([committed, committed])).toEqual([]);
  });
});

describe('TailoringDiscardService', () => {
  let svc: TailoringDiscardService;
  let status: DocumentReviewStatusService;
  let deleted: number[];
  let toasts: string[];
  let deleteFails: boolean;

  const DRAFT_CV = { id: 11, isApplicationDraft: true } as never;
  const DRAFT_LETTER = { id: 22, isApplicationDraft: true } as never;

  beforeEach(() => {
    deleted = [];
    toasts = [];
    deleteFails = false;

    const db = {
      documentLibraryDelete: (id: number) => {
        if (deleteFails) return Promise.reject(new Error('database is locked'));
        deleted.push(id);
        return Promise.resolve();
      },
      listApplications: () => Promise.resolve([{ id: 5, jobId: 7 }]),
    };

    TestBed.configureTestingModule({
      providers: [
        TailoringDiscardService,
        DocumentReviewStatusService,
        LinkedDocumentsService,
        TailorScoreService,
        { provide: DbService, useValue: db },
        { provide: ToastService, useValue: { error: (m: string) => toasts.push(m) } },
      ],
    });

    svc = TestBed.inject(TailoringDiscardService);
    status = TestBed.inject(DocumentReviewStatusService);
  });

  function context(overrides: Record<string, unknown> = {}) {
    return {
      jobId: 7,
      documents: [DRAFT_CV, DRAFT_LETTER],
      applyApplication: () => undefined,
      ...overrides,
    } as never;
  }

  it('deletes every application draft and reports success', async () => {
    expect(await svc.discard(context())).toBe(true);
    expect(deleted).toEqual([11, 22]);
  });

  it('re-reads the application for this job and hands it back', async () => {
    let applied: unknown = 'untouched';

    await svc.discard(context({ applyApplication: (a: unknown) => (applied = a) }));

    expect(applied).toMatchObject({ id: 5, jobId: 7 });
  });

  it('hands back null when this job has no application left', async () => {
    let applied: unknown = 'untouched';

    await svc.discard(context({ jobId: 999, applyApplication: (a: unknown) => (applied = a) }));

    expect(applied).toBeNull();
  });

  it('closes the confirmation only when the discard succeeded', async () => {
    svc.confirmOpen.set(true);
    await svc.discard(context());

    expect(svc.confirmOpen()).toBe(false);
  });

  describe('when the delete fails', () => {
    beforeEach(() => {
      deleteFails = true;
    });

    it('reports the failure as an error, not as an ordinary status line', async () => {
      // The regression this test exists for: the failure used to be written to
      // the status line with no error flag and no toast, so a discard that
      // destroyed nothing looked exactly like one that succeeded.
      expect(await svc.discard(context())).toBe(false);
      expect(status.error()).toBe(true);
      expect(status.status()).toContain('database is locked');
      expect(toasts.length).toBe(1);
    });

    it('leaves the confirmation open, because nothing was discarded', async () => {
      svc.confirmOpen.set(true);

      await svc.discard(context());

      expect(svc.confirmOpen()).toBe(true);
    });

    it('clears the in-flight flag so the button is usable again', async () => {
      await svc.discard(context());

      expect(svc.discarding()).toBe(false);
    });
  });

  it('refuses a second discard while one is in flight', async () => {
    const first = svc.discard(context());

    expect(await svc.discard(context())).toBe(false);
    await first;
    expect(deleted).toEqual([11, 22]);
  });

  it('opens and cancels the confirmation', () => {
    svc.ask();
    expect(svc.confirmOpen()).toBe(true);

    svc.cancel();
    expect(svc.confirmOpen()).toBe(false);
  });
});
