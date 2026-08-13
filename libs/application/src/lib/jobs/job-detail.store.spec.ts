import { TestBed } from '@angular/core/testing';
import type { Application, DocumentLibraryItem, Job, Profile, Settings } from '@applye/core';
import { DbService, JobsStore } from '@applye/data';
import { JobDetailStore } from './job-detail.store';
import { ToastService } from '../shell/toast.service';

const JOB = { id: 5, company: 'Acme', title: 'Engineer', language: 'en', jdText: 'React' } as Job;
const PROFILE = { fullMd: '# Me' } as Profile;
const SETTINGS = { defaultDocLanguage: 'en' } as Settings;
const APPS = [{ id: 3, jobId: 5, cvDocumentId: 1 }] as Application[];

/** Two CVs in this job's language, one in another - the narrowing is the point. */
const CVS = [
  { id: 1, language: 'en', docType: 'cv' },
  { id: 2, language: 'en', docType: 'cv' },
  { id: 8, language: 'de', docType: 'cv' },
] as DocumentLibraryItem[];
const LETTERS = [{ id: 4, docType: 'cover_letter' }] as DocumentLibraryItem[];

function createStore(over: Record<string, jest.Mock> = {}) {
  const db = {
    getProfile: jest.fn().mockResolvedValue(PROFILE),
    getSettings: jest.fn().mockResolvedValue(SETTINGS),
    getJob: jest.fn().mockResolvedValue(JOB),
    listApplications: jest.fn().mockResolvedValue(APPS),
    documentLibraryList: jest
      .fn()
      .mockImplementation((kind: string) => Promise.resolve(kind === 'cv' ? CVS : LETTERS)),
    upsertApplication: jest.fn().mockResolvedValue({ id: 9, jobId: 5, status: 'saved' }),
    ...over,
  };
  const jobs = { patchOverviewRow: jest.fn() };
  const toast = { error: jest.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      JobDetailStore,
      { provide: DbService, useValue: db },
      { provide: JobsStore, useValue: jobs },
      { provide: ToastService, useValue: toast },
    ],
  });
  return { store: TestBed.inject(JobDetailStore), db, jobs, toast };
}

