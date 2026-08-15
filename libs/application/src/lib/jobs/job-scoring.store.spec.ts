import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Job, Profile, Settings } from '@applye/core';
import { DocumentReviewTargetsService } from './document-review-targets.service';
import { JobDetailStore } from './job-detail.store';
import { ScoreContext } from './job-score-payload';
import { JobScoringService } from './job-scoring.service';
import { JobScoringStore } from './job-scoring.store';
import { TailoringService } from './tailoring.service';

describe('JobScoringStore', () => {
  let store: JobScoringStore;
  let scored: { ctx: ScoreContext; forceRefresh: boolean }[];
  let rescored: ScoreContext[];
  let saved: (number | undefined)[];
  let job: ReturnType<typeof signal<Job | null>>;
  let profile: ReturnType<typeof signal<Profile | null>>;
  let results: ReturnType<typeof signal<{ pass: number; resultMd: string }[]>>;
  let region: ReturnType<typeof signal<string>>;

  beforeEach(() => {
    scored = [];
    rescored = [];
    saved = [];
    job = signal<Job | null>({
      id: 7,
      title: 'Angular dev',
      legitimacyNotes: JSON.stringify(['No company website']),
    } as Job);
    profile = signal<Profile | null>({ fullMd: '# me', targetArchetypes: '[]' } as Profile);
    results = signal<{ pass: number; resultMd: string }[]>([]);
    region = signal('de');

    TestBed.configureTestingModule({
      providers: [
        JobScoringStore,
        {
          provide: JobDetailStore,
          useValue: {
            job,
            profile,
            settings: signal({ provider: 'openai' } as Settings),
            jdText: signal('the description'),
          },
        },
        {
          provide: JobScoringService,
          useValue: {
            score: (ctx: ScoreContext, forceRefresh: boolean) => {
              scored.push({ ctx, forceRefresh });
              return Promise.resolve();
            },
            rescoreAfterTailor: (ctx: ScoreContext) => {
              rescored.push(ctx);
              return Promise.resolve();
            },
            savePostTailor: (id: number | undefined) => {
              saved.push(id);
              return Promise.resolve();
            },
          },
        },
        { provide: TailoringService, useValue: { results } },
        { provide: DocumentReviewTargetsService, useValue: { region } },
      ],
    });
    store = TestBed.inject(JobScoringStore);
  });

  it('assembles the context a baseline score reads, with no tailored CV', async () => {
    await store.scoreJob();

    expect(scored).toEqual([
      {
        forceRefresh: false,
        ctx: {
          job: job(),
          profile: profile(),
          settings: { provider: 'openai' },
          jdText: 'the description',
          legitimacyNotes: ['No company website'],
          tailoredResumeMd: '',
          reviewRegion: 'de',
        },
      },
    ]);
  });

  it('passes the force-refresh flag through, so a re-score can skip the cache', async () => {
    await store.scoreJob(true);

    expect(scored[0].forceRefresh).toBe(true);
  });

  // The rescore rates the CV the pipeline actually produced. Passes 1 and 2 are
  // intermediate, so reading anything but pass 3 would score a draft.
  it('rescores against the third pass only', async () => {
    results.set([
      { pass: 1, resultMd: 'first draft' },
      { pass: 3, resultMd: 'final CV' },
      { pass: 2, resultMd: 'second draft' },
    ]);

    await store.updateScoreAfterTailor();

    expect(rescored[0].tailoredResumeMd).toBe('final CV');
  });

  it('rescores with an empty CV when no pass has landed, rather than throwing', async () => {
    await store.updateScoreAfterTailor();

    expect(rescored[0].tailoredResumeMd).toBe('');
  });

  it('reads the context at call time, so a rescore after a region change sees the new market', async () => {
    await store.scoreJob();
    region.set('uk');
    await store.scoreJob();

    expect(scored[0].ctx.reviewRegion).toBe('de');
    expect(scored[1].ctx.reviewRegion).toBe('uk');
  });

  it('commits the post-tailor score against the job now open', async () => {
    await store.savePostTailorScore();
    job.set(null);
    await store.savePostTailorScore();

    expect(saved).toEqual([7, undefined]);
  });

  it('parses the legitimacy notes off the job row, and reports none for a job without them', () => {
    expect(store.legitimacyNotes()).toEqual(['No company website']);

    job.set({ id: 8, title: 'Other' } as Job);

    expect(store.legitimacyNotes()).toEqual([]);
  });

  it('reports archetypes only when the profile declares some', () => {
    expect(store.hasArchetypes()).toBe(false);

    profile.set({ fullMd: '# me', targetArchetypes: JSON.stringify(['ic-senior']) } as Profile);

    expect(store.hasArchetypes()).toBe(true);
  });
});
