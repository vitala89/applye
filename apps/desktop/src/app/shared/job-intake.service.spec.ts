import { TestBed } from '@angular/core/testing';
import { DbService } from '@applye/data';
import { JobIntakeService } from './job-intake.service';

describe('JobIntakeService', () => {
  let svc: JobIntakeService;
  let pasteCalls: { jdText: string; title?: string; company?: string }[];
  let cacheCalls: { jobId: number; hash: string }[];
  let archetypeCalls: { title?: string; jdText: string; archetypesJson?: string }[];
  let pasteFails: boolean;
  let hardFilterPassed: boolean;
  let cachedScore: Record<string, unknown> | null;
  let archetypeResult: boolean;

  beforeEach(() => {
    pasteCalls = [];
    cacheCalls = [];
    archetypeCalls = [];
    pasteFails = false;
    hardFilterPassed = true;
    cachedScore = null;
    archetypeResult = true;

    const db = {
      jobPaste: (jdText: string, title?: string, company?: string) => {
        if (pasteFails) return Promise.reject(new Error('parse blew up'));
        pasteCalls.push({ jdText, title, company });
        return Promise.resolve({
          id: 7,
          title: title ?? 'Parsed Title',
          company: company ?? 'Parsed Co',
          jdText,
          hardFilterPassed,
        });
      },
      scoreCacheGet: (jobId: number, hash: string) => {
        cacheCalls.push({ jobId, hash });
        return Promise.resolve(cachedScore);
      },
      checkArchetypeMatch: (title: string | undefined, jdText: string, archetypesJson?: string) => {
        archetypeCalls.push({ title, jdText, archetypesJson });
        return Promise.resolve(archetypeResult);
      },
    };

    TestBed.configureTestingModule({
      providers: [JobIntakeService, { provide: DbService, useValue: db }],
    });
    svc = TestBed.inject(JobIntakeService);
  });

  it('parses the JD and clears the busy flag when it is done', async () => {
    const result = await svc.parse({ jdText: 'Senior Angular dev' });

    expect(result?.job.id).toBe(7);
    expect(pasteCalls).toEqual([
      { jdText: 'Senior Angular dev', title: undefined, company: undefined },
    ]);
    expect(svc.parsing()).toBe(false);
    expect(svc.status()).toBe('');
    expect(svc.error()).toBe(false);
  });

  it('passes the known title and company through so a header-less JD keeps them', async () => {
    await svc.parse({
      jdText: 'no header here',
      knownTitle: 'Known Title',
      knownCompany: 'Known Co',
    });

    expect(pasteCalls[0]).toEqual({
      jdText: 'no header here',
      title: 'Known Title',
      company: 'Known Co',
    });
  });

  it('reports a blocked job and skips the cache and archetype work', async () => {
    hardFilterPassed = false;

    const result = await svc.parse({ jdText: 'jd', scoringHash: 'hash-1' });

    expect(result?.cached).toBeNull();
    expect(svc.status()).toBe('Hard filter failed - job blocked.');
    expect(svc.error()).toBe(false);
    expect(cacheCalls).toEqual([]);
    expect(archetypeCalls).toEqual([]);
  });

  it('returns a cached score for the job and profile hash without applying it', async () => {
    cachedScore = { total: 82 };

    const result = await svc.parse({ jdText: 'jd', scoringHash: 'hash-1' });

    expect(cacheCalls).toEqual([{ jobId: 7, hash: 'hash-1' }]);
    expect(result?.cached).toEqual({ total: 82 });
  });

  it('skips the cache probe when the profile has no scoring hash', async () => {
    const result = await svc.parse({ jdText: 'jd' });

    expect(cacheCalls).toEqual([]);
    expect(result?.cached).toBeNull();
  });

  it('records an archetype mismatch as a warning without failing the parse', async () => {
    archetypeResult = false;

    const result = await svc.parse({ jdText: 'jd', targetArchetypes: '[{"name":"Backend"}]' });

    expect(result?.job.id).toBe(7);
    expect(svc.archetypeMatch()).toBe(false);
    expect(svc.error()).toBe(false);
    expect(archetypeCalls[0].archetypesJson).toBe('["Backend"]');
  });

  it('checks archetypes with no list when the profile defines none', async () => {
    await svc.parse({ jdText: 'jd' });

    expect(archetypeCalls[0].archetypesJson).toBeUndefined();
    expect(svc.archetypeMatch()).toBe(true);
  });

  it('surfaces a parse failure on the status line and returns null', async () => {
    pasteFails = true;

    const result = await svc.parse({ jdText: 'jd' });

    expect(result).toBeNull();
    expect(svc.error()).toBe(true);
    expect(svc.status()).toContain('parse blew up');
    expect(svc.parsing()).toBe(false);
  });

  it('clears a previous failure and archetype warning when a new parse starts', async () => {
    pasteFails = true;
    await svc.parse({ jdText: 'jd' });
    expect(svc.error()).toBe(true);

    pasteFails = false;
    await svc.parse({ jdText: 'jd again' });

    expect(svc.error()).toBe(false);
    expect(svc.status()).toBe('');
  });
});
