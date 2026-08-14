import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { Application, DocumentLibraryItem, Job, Profile } from '@applye/core';
import { LinkedDocumentsService } from '../documents/linked-documents.service';
import { DocumentReviewStatusService } from './document-review-status.service';
import { DocumentReviewTargetsService } from './document-review-targets.service';
import { JobDetailStore } from './job-detail.store';
import { JobDocumentDraftsStore } from './job-document-drafts.store';
import { JobDocumentsStore } from './job-documents.store';
import { JobFinalChecksStore } from './job-final-checks.store';

const doc = (id: number): DocumentLibraryItem =>
  ({ id, title: `doc ${id}` }) as DocumentLibraryItem;
const job = (): Job => ({ id: 4, title: 'Angular dev', company: 'Acme' }) as Job;

describe('JobDocumentsStore', () => {
  let store: JobDocumentsStore;
  let navigated: { path: unknown[]; extras: Record<string, unknown> }[];
  let cv: ReturnType<typeof signal<DocumentLibraryItem | null>>;
  let coverLetter: ReturnType<typeof signal<DocumentLibraryItem | null>>;
  let committed: string[];
  let createdCv: string[];
  let createdCoverLetter: number;
  let staleCalls: string[];
  let staleAnswer: boolean;
  let hashCalls: number;
  let stored: string[];
  let application: ReturnType<typeof signal<Application | null>>;
  let closedChoosers: string[];
  let marked: number;
  let linkResult: { application: Application } | null;

  beforeEach(() => {
    navigated = [];
    cv = signal<DocumentLibraryItem | null>(null);
    coverLetter = signal<DocumentLibraryItem | null>(null);
    committed = [];
    createdCv = [];
    createdCoverLetter = 0;
    staleCalls = [];
    staleAnswer = false;
    hashCalls = 0;
    stored = [];
    application = signal<Application | null>(null);
    closedChoosers = [];
    marked = 0;
    linkResult = { application: { id: 2 } as Application };

    TestBed.configureTestingModule({
      providers: [
        JobDocumentsStore,
        {
          provide: Router,
          useValue: {
            navigate: (path: unknown[], extras: Record<string, unknown>) => {
              navigated.push({ path, extras });
              return Promise.resolve(true);
            },
          },
        },
        {
          provide: JobDetailStore,
          useValue: {
            job: signal(job()),
            // A profile is required for the cover letter's staleness input to
            // exist at all: without one `coverLetterStaleInput` returns null and
            // the check short-circuits, which is a different path.
            profile: signal({ fullMd: '# me' } as Profile),
            application,
            refreshLibrary: () => Promise.resolve(),
            ensureApplicationOrThrow: () => Promise.resolve({ id: 1 } as Application),
          },
        },
        {
          provide: JobDocumentDraftsStore,
          useValue: {
            createCv: (md: string) => {
              createdCv.push(md);
              return Promise.resolve();
            },
            createCoverLetter: () => {
              createdCoverLetter += 1;
              return Promise.resolve();
            },
          },
        },
        {
          provide: JobFinalChecksStore,
          useValue: {
            documentsHash: () => {
              hashCalls += 1;
              return Promise.resolve('hash-9');
            },
            storeForReturn: (h: string) => stored.push(h),
            refreshFreshness: () => Promise.resolve(),
            markOutdated: () => {
              marked += 1;
            },
          },
        },
        {
          provide: LinkedDocumentsService,
          useValue: {
            cv,
            coverLetter,
            load: () => Promise.resolve(),
            commit: (kind: string) => {
              committed.push(kind);
              return Promise.resolve();
            },
            isStale: (kind: string) => {
              staleCalls.push(kind);
              return Promise.resolve(staleAnswer);
            },
            link: () => Promise.resolve(linkResult),
          },
        },
        {
          provide: DocumentReviewStatusService,
          useValue: {
            run: <T>(body: () => Promise<T>) => body(),
            closeChooser: (kind: string) => closedChoosers.push(kind),
          },
        },
        {
          provide: DocumentReviewTargetsService,
          useValue: { language: signal('en'), region: signal('generic') },
        },
      ],
    });
    store = TestBed.inject(JobDocumentsStore);
  });

  describe('opening a document', () => {
    it('returns to the job, and costs no hash, from the My Jobs badges', async () => {
      await store.openCv(11);

      expect(navigated).toEqual([
        {
          path: ['/documents/cv', 11],
          extras: { queryParams: { returnTo: 'myJobs', jobId: 4, jobLabel: 'Acme' } },
        },
      ]);
      // The hash is only worth computing for the path that compares it later.
      expect(hashCalls).toBe(0);
      expect(stored).toEqual([]);
    });

    it('carries the review hash back into the wizard', async () => {
      await store.openCoverLetter(12, true);

      expect(stored).toEqual(['hash-9']);
      expect(navigated[0].path).toEqual(['/documents/cover-letter', 12]);
      expect(navigated[0].extras['queryParams']).toEqual({
        returnTo: 'applyWizard',
        jobId: 4,
        documentType: 'cover_letter',
        documentId: 12,
        reviewHash: 'hash-9',
        preview: '1',
      });
    });
  });

  describe('commit', () => {
    it('creates both documents when neither is linked', async () => {
      await store.commit('tailored markdown', true);

      expect(createdCv).toEqual(['tailored markdown']);
      expect(createdCoverLetter).toBe(1);
      expect(committed).toEqual(['cv', 'cover_letter']);
    });

    // The short circuit is the part that would silently regress: a staleness
    // check costs a hash and a database read.
    it('does not test staleness when the caller did not ask to regenerate', async () => {
      cv.set(doc(1));
      coverLetter.set(doc(2));

      await store.commit('tailored markdown', false);

      expect(staleCalls).toEqual([]);
      expect(createdCv).toEqual([]);
      expect(createdCoverLetter).toBe(0);
      // Committing still runs: a linked draft has to reach the library.
      expect(committed).toEqual(['cv', 'cover_letter']);
    });

    it('rebuilds a linked document that has gone stale', async () => {
      cv.set(doc(1));
      coverLetter.set(doc(2));
      staleAnswer = true;

      await store.commit('tailored markdown', true);

      expect(staleCalls).toEqual(['cv', 'cover_letter']);
      expect(createdCv).toEqual(['tailored markdown']);
      expect(createdCoverLetter).toBe(1);
    });

    it('keeps a linked CV when there is no tailoring to rebuild it from', async () => {
      cv.set(doc(1));

      await store.commit('', true);

      // No tailored source, so the CV is neither rebuilt nor even tested for
      // staleness. The cover letter has no such precondition: it is missing, so
      // it is created outright, which also skips the staleness check.
      expect(staleCalls).toEqual([]);
      expect(createdCv).toEqual([]);
      expect(createdCoverLetter).toBe(1);
    });
  });

  describe('chooseExisting', () => {
    it('does nothing without an id', async () => {
      await store.chooseExisting('cv', null);

      expect(closedChoosers).toEqual([]);
      expect(marked).toBe(0);
    });

    it('adopts the application, closes the chooser and stales the checks', async () => {
      await store.chooseExisting('cv', 5);

      expect(application()).toEqual({ id: 2 });
      expect(closedChoosers).toEqual(['cv']);
      expect(marked).toBe(1);
    });

    it('leaves the screen alone when the link did not happen', async () => {
      linkResult = null;

      await store.chooseExisting('cv', 5);

      expect(application()).toBeNull();
      expect(closedChoosers).toEqual([]);
      expect(marked).toBe(0);
    });
  });
});
