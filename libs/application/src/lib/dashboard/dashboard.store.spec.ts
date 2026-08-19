import { TestBed } from '@angular/core/testing';
import type { JobOverview, PipelineCard, Profile } from '@applye/core';
import { DbService, DocumentsGateway, JobsGateway, SystemGateway } from '@applye/data';
import { DashboardStore } from './dashboard.store';

const card = (over: Partial<PipelineCard> = {}): PipelineCard =>
  ({ id: 1, status: 'applied', company: 'Acme', title: 'Engineer', ...over }) as PipelineCard;

const job = (over: Partial<JobOverview> = {}): JobOverview =>
  ({ id: 1, claimed: true, company: 'Acme', title: 'Engineer', ...over }) as JobOverview;

const profile = (fullMd: string): Profile => ({ id: 1, fullMd }) as Profile;

/** Hours from now, as the ISO string a scheduled stage carries. */
const inHours = (h: number): string => new Date(Date.now() + h * 3_600_000).toISOString();

function createStore(over: Partial<Record<string, jest.Mock>> = {}) {
  const db = {
    listPipelineCards: jest.fn().mockResolvedValue([]),
    listJobsOverview: jest.fn().mockResolvedValue([]),
    getProfile: jest.fn().mockResolvedValue(null),
    hashText: jest.fn().mockResolvedValue('hash'),
    getJob: jest.fn().mockResolvedValue(null),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      DashboardStore,
      { provide: DbService, useValue: db },
      { provide: JobsGateway, useValue: db },
      { provide: DocumentsGateway, useValue: db },
      { provide: SystemGateway, useValue: db },
    ],
  });
  return { store: TestBed.inject(DashboardStore), db };
}

const noProgress = () => null;

