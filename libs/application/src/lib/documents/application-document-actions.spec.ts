import {
  coverLetterStaleInput,
  cvStaleInput,
  decideCoverLetterAction,
  decideCvAction,
} from './application-document-actions';

const JOB = { id: 7, jdText: 'JD' } as never;
const PROFILE = { fullMd: 'PROFILE' } as never;

describe('cvStaleInput', () => {
  it('asks nothing when there is no job to ask about', () => {
    expect(cvStaleInput(null, 'TAILORED', 'en', 'de')).toBeNull();
  });

  it('varies with every field the staleness question depends on', () => {
    const base = cvStaleInput(JOB, 'TAILORED', 'en', 'de');

    expect(base).not.toBeNull();
    expect(cvStaleInput(JOB, 'OTHER', 'en', 'de')).not.toBe(base);
    expect(cvStaleInput(JOB, 'TAILORED', 'de', 'de')).not.toBe(base);
    expect(cvStaleInput(JOB, 'TAILORED', 'en', 'uk')).not.toBe(base);
  });
});

describe('coverLetterStaleInput', () => {
  it('asks nothing without a job or without profile content', () => {
    expect(coverLetterStaleInput(null, PROFILE, 'en', 'de')).toBeNull();
    expect(coverLetterStaleInput(JOB, null, 'en', 'de')).toBeNull();
    expect(coverLetterStaleInput(JOB, { fullMd: '' } as never, 'en', 'de')).toBeNull();
  });

  it('varies with the profile and the job description, not only the job', () => {
    const base = coverLetterStaleInput(JOB, PROFILE, 'en', 'de');

    expect(coverLetterStaleInput(JOB, { fullMd: 'CHANGED' } as never, 'en', 'de')).not.toBe(base);
    expect(
      coverLetterStaleInput({ id: 7, jdText: 'OTHER JD' } as never, PROFILE, 'en', 'de'),
    ).not.toBe(base);
  });
});

describe('decideCvAction', () => {
  let staleCalls: number;
  const stale = (answer: boolean) => () => {
    staleCalls += 1;
    return Promise.resolve(answer);
  };

  beforeEach(() => {
    staleCalls = 0;
  });

  it('creates a missing CV when a tailoring pass produced a source', async () => {
    const action = await decideCvAction({
      linked: false,
      tailoredMd: 'TAILORED',
      regenerateStale: true,
      isStale: stale(true),
    });

    expect(action).toBe('create');
  });

  it('generates nothing when there is no tailored source to build from', async () => {
    const action = await decideCvAction({
      linked: false,
      tailoredMd: '',
      regenerateStale: true,
      isStale: stale(true),
    });

    expect(action).toBe('keep');
  });

  it('leaves a linked CV alone when the caller did not ask to refresh stale ones', async () => {
    const action = await decideCvAction({
      linked: true,
      tailoredMd: 'TAILORED',
      regenerateStale: false,
      isStale: stale(true),
    });

    expect(action).toBe('keep');
    expect(staleCalls).toBe(0);
  });

  it('rebuilds a linked CV that no longer matches the tailoring', async () => {
    const action = await decideCvAction({
      linked: true,
      tailoredMd: 'TAILORED',
      regenerateStale: true,
      isStale: stale(true),
    });

    expect(action).toBe('regenerate');
  });

  it('leaves a linked CV that still matches', async () => {
    const action = await decideCvAction({
      linked: true,
      tailoredMd: 'TAILORED',
      regenerateStale: true,
      isStale: stale(false),
    });

    expect(action).toBe('keep');
  });

  it('does not pay for the staleness check when it cannot change the answer', async () => {
    await decideCvAction({
      linked: false,
      tailoredMd: '',
      regenerateStale: true,
      isStale: stale(true),
    });
    await decideCvAction({
      linked: true,
      tailoredMd: '',
      regenerateStale: true,
      isStale: stale(true),
    });

    // The check costs a hash and a database read. Both cases are decided by
    // the arguments alone.
    expect(staleCalls).toBe(0);
  });
});

describe('decideCoverLetterAction', () => {
  let staleCalls: number;
  const stale = (answer: boolean) => () => {
    staleCalls += 1;
    return Promise.resolve(answer);
  };

  beforeEach(() => {
    staleCalls = 0;
  });

  it('never creates a missing cover letter - a skipped document stays skipped (B12)', async () => {
    const action = await decideCoverLetterAction({
      linked: false,
      regenerateStale: false,
      isStale: stale(false),
    });

    expect(action).toBe('keep');
    expect(staleCalls).toBe(0);
  });

  it('does not generate one even when the caller asked to refresh stale documents', async () => {
    const action = await decideCoverLetterAction({
      linked: false,
      regenerateStale: true,
      isStale: stale(false),
    });

    expect(action).toBe('keep');
    expect(staleCalls).toBe(0);
  });

  it('rebuilds a linked letter built from a different profile or job description', async () => {
    expect(
      await decideCoverLetterAction({
        linked: true,
        regenerateStale: true,
        isStale: stale(true),
      }),
    ).toBe('regenerate');
  });

  it('leaves a linked letter that still matches', async () => {
    expect(
      await decideCoverLetterAction({
        linked: true,
        regenerateStale: true,
        isStale: stale(false),
      }),
    ).toBe('keep');
  });

  it('leaves a linked letter alone when refreshing was not asked for', async () => {
    expect(
      await decideCoverLetterAction({
        linked: true,
        regenerateStale: false,
        isStale: stale(true),
      }),
    ).toBe('keep');
    expect(staleCalls).toBe(0);
  });
});
