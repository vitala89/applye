import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DocumentLibraryItem, Job, Profile, Settings } from '@applye/core';
import { JobDetailStore } from './job-detail.store';
import { JobScoringService } from './job-scoring.service';
import { JobTailoringStore } from './job-tailoring.store';
import { TailorContext, TailoringService } from './tailoring.service';

describe('JobTailoringStore', () => {
  let store: JobTailoringStore;
  let restored: TailorContext[];
  let ran: TailorContext[];
  let cancelled: number[];
  let resets: number;
  let cancelledFlag: ReturnType<typeof signal<boolean>>;
  let cache: ReturnType<typeof signal<{ total: number } | null>>;
  let job: ReturnType<typeof signal<Job | null>>;

  beforeEach(() => {
    restored = [];
    ran = [];
    cancelled = [];
    resets = 0;
    cancelledFlag = signal(false);
    cache = signal<{ total: number } | null>(null);
    job = signal<Job | null>({ id: 4, title: 'Angular dev' } as Job);

    TestBed.configureTestingModule({
      providers: [
        JobTailoringStore,
        {
          provide: JobDetailStore,
          useValue: {
            job,
            profile: signal({ fullMd: '# me' } as Profile),
            settings: signal({ provider: 'openai' } as Settings),
            jdText: signal('the description'),
            selectedBaseCvId: signal(12),
            matchingCvs: signal<DocumentLibraryItem[]>([]),
          },
        },
        { provide: JobScoringService, useValue: { cache } },
        {
          provide: TailoringService,
          useValue: {
            cancelled: cancelledFlag,
            reset: () => {
              resets += 1;
            },
            run: (c: TailorContext) => {
              ran.push(c);
              return Promise.resolve();
            },
            restoreFromCache: (c: TailorContext) => {
              restored.push(c);
              return Promise.resolve();
            },
            cancel: (id: number | undefined) => cancelled.push(id ?? -1),
          },
        },
      ],
    });
    store = TestBed.inject(JobTailoringStore);
  });

  it('assembles the context the passes read, including the score from another service', async () => {
    cache.set({ total: 71 });

    await store.run();

    expect(ran).toEqual([
      {
        job: { id: 4, title: 'Angular dev' },
        profile: { fullMd: '# me' },
        settings: { provider: 'openai' },
        jdText: 'the description',
        scoring: { total: 71 },
        baseCvId: 12,
        matchingCvs: [],
      },
    ]);
  });

  it('reads the context at call time, so a restore after a rescore sees the new score', async () => {
    await store.restoreFromCache();
    cache.set({ total: 88 });
    await store.restoreFromCache();

    expect(restored[0].scoring).toBeNull();
    expect(restored[1].scoring).toEqual({ total: 88 });
  });

  it('cancels against the job now open', () => {
    store.cancel();

    expect(cancelled).toEqual([4]);
  });

  // `cancelled` is not part of a run: it records that the user stopped one, and
  // it survives the reset that ends that run so the page can say so. Moving to
  // another job is the one moment that stops being true, which is why clearing
  // it lives here rather than inside `TailoringService.reset()`.
  it('clears the user-cancelled flag as well as the run state', () => {
    cancelledFlag.set(true);

    store.reset();

    expect(resets).toBe(1);
    expect(cancelledFlag()).toBe(false);
  });
});
