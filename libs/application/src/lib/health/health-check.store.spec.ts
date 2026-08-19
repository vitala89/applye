import { TestBed } from '@angular/core/testing';
import { DocumentsGateway, JobsGateway, SystemGateway } from '@applye/data';
import { HealthCheckStore } from './health-check.store';

function createStore(over: Partial<Record<string, jest.Mock>> = {}) {
  const db = {
    healthCheck: jest.fn().mockResolvedValue({
      items: [{ key: 'db', label: 'Database', status: 'ok', detail: '28 migrations' }],
    }),
    ...over,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      HealthCheckStore,
      { provide: JobsGateway, useValue: db },
      { provide: DocumentsGateway, useValue: db },
      { provide: SystemGateway, useValue: db },
    ],
  });
  return { store: TestBed.inject(HealthCheckStore), db };
}

describe('HealthCheckStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts loading, so the panel renders its skeleton rather than an empty list', () => {
    const { store } = createStore();
    expect(store.loading()).toBe(true);
    expect(store.items()).toEqual([]);
  });

  it('reports what the check returned and stops loading', async () => {
    const { store } = createStore();
    await store.run('Health');
    expect(store.loading()).toBe(false);
    expect(store.items()).toHaveLength(1);
    expect(store.items()[0].status).toBe('ok');
  });

  /**
   * A check that cannot answer has told the user something true, so the failure
   * is a `fail` row rather than an error state - and the row carries the
   * caller's label, because this layer holds no translations.
   */
  it('turns a failed check into a fail row instead of rejecting', async () => {
    const { store } = createStore({
      healthCheck: jest.fn().mockRejectedValue(new Error('no database')),
    });
    await expect(store.run('Health')).resolves.toBeUndefined();
    expect(store.loading()).toBe(false);
    expect(store.items()).toEqual([
      { key: 'error', label: 'Health', status: 'fail', detail: 'Error: no database' },
    ]);
  });

  it('clears a previous failure when a rerun succeeds', async () => {
    const healthCheck = jest
      .fn()
      .mockRejectedValueOnce(new Error('no database'))
      .mockResolvedValueOnce({ items: [] });
    const { store } = createStore({ healthCheck });
    await store.run('Health');
    await store.run('Health');
    expect(store.items()).toEqual([]);
  });
});
