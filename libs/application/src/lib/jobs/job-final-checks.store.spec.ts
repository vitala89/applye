import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DocumentLibraryItem } from '@applye/core';
import { LinkedDocumentsService } from '../documents/linked-documents.service';
import { DocumentReviewTargetsService } from './document-review-targets.service';
import { FinalCheckInputs, FinalChecksService } from './final-checks.service';
import { JobDetailStore } from './job-detail.store';
import { JobFinalChecksStore } from './job-final-checks.store';

const doc = (id: number): DocumentLibraryItem =>
  ({ id, title: `doc ${id}` }) as DocumentLibraryItem;

describe('JobFinalChecksStore', () => {
  let store: JobFinalChecksStore;
  let checks: ReturnType<typeof signal<{ ats: string } | null>>;
  let outdated: ReturnType<typeof signal<boolean>>;
  let ran: FinalCheckInputs[];
  let hashed: FinalCheckInputs[];
  let refreshed: FinalCheckInputs[];
  let stored: string[];
  let linkedCv: ReturnType<typeof signal<DocumentLibraryItem | null>>;
  let linkedCoverLetter: ReturnType<typeof signal<DocumentLibraryItem | null>>;

  beforeEach(() => {
    checks = signal<{ ats: string } | null>(null);
    outdated = signal(false);
    ran = [];
    hashed = [];
    refreshed = [];
    stored = [];
    linkedCv = signal<DocumentLibraryItem | null>(null);
    linkedCoverLetter = signal<DocumentLibraryItem | null>(null);

    const svc = {
      checks,
      outdated,
      run: (i: FinalCheckInputs) => {
        ran.push(i);
        return Promise.resolve();
      },
      documentsHash: (i: FinalCheckInputs) => {
        hashed.push(i);
        return Promise.resolve('hash-1');
      },
      refreshFreshness: (i: FinalCheckInputs) => {
        refreshed.push(i);
        return Promise.resolve();
      },
      storeForReturn: (h: string) => stored.push(h),
    };

    TestBed.configureTestingModule({
      providers: [
        JobFinalChecksStore,
        { provide: FinalChecksService, useValue: svc },
        {
          provide: LinkedDocumentsService,
          useValue: { cv: linkedCv, coverLetter: linkedCoverLetter },
        },
        { provide: JobDetailStore, useValue: { jdText: signal('the job description') } },
        {
          provide: DocumentReviewTargetsService,
          useValue: { language: signal('de'), region: signal('de') },
        },
      ],
    });
    store = TestBed.inject(JobFinalChecksStore);
  });

  it('assembles the inputs from the linked documents and the review targets', async () => {
    linkedCv.set(doc(7));
    linkedCoverLetter.set(doc(8));

    await store.run();

    expect(ran).toEqual([
      {
        cv: doc(7),
        coverLetter: doc(8),
        jdText: 'the job description',
        language: 'de',
        region: 'de',
      },
    ]);
  });

  it('reads the linked documents at call time, not at construction', async () => {
    await store.run();
    linkedCv.set(doc(9));
    await store.run();

    expect(ran[0].cv).toBeNull();
    expect(ran[1].cv).toEqual(doc(9));
  });

  describe('markOutdated', () => {
    it('does nothing while no checks have run', () => {
      store.markOutdated();

      expect(outdated()).toBe(false);
    });

    // The guard is the point: without it a document changing before the first
    // run would light the "out of date" banner on a screen that has never been
    // checked, which reads as a failed check rather than as no check.
    it('marks the result stale once there is one', () => {
      checks.set({ ats: 'pass' });

      store.markOutdated();

      expect(outdated()).toBe(true);
    });
  });

  it('invalidate drops the result outright', () => {
    checks.set({ ats: 'pass' });
    outdated.set(false);

    store.invalidate();

    expect(checks()).toBeNull();
    expect(outdated()).toBe(true);
  });

  it('hands the hash it computed to the service that keeps it for the return trip', async () => {
    const hash = await store.documentsHash();
    store.storeForReturn(hash);

    expect(hashed.length).toBe(1);
    expect(stored).toEqual(['hash-1']);
  });

  it('refreshes freshness against the current inputs', async () => {
    linkedCv.set(doc(3));

    await store.refreshFreshness();

    expect(refreshed[0].cv).toEqual(doc(3));
  });
});