describe('DashboardStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  /**
   * A failed load leaves the signals empty, which renders the honest empty
   * state - a half-populated dashboard would quietly under-report how many
   * applications need attention.
   */
  it('reports a failed load without half-populating the page', async () => {
    const { store } = createStore({
      listPipelineCards: jest.fn().mockRejectedValue(new Error('db down')),
    });
    expect(await store.load(noProgress)).toBe(false);
    expect(store.cards()).toEqual([]);
    expect(store.loading()).toBe(false);
  });

  it('hashes the profile text only when there is text to hash', async () => {
    const { store, db } = createStore({ getProfile: jest.fn().mockResolvedValue(profile('  ')) });
    await store.load(noProgress);
    expect(db.hashText).not.toHaveBeenCalled();
    expect(store.savedMdHash()).toBeNull();

    const withText = createStore({ getProfile: jest.fn().mockResolvedValue(profile('# Jane')) });
    await withText.store.load(noProgress);
    expect(withText.db.hashText).toHaveBeenCalledWith('# Jane');
  });

  describe('new-user detection', () => {
    /** `listJobsOverview` returns unclaimed rows too, and the dashboard is not
     * the filter that shows them. */
    it('ignores unclaimed jobs', async () => {
      const { store } = createStore({
        listJobsOverview: jest.fn().mockResolvedValue([job({ id: 1, claimed: false })]),
      });
      await store.load(noProgress);
      expect(store.isNewUser()).toBe(true);
    });

    it('is not a new user once a job is claimed', async () => {
      const { store } = createStore({
        listJobsOverview: jest.fn().mockResolvedValue([job({ claimed: true })]),
      });
      await store.load(noProgress);
      expect(store.isNewUser()).toBe(false);
    });

    it('is not a new user once the profile has content', async () => {
      const { store } = createStore({ getProfile: jest.fn().mockResolvedValue(profile('# Jane')) });
      await store.load(noProgress);
      expect(store.isNewUser()).toBe(false);
    });
  });

  describe('KPIs', () => {
    it('counts active, offers and overdue separately', async () => {
      const { store } = createStore({
        listPipelineCards: jest
          .fn()
          .mockResolvedValue([
            card({ id: 1, status: 'applied', overdue: true }),
            card({ id: 2, status: 'interview' }),
            card({ id: 3, status: 'offer' }),
            card({ id: 4, status: 'rejected', overdue: true }),
          ]),
      });
      await store.load(noProgress);

      // Active excludes the terminal columns; overdue does not care about status.
      expect(store.kActive()).toBe(3);
      expect(store.kOffers()).toBe(1);
      expect(store.kOverdue()).toBe(2);
    });
  });

  describe('upcoming interviews', () => {
    it('lists only future scheduled stages, soonest first', async () => {
      const { store } = createStore({
        listPipelineCards: jest.fn().mockResolvedValue([
          card({ id: 1, currentStageStatus: 'scheduled', currentStageScheduledAt: inHours(72) }),
          card({ id: 2, currentStageStatus: 'scheduled', currentStageScheduledAt: inHours(5) }),
          // already happened
          card({ id: 3, currentStageStatus: 'scheduled', currentStageScheduledAt: inHours(-5) }),
          // not scheduled
          card({ id: 4, currentStageStatus: 'passed', currentStageScheduledAt: inHours(10) }),
        ]),
      });
      await store.load(noProgress);

      expect(store.upcoming().map((r) => r.applicationId)).toEqual([2, 1]);
      expect(store.kInterviews()).toBe(2);
    });

    /** The list marks anything inside 48 hours; that mark is what makes the
     * row read as urgent rather than merely scheduled. */
    it('marks only what falls inside the soon window', async () => {
      const { store } = createStore({
        listPipelineCards: jest
          .fn()
          .mockResolvedValue([
            card({ id: 1, currentStageStatus: 'scheduled', currentStageScheduledAt: inHours(5) }),
            card({ id: 2, currentStageStatus: 'scheduled', currentStageScheduledAt: inHours(72) }),
          ]),
      });
      await store.load(noProgress);

      expect(store.upcoming().map((r) => r.soon)).toEqual([true, false]);
    });

    it('shows at most five, however many are scheduled', async () => {
      const { store } = createStore({
        listPipelineCards: jest.fn().mockResolvedValue(
          Array.from({ length: 8 }, (_, i) =>
            card({
              id: i + 1,
              currentStageStatus: 'scheduled',
              currentStageScheduledAt: inHours(i + 1),
            }),
          ),
        ),
      });
      await store.load(noProgress);

      expect(store.kInterviews()).toBe(8);
      expect(store.upcomingTop()).toHaveLength(5);
    });
  });

  describe('naming the unfinished tailoring session', () => {
    it('names nothing when no session is in flight', async () => {
      const { store, db } = createStore();
      await store.load(noProgress);
      expect(store.resumeJobLabel()).toBe('');
      expect(db.getJob).not.toHaveBeenCalled();
    });

    it('takes the name from the overview row when there is one', async () => {
      const { store, db } = createStore({
        listJobsOverview: jest.fn().mockResolvedValue([job({ id: 4, company: 'Globex' })]),
      });
      await store.load(() => 4);
      expect(store.resumeJobLabel()).toBe('Globex');
      expect(db.getJob).not.toHaveBeenCalled();
    });

    /**
     * A session started on an analysed-but-unsaved job has no overview row, and
     * the card used to render its caption with an empty tail.
     */
    it('falls back to the job row when the overview has no entry', async () => {
      const { store } = createStore({
        getJob: jest.fn().mockResolvedValue({ id: 9, company: 'Initech' }),
      });
      await store.load(() => 9);
      expect(store.resumeJobLabel()).toBe('Initech');
    });

    it('names the id rather than nothing when even that read fails', async () => {
      const { store } = createStore({ getJob: jest.fn().mockRejectedValue(new Error('gone')) });
      await store.load(() => 9);
      expect(store.resumeJobLabel()).toBe('#9');
    });
  });
});
