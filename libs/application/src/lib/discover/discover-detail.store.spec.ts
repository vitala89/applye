import { TestBed } from '@angular/core/testing';
import { DocumentsGateway, JobsGateway } from '@applye/data';
import { DiscoverDetailStore, type DetailContext } from './discover-detail.store';

interface FakeDb {
  getJob: jest.Mock;
}

function createStore(getJob: jest.Mock): { store: DiscoverDetailStore; db: FakeDb } {
  const db: FakeDb = { getJob };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      DiscoverDetailStore,
      { provide: JobsGateway, useValue: db },
      { provide: DocumentsGateway, useValue: db },
    ],
  });
  return { store: TestBed.inject(DiscoverDetailStore), db };
}

function context(over: Partial<DetailContext> = {}): DetailContext {
  return { keywords: ['angular'], fit: null, title: 'Senior Frontend Engineer', ...over };
}

const JD = `About the role
We use Angular and PostgreSQL.
Salary: 90000 EUR per year`;

/** The same posting naming a third skill, which is worth three more points. */
const JD_THREE_SKILLS = `${JD}
We deploy with Docker.`;

describe('DiscoverDetailStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts closed and empty', () => {
    const { store } = createStore(jest.fn());
    expect(store.id()).toBeNull();
    expect(store.blocks()).toBeNull();
    expect(store.skills()).toEqual([]);
    expect(store.score()).toBeNull();
    expect(store.salary()).toBeNull();
    expect(store.verdict()).toBeNull();
  });

  /**
   * `blocks` is the loading signal the template reads: null means the read is
   * in flight, and the skeleton renders. Opening has to set it back to null
   * synchronously, or the previous job's description shows under the new title.
   */
  it('clears the previous job before the read starts', async () => {
    let release: (v: unknown) => void = () => undefined;
    const getJob = jest
      .fn()
      .mockResolvedValueOnce({ jdText: JD })
      .mockImplementationOnce(() => new Promise((r) => (release = r)));
    const { store } = createStore(getJob);

    store.open(1, context());
    await Promise.resolve();
    await Promise.resolve();
    expect(store.blocks()).not.toBeNull();
    expect(store.skills().length).toBeGreaterThan(0);

    store.open(2, context());
    expect(store.id()).toBe(2);
    expect(store.blocks()).toBeNull();
    expect(store.skills()).toEqual([]);
    expect(store.score()).toBeNull();
    expect(store.salary()).toBeNull();
    release({ jdText: '' });
  });

  it('loads the description, what it names, and what it pays', async () => {
    const { store } = createStore(jest.fn().mockResolvedValue({ jdText: JD }));
    store.open(7, context());
    await Promise.resolve();
    await Promise.resolve();

    expect(store.id()).toBe(7);
    expect(store.blocks()?.length).toBeGreaterThan(0);
    expect(store.skills()).toEqual(['Angular', 'PostgreSQL']);
    expect(store.salary()).toContain('90000');
    expect(store.score()).not.toBeNull();
  });

  /**
   * The guard that was already in the page and had to survive the move: a read
   * that lands after the user opened another job must write nothing. Without it
   * one job's score and skills appear under another job's title.
   */
  it('drops a read that lands after the user opened another job', async () => {
    let releaseFirst: (v: unknown) => void = () => undefined;
    const getJob = jest
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (releaseFirst = r)))
      .mockResolvedValueOnce({ jdText: 'Nothing in particular.' });
    const { store } = createStore(getJob);

    store.open(1, context({ title: 'First' }));
    store.open(2, context({ title: 'Second' }));
    await Promise.resolve();
    await Promise.resolve();

    releaseFirst({ jdText: JD });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.id()).toBe(2);
    // The first job named Angular and PostgreSQL; the second named nothing.
    expect(store.skills()).toEqual([]);
  });

  /**
   * The score is computed against what the page knew when the user clicked, not
   * against whatever the page holds when the read returns. That is why the
   * context is an argument.
   */
  it('scores against the context it was opened with', async () => {
    const { store: matched } = createStore(jest.fn().mockResolvedValue({ jdText: JD }));
    matched.open(1, context({ keywords: ['angular', 'postgresql'] }));
    await Promise.resolve();
    await Promise.resolve();

    const { store: unmatched } = createStore(jest.fn().mockResolvedValue({ jdText: JD }));
    unmatched.open(1, context({ keywords: ['kubernetes', 'terraform'] }));
    await Promise.resolve();
    await Promise.resolve();

    expect(matched.score()).toBeGreaterThan(unmatched.score() as number);
  });

  /**
   * The title is scored together with the description, and it is the only place
   * some keywords appear - a posting whose body never repeats its own job title
   * would otherwise score as if the title said nothing.
   */
  it('scores the title as well as the description', async () => {
    const { store: inTitle } = createStore(jest.fn().mockResolvedValue({ jdText: JD }));
    inTitle.open(1, { keywords: ['frontend'], fit: null, title: 'Senior Frontend Engineer' });
    await Promise.resolve();
    await Promise.resolve();

    const { store: nowhere } = createStore(jest.fn().mockResolvedValue({ jdText: JD }));
    nowhere.open(1, { keywords: ['frontend'], fit: null, title: 'Senior Engineer' });
    await Promise.resolve();
    await Promise.resolve();

    expect(inTitle.score()).toBeGreaterThan(nowhere.score() as number);
  });

  it('declines to score a profile with no keywords', async () => {
    const { store } = createStore(jest.fn().mockResolvedValue({ jdText: JD }));
    store.open(1, context({ keywords: [] }));
    await Promise.resolve();
    await Promise.resolve();
    expect(store.score()).toBeNull();
    expect(store.verdict()).toBeNull();
  });

  /**
   * Scored against a keyword the posting does not name, deliberately: with a
   * matching keyword the primary tier pushes the score past 97 and the clamp
   * absorbs part of the boost, so the two tiers differ by 6 rather than 12 and
   * the test would be measuring the ceiling instead of the tier.
   */
  it('reads the archetype tier from the context', async () => {
    const { store: primary } = createStore(jest.fn().mockResolvedValue({ jdText: JD }));
    primary.open(1, context({ fit: 'primary', keywords: ['kubernetes'] }));
    await Promise.resolve();
    await Promise.resolve();

    const { store: adjacent } = createStore(jest.fn().mockResolvedValue({ jdText: JD }));
    adjacent.open(1, context({ fit: 'adjacent', keywords: ['kubernetes'] }));
    await Promise.resolve();
    await Promise.resolve();

    expect((primary.score() as number) - (adjacent.score() as number)).toBe(12);
  });

  /**
   * The three bands the detail screen tints by, driven through real scores
   * rather than by writing the signal - the point is that the band and the
   * score cannot drift apart. With this posting: no keyword matched is 36,
   * one of two is 64, and one of one is 91.
   */
  describe('the verdict', () => {
    async function scoreWith(keywords: string[]): Promise<DiscoverDetailStore> {
      const { store } = createStore(jest.fn().mockResolvedValue({ jdText: JD }));
      store.open(1, context({ keywords }));
      await Promise.resolve();
      await Promise.resolve();
      return store;
    }

    it('reads a fully covered posting as strong', async () => {
      const store = await scoreWith(['angular']);
      expect(store.score()).toBe(91);
      expect(store.verdict()).toBe('strong');
    });

    it('reads a half covered posting as good', async () => {
      const store = await scoreWith(['angular', 'kubernetes']);
      expect(store.score()).toBe(64);
      expect(store.verdict()).toBe('good');
    });

    it('reads an uncovered posting as partial', async () => {
      const store = await scoreWith(['kubernetes']);
      expect(store.score()).toBe(36);
      expect(store.verdict()).toBe('partial');
    });

    /**
     * The strong/good edge, from both sides. Every other case here lands far
     * from 80, so without these two a band boundary could move by a point and
     * nothing would notice.
     */
    it('reads exactly 80 as strong, and 79 as good', async () => {
      // 8 of 10 keywords matched, two skills, no tier: 30 + 44 + 6 = 80.
      const eightOfTen = [
        'about',
        'role',
        'angular',
        'postgresql',
        'salary',
        '90000',
        'eur',
        'year',
        'kubernetes',
        'terraform',
      ];
      const strong = await scoreWith(eightOfTen);
      expect(strong.score()).toBe(80);
      expect(strong.verdict()).toBe('strong');

      // 5 of 10 matched, three skills, primary tier: 30 + 27.5 + 9 + 12 = 78.5.
      const { store: good } = createStore(jest.fn().mockResolvedValue({ jdText: JD_THREE_SKILLS }));
      good.open(1, {
        keywords: [
          'about',
          'role',
          'angular',
          'postgresql',
          'salary',
          'a1',
          'a2',
          'a3',
          'a4',
          'a5',
        ],
        fit: 'primary',
        title: 'Senior Frontend Engineer',
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(good.score()).toBe(79);
      expect(good.verdict()).toBe('good');
    });
  });

  describe('closing', () => {
    it('closes and stops rendering a description', async () => {
      const { store } = createStore(jest.fn().mockResolvedValue({ jdText: JD }));
      store.open(1, context());
      await Promise.resolve();
      await Promise.resolve();

      store.close();
      expect(store.id()).toBeNull();
      expect(store.blocks()).toBeNull();
    });

    it('closes on dismissal only when that job is the one open', async () => {
      const { store } = createStore(jest.fn().mockResolvedValue({ jdText: JD }));
      store.open(1, context());
      await Promise.resolve();

      store.closeIfOpen(2);
      expect(store.id()).toBe(1);

      store.closeIfOpen(1);
      expect(store.id()).toBeNull();
    });
  });

  describe('when the read fails', () => {
    it('shows an empty description rather than an endless skeleton', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const { store } = createStore(jest.fn().mockRejectedValue(new Error('db is gone')));
      store.open(1, context());
      await Promise.resolve();
      await Promise.resolve();

      expect(store.blocks()).toEqual([]);
      expect(store.id()).toBe(1);
    });

    /** A failure arriving after the user moved on must not blank the new job. */
    it('does not blank a job the user opened after the failing one', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      let rejectFirst: (e: unknown) => void = () => undefined;
      const getJob = jest
        .fn()
        .mockImplementationOnce(() => new Promise((_, rej) => (rejectFirst = rej)))
        .mockResolvedValueOnce({ jdText: JD });
      const { store } = createStore(getJob);

      store.open(1, context());
      store.open(2, context());
      await Promise.resolve();
      await Promise.resolve();

      rejectFirst(new Error('db is gone'));
      await Promise.resolve();
      await Promise.resolve();

      expect(store.id()).toBe(2);
      expect(store.blocks()?.length).toBeGreaterThan(0);
    });
  });
});
