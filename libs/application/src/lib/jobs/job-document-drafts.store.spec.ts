import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { Application, DocumentLibraryItem, Job, Profile, Settings } from '@applye/core';
import { CoverLetterDraftService } from '../documents/cover-letter-draft.service';
import { CoverLetterTailorService } from '../documents/cover-letter-tailor.service';
import { CvDraftService } from '../documents/cv-draft.service';
import { CvGapDialogService } from '../documents/cv-gap-dialog.service';
import { DocumentGenService } from '../documents/document-gen.service';
import { JobGapFillService } from '../documents/job-gap-fill.service';
import { LinkedDocumentsService } from '../documents/linked-documents.service';
import { DocumentReviewStatusService } from './document-review-status.service';
import { DocumentReviewTargetsService } from './document-review-targets.service';
import { JobDetailStore } from './job-detail.store';
import { JobDocumentDraftsStore } from './job-document-drafts.store';
import { JobFinalChecksStore } from './job-final-checks.store';

const doc = (id: number): DocumentLibraryItem =>
  ({ id, title: `doc ${id}` }) as DocumentLibraryItem;

describe('JobDocumentDraftsStore', () => {
  let store: JobDocumentDraftsStore;
  let cvInputs: Record<string, unknown>[];
  let coverLetterInputs: Record<string, unknown>[];
  let refusals: string[];
  let successes: string[];
  let preparing: Record<string, boolean>;
  let cv: ReturnType<typeof signal<DocumentLibraryItem | null>>;
  let coverLetter: ReturnType<typeof signal<DocumentLibraryItem | null>>;
  let application: ReturnType<typeof signal<Application | null>>;
  let marked: number;
  let cvResult: { application: Application; document: DocumentLibraryItem } | null;

  beforeEach(() => {
    cvInputs = [];
    coverLetterInputs = [];
    refusals = [];
    successes = [];
    preparing = {};
    cv = signal<DocumentLibraryItem | null>(null);
    coverLetter = signal<DocumentLibraryItem | null>(null);
    application = signal<Application | null>(null);
    marked = 0;
    cvResult = { application: { id: 3 } as Application, document: doc(21) };

    TestBed.configureTestingModule({
      providers: [
        JobDocumentDraftsStore,
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
        {
          provide: JobDetailStore,
          useValue: {
            job: signal({ id: 4, title: 'Angular dev', company: 'Acme' } as Job),
            profile: signal({ fullMd: '# me' } as Profile),
            settings: signal({ provider: 'openai' } as Settings),
            coverLetters: signal<DocumentLibraryItem[]>([]),
            application,
            ensureApplicationOrThrow: () => Promise.resolve({ id: 1 } as Application),
          },
        },
        {
          provide: JobFinalChecksStore,
          useValue: {
            markOutdated: () => {
              marked += 1;
            },
          },
        },
        { provide: LinkedDocumentsService, useValue: { cv, coverLetter } },
        {
          provide: DocumentReviewStatusService,
          useValue: {
            run: <T>(body: () => Promise<T>) => body(),
            refuse: (m: string) => refusals.push(m),
            succeed: (m: string) => successes.push(m),
          },
        },
        {
          provide: DocumentReviewTargetsService,
          useValue: { language: signal('en'), region: signal('generic') },
        },
        {
          provide: CvDraftService,
          useValue: {
            create: (i: Record<string, unknown>) => {
              cvInputs.push(i);
              return Promise.resolve(cvResult);
            },
          },
        },
        {
          provide: CoverLetterDraftService,
          useValue: {
            create: (i: Record<string, unknown>) => {
              coverLetterInputs.push(i);
              return Promise.resolve({
                application: { id: 3 } as Application,
                document: doc(22),
              });
            },
          },
        },
        { provide: CoverLetterTailorService, useValue: { prepare: () => Promise.resolve(null) } },
        {
          provide: CvGapDialogService,
          useValue: { submit: () => undefined, cancel: () => undefined },
        },
        {
          provide: DocumentGenService,
          useValue: {
            isPreparing: (_id: number, kind: string) => !!preparing[kind],
            anyPreparing: () => Object.values(preparing).some(Boolean),
          },
        },
        // Echoes the context back so a test can see which `kind` this store
        // asked for, without a real JobGapFillService.
        { provide: JobGapFillService, useValue: { hooks: (ctx: unknown) => ctx } },
      ],
    });
    store = TestBed.inject(JobDocumentDraftsStore);
  });

  describe('createCv', () => {
    it('refuses without a tailored source rather than generating an untailored CV', async () => {
      await store.createCv('');

      expect(cvInputs).toEqual([]);
      expect(refusals).toEqual(['Tailor the CV first before creating a linked CV draft.']);
    });

    it('does not start a second run while one is in flight', async () => {
      preparing['cv'] = true;

      await store.createCv('tailored markdown');

      expect(cvInputs).toEqual([]);
      expect(refusals).toEqual([]);
    });

    it('links the result and stales the checks', async () => {
      await store.createCv('tailored markdown');

      expect(cvInputs[0]['tailoredMd']).toBe('tailored markdown');
      expect(application()).toEqual({ id: 3 });
      expect(cv()).toEqual(doc(21));
      expect(marked).toBe(1);
      expect(successes).toEqual(['CV document linked.']);
    });

    it('changes nothing when the draft service declined to produce one', async () => {
      cvResult = null;

      await store.createCv('tailored markdown');

      expect(cv()).toBeNull();
      expect(marked).toBe(0);
      expect(successes).toEqual([]);
    });

    it('tags its gap-fill pass as the CV, so a shared dialog shows CV copy', async () => {
      await store.createCv('tailored markdown');

      expect(cvInputs[0]['kind']).toBe('cv');
    });
  });

  describe('createCoverLetter', () => {
    it('asks for gap fill when nothing has answered those questions yet', async () => {
      await store.createCoverLetter();

      expect(coverLetterInputs[0]['skipGapFill']).toBe(false);
      expect(coverLetter()).toEqual(doc(22));
    });

    /**
     * The reported bug: generating a cover letter raised the shared gap
     * dialog with CV wording ("Checking your CV against this job...", "Add
     * these to your CV?") because nothing told the dialog which document was
     * actually being built.
     */
    it('tags its gap-fill pass as the cover letter, not the CV', async () => {
      await store.createCoverLetter();

      expect(coverLetterInputs[0]['kind']).toBe('cover_letter');
    });

    it('skips gap fill when a CV is already linked', async () => {
      cv.set(doc(21));

      await store.createCoverLetter();

      expect(coverLetterInputs[0]['skipGapFill']).toBe(true);
    });

    // A CV still generating has not linked itself yet, so testing only the
    // linked CV let a cover letter started alongside it raise a second dialog
    // asking the same questions.
    it('skips gap fill while a CV is still generating', async () => {
      preparing['cv'] = true;

      await store.createCoverLetter();

      expect(coverLetterInputs[0]['skipGapFill']).toBe(true);
    });

    it('refuses without a profile to write from', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          JobDocumentDraftsStore,
          { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
          {
            provide: JobDetailStore,
            useValue: {
              job: signal({ id: 4 } as Job),
              profile: signal(null),
              settings: signal({} as Settings),
              coverLetters: signal<DocumentLibraryItem[]>([]),
              application,
              ensureApplicationOrThrow: () => Promise.resolve({ id: 1 } as Application),
            },
          },
          { provide: JobFinalChecksStore, useValue: { markOutdated: () => undefined } },
          { provide: LinkedDocumentsService, useValue: { cv, coverLetter } },
          {
            provide: DocumentReviewStatusService,
            useValue: {
              run: <T>(body: () => Promise<T>) => body(),
              refuse: (m: string) => refusals.push(m),
              succeed: (m: string) => successes.push(m),
            },
          },
          {
            provide: DocumentReviewTargetsService,
            useValue: { language: signal('en'), region: signal('generic') },
          },
          { provide: CvDraftService, useValue: { create: () => Promise.resolve(null) } },
          {
            provide: CoverLetterDraftService,
            useValue: {
              create: (i: Record<string, unknown>) => {
                coverLetterInputs.push(i);
                return Promise.resolve(null);
              },
            },
          },
          { provide: CoverLetterTailorService, useValue: { prepare: () => Promise.resolve(null) } },
          {
            provide: CvGapDialogService,
            useValue: { submit: () => undefined, cancel: () => undefined },
          },
          {
            provide: DocumentGenService,
            useValue: { isPreparing: () => false, anyPreparing: () => false },
          },
          { provide: JobGapFillService, useValue: { hooks: () => ({}) } },
        ],
      });

      await TestBed.inject(JobDocumentDraftsStore).createCoverLetter();

      expect(coverLetterInputs).toEqual([]);
      expect(refusals).toEqual([
        'Add a profile first - there is no content to build a CV from yet.',
      ]);
    });
  });
});
