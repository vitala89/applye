import { TestBed } from '@angular/core/testing';
import type { AnalyticsApplication, AnalyticsFacts } from '@applye/core';
import { DbService, DocumentsGateway } from '@applye/data';
import { AnalyticsStore } from './analytics.store';

const app = (over: Partial<AnalyticsApplication> = {}): AnalyticsApplication =>
  ({ id: 1, appliedAt: '2026-08-01', status: 'applied', ...over }) as AnalyticsApplication;

const facts = (over: Partial<AnalyticsFacts> = {}): AnalyticsFacts => ({
  applications: [],
  followups: [],
  ...over,
});

function createStore(getAnalyticsFacts: jest.Mock) {
  const db = { getAnalyticsFacts };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      AnalyticsStore,
      { provide: DbService, useValue: db },
      { provide: DocumentsGateway, useValue: db },
    ],
  });
  return { store: TestBed.inject(AnalyticsStore), db };
}

describe('AnalyticsStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('has no view before anything is loaded', () => {
    const { store } = createStore(jest.fn().mockResolvedValue(facts()));

    expect(store.view()).toBeNull();
    expect(store.state()).toBe('empty');
    expect(store.loading()).toBe(true);
  });

  it('derives the view from the facts it loaded', async () => {
    const { store } = createStore(
      jest.fn().mockResolvedValue(facts({ applications: [app(), app({ id: 2 })] })),
    );

    expect(await store.load()).toBe(true);
    expect(store.view()).not.toBeNull();
    expect(store.loading()).toBe(false);
    expect(store.error()).toBe('');
  });

  /**
   * A blank page is the wrong answer to a failed read - the page should say
   * the same thing it says when there is genuinely nothing, and the toast is
   * what carries the failure. So the facts are installed empty rather than
   * left null.
   */
  it('installs empty facts and records the failure when the read fails', async () => {
    const { store } = createStore(jest.fn().mockRejectedValue(new Error('db is gone')));

    expect(await store.load()).toBe(false);
    expect(store.error()).toContain('db is gone');
    expect(store.facts()).toEqual({ applications: [], followups: [] });
    expect(store.state()).toBe('empty');
    expect(store.loading()).toBe(false);
  });

  it('clears a previous error on the next successful read', async () => {
    const { store } = createStore(
      jest
        .fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValueOnce(facts({ applications: [app()] })),
    );

    await store.load();
    expect(store.error()).not.toBe('');

    await store.load();
    expect(store.error()).toBe('');
  });

  describe('the period', () => {
    it('starts at 90d', () => {
      const { store } = createStore(jest.fn().mockResolvedValue(facts()));

      expect(store.period()).toBe('90d');
    });

    it('recomputes the view without reading the database again', async () => {
      const { store, db } = createStore(
        jest.fn().mockResolvedValue(facts({ applications: [app()] })),
      );
      await store.load();
      const before = store.view();

      store.setPeriod('30d');

      expect(db.getAnalyticsFacts).toHaveBeenCalledTimes(1);
      expect(store.view()).not.toBe(before);
    });

    /**
     * `now` is stamped at load rather than read inside the view, so switching
     * period cannot quietly move the window boundary underneath the
     * comparison. This is the assertion that would fail if it went back to
     * `new Date()` inside the computed.
     */
    it('does not re-date the window when the period changes', async () => {
      const { store } = createStore(jest.fn().mockResolvedValue(facts({ applications: [app()] })));
      await store.load();
      const stamped = store.now();

      store.setPeriod('30d');
      store.setPeriod('all');

      expect(store.now()).toBe(stamped);
    });

    it('re-stamps now on the next load', async () => {
      const { store } = createStore(jest.fn().mockResolvedValue(facts()));
      await store.load();
      const first = store.now();
      jest.spyOn(Date, 'now').mockReturnValue(first + 60_000);

      await store.load();

      expect(store.now()).toBe(first + 60_000);
      jest.restoreAllMocks();
    });
  });
});