describe('JobDetailStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('loadContext', () => {
    it('reads the profile and the settings in one pass', async () => {
      const { store } = createStore();
      await store.loadContext();

      expect(store.profile()).toEqual(PROFILE);
      expect(store.settings()).toEqual(SETTINGS);
    });

    /// A detail screen that renders without its settings is worth more than one
    /// that renders an error - the user can still paste, score and save.
    it('leaves both null rather than throwing when the read fails', async () => {
      const { store } = createStore({ getSettings: jest.fn().mockRejectedValue(new Error('db')) });

      await expect(store.loadContext()).resolves.toBeUndefined();
      expect(store.settings()).toBeNull();
    });
  });

  describe('loadJob', () => {
    it('loads the job, its description, its application row and its library', async () => {
      const { store } = createStore();
      await store.loadContext();

      expect(await store.loadJob(5)).toBe(true);

      expect(store.job()).toEqual(JOB);
      expect(store.jdText()).toBe('React');
      expect(store.application()).toEqual(APPS[0]);
      expect(store.coverLetters()).toEqual(LETTERS);
    });

    /// The page sequences five services after this call. Answering false rather
    /// than leaving a null job behind is what lets it skip them instead of
    /// running each one against nothing.
    it('answers false for a job that does not exist', async () => {
      const { store } = createStore({ getJob: jest.fn().mockResolvedValue(null) });

      expect(await store.loadJob(5)).toBe(false);
      expect(store.job()).toBeNull();
    });

    it('answers false rather than throwing when a read fails', async () => {
      const { store } = createStore({
        listApplications: jest.fn().mockRejectedValue(new Error('db')),
      });

      expect(await store.loadJob(5)).toBe(false);
    });

    /// Only the application row is matched by job id; `listApplications` returns
    /// every row, so picking the wrong one would attach this job's documents to
    /// another application.
    it('takes only the application row belonging to this job', async () => {
      const { store } = createStore({
        listApplications: jest.fn().mockResolvedValue([
          { id: 1, jobId: 99 },
          { id: 3, jobId: 5 },
        ] as Application[]),
      });

      await store.loadJob(5);
      expect(store.application()?.id).toBe(3);
    });
  });

  describe('refreshLibrary', () => {
    /// The narrowing used to run only on the initial load. Returning from the
    /// document editor called the unnarrowed path, so the base-CV picker filled
    /// with CVs written for other jobs in other languages.
    it('narrows the base-CV choices on every path, not just the first load', async () => {
      const { store } = createStore();
      await store.loadContext();
      await store.loadJob(5);

      expect(store.matchingCvs().map((c) => c.id)).toEqual([1, 2]);

      await store.refreshLibrary();

      expect(store.matchingCvs().map((c) => c.id)).toEqual([1, 2]);
    });

    /// The linked CV is pulled in even when the language filter would drop it,
    /// so a re-tailor builds on this job's own document.
    it('keeps the linked CV in the offer across a refresh', async () => {
      const { store } = createStore({
        listApplications: jest.fn().mockResolvedValue([{ id: 3, jobId: 5, cvDocumentId: 8 }]),
      });
      await store.loadContext();
      await store.loadJob(5);
      await store.refreshLibrary();

      expect(store.matchingCvs().map((c) => c.id)).toContain(8);
      expect(store.selectedBaseCvId()).toBe(8);
    });

    /// Called before a job is loaded there is nothing to narrow against, and
    /// narrowing against null would offer the whole library.
    it('does nothing without a job', async () => {
      const { store, db } = createStore();
      await store.refreshLibrary();

      expect(db.documentLibraryList).not.toHaveBeenCalled();
      expect(store.matchingCvs()).toEqual([]);
    });
  });

  describe('ensureApplication', () => {
    it('returns the existing row without writing', async () => {
      const { store, db } = createStore();
      await store.loadJob(5);

      expect((await store.ensureApplication('en'))?.id).toBe(3);
      expect(db.upsertApplication).not.toHaveBeenCalled();
    });

    it('creates the row and patches the overview so My Jobs does not re-fetch', async () => {
      const { store, db, jobs } = createStore({
        listApplications: jest.fn().mockResolvedValue([]),
      });
      await store.loadJob(5);

      const created = await store.ensureApplication('de');

      expect(db.upsertApplication).toHaveBeenCalledWith({
        jobId: 5,
        status: 'saved',
        docLanguage: 'de',
        sourceUrl: JOB.source,
      });
      expect(created?.id).toBe(9);
      expect(store.application()?.id).toBe(9);
      expect(jobs.patchOverviewRow).toHaveBeenCalledWith(5, { status: 'saved' });
    });

    /// Null rather than a throw: the message this failure deserves is a
    /// translated string, and `libs/application` has no `TranslateService`.
    it('answers null when there is no job to attach one to', async () => {
      const { store, db } = createStore();

      expect(await store.ensureApplication('en')).toBeNull();
      expect(db.upsertApplication).not.toHaveBeenCalled();
    });
  });

  /**
   * Every read here is fail-soft, and stays that way - a detail screen the user
   * can still paste into beats one that renders an error. What it must not do
   * is pass for a healthy screen: a failed profile read looked exactly like "no
   * profile yet", and a job whose reads threw looked like "nothing scored yet".
   */
  describe('fail-soft reads', () => {
    it('records and raises why the context could not be loaded', async () => {
      const { store, toast } = createStore({
        getProfile: jest.fn().mockRejectedValue(new Error('db gone')),
      });

      await store.loadContext();

      expect(store.profile()).toBeNull();
      expect(store.loadError()).toContain('db gone');
      expect(toast.error).toHaveBeenCalledTimes(1);
    });

    it('records and raises why a job could not be fully loaded', async () => {
      const { store, toast } = createStore({
        listApplications: jest.fn().mockRejectedValue(new Error('read failed')),
      });

      expect(await store.loadJob(5)).toBe(false);
      expect(store.loadError()).toContain('read failed');
      expect(toast.error).toHaveBeenCalledTimes(1);
    });

    it('clears the error once a load succeeds', async () => {
      const { store } = createStore();

      await store.loadContext();

      expect(store.loadError()).toBeNull();
    });
  });
});
