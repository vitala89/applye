import { TestBed } from '@angular/core/testing';
import { DiscoverSource } from '@applye/core';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { DiscoverSourcesStore, formatScanTime } from './discover-sources.store';

function source(over: Partial<DiscoverSource> = {}): DiscoverSource {
  return {
    id: 1,
    name: 'WWR',
    type: 'rss',
    isEnabled: true,
    isBuiltin: true,
    lastScanAt: null,
    lastScanJson: null,
    ...over,
  } as DiscoverSource;
}

function setup(rows: DiscoverSource[] = []) {
  const db = {
    listSources: jest.fn(async () => rows),
    setSourceEnabled: jest.fn(async () => undefined),
    addSource: jest.fn(async () => undefined),
    removeSource: jest.fn(async () => undefined),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      DiscoverSourcesStore,
      { provide: DbService, useValue: db },
      { provide: TranslateService, useValue: { t: () => (k: string) => k } },
    ],
  });
  return { svc: TestBed.inject(DiscoverSourcesStore), db };
}

describe('DiscoverSourcesStore', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('groups sources the three ways the drawer lists them', async () => {
    const { svc } = setup([
      { ...source(), id: 1, isBuiltin: true },
      { ...source(), id: 2, isBuiltin: false, type: 'ats_lever' },
      { ...source(), id: 3, isBuiltin: false, type: 'rss' },
    ]);
    await svc.reload();

    expect(svc.builtin().map((s) => s.id)).toEqual([1]);
    expect(svc.companyBoards().map((s) => s.id)).toEqual([2]);
    expect(svc.user().map((s) => s.id)).toEqual([3]);
    expect(svc.total()).toBe(3);
  });

  /// The checkbox must not lag the click, so the row flips before the write
  /// lands. That optimism is the reason this list is owned by a store rather
  /// than passed down and evented back up.
  it('flips a source before the write lands', async () => {
    const { svc, db } = setup([source({ id: 1, isEnabled: true })]);
    await svc.reload();

    let resolveWrite = (): void => undefined;
    db.setSourceEnabled.mockImplementation(
      () => new Promise<undefined>((r) => (resolveWrite = () => r(undefined))),
    );

    const pending = svc.setEnabled(svc.all()[0]);
    expect(svc.all()[0].isEnabled).toBe(false);
    expect(svc.enabledCount()).toBe(0);

    resolveWrite();
    await expect(pending).resolves.toEqual({ ok: true });
    expect(svc.all()[0].isEnabled).toBe(false);
  });

  /// A failed write must put the row back rather than leave the user looking at
  /// a switch that says something the database does not. The error text is
  /// returned, never toasted: telling the user is the drawer's job.
  it('reloads when the write fails, so the row cannot lie', async () => {
    const { svc, db } = setup([source({ id: 1, isEnabled: true })]);
    await svc.reload();
    db.setSourceEnabled.mockRejectedValue(new Error('locked'));

    const result = await svc.setEnabled(svc.all()[0]);

    expect(db.listSources).toHaveBeenCalledTimes(2);
    expect(svc.all()[0].isEnabled).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('locked');
  });

  it('names an unnamed RSS feed after its host, and refuses one with no url', async () => {
    const { svc, db } = setup();

    await expect(svc.addRss('https://jobs.example.com/feed.xml', '  ')).resolves.toEqual({
      ok: true,
    });
    expect(db.addSource).toHaveBeenCalledWith({
      name: 'jobs.example.com',
      sourceType: 'rss',
      url: 'https://jobs.example.com/feed.xml',
    });

    db.addSource.mockClear();
    await expect(svc.addRss('   ', 'Named')).resolves.toEqual({ ok: false });
    expect(db.addSource).not.toHaveBeenCalled();
  });

  it('builds a board row from its provider and slug', async () => {
    const { svc, db } = setup();

    await expect(svc.addBoard('ats_lever', '  Acme  ')).resolves.toEqual({ ok: true });
    expect(db.addSource).toHaveBeenCalledWith({
      name: 'LEVER:ACME',
      sourceType: 'ats_lever',
      slug: 'acme',
    });
  });

  /// The caller clears its form only on a real success, so a failed write must
  /// not read as one.
  it('reports a failed add rather than swallowing it', async () => {
    const { svc, db } = setup();
    db.addSource.mockRejectedValue(new Error('offline'));

    const result = await svc.addBoard('ats_ashby', 'acme');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('offline');
  });

  /// Refused-for-empty-input and failed are different outcomes, and the drawer
  /// tells them apart by whether there is an error to show: an empty form is not
  /// something to announce.
  it('distinguishes a refused write from a failed one', async () => {
    const { svc } = setup();

    expect(await svc.addBoard('ats_lever', '   ')).toEqual({ ok: false });
    expect(await svc.addRss('  ', '  ')).toEqual({ ok: false });
  });

  it('reports removal, and reads the list back after it', async () => {
    const { svc, db } = setup([source({ id: 7 })]);
    await svc.reload();

    await expect(svc.remove(svc.all()[0])).resolves.toEqual({ ok: true });
    expect(db.removeSource).toHaveBeenCalledWith(7);
    expect(db.listSources).toHaveBeenCalledTimes(2);

    db.removeSource.mockRejectedValue(new Error('busy'));
    const failed = await svc.remove(source({ id: 7 }));
    expect(failed.ok).toBe(false);
    expect(failed.error).toContain('busy');
  });

  describe('resultLine', () => {
    it('reads a disabled source as idle and an unscanned one as never scanned', () => {
      const { svc } = setup();
      expect(svc.resultLine(source({ isEnabled: false })).text).toBe('discover.idle_off');
      expect(svc.resultLine(source({ isEnabled: true })).text).toBe('discover.never_scanned_short');
    });

    it('marks a source whose last scan carried an error, which is what failing counts', async () => {
      const { svc } = setup([
        source({
          id: 1,
          lastScanAt: '2026-08-04 09:00:00',
          lastScanJson: JSON.stringify({ newJobs: 0, error: 'timeout' }),
        }),
      ]);
      await svc.reload();

      expect(svc.resultLine(svc.all()[0]).error).toBe(true);
      expect(svc.failing()).toBe(1);
    });

    /// `lastScanJson` is written by the scan and read back here; a truncated or
    /// hand-edited row must not throw in a template binding.
    it('treats unreadable scan json as never scanned', () => {
      const { svc } = setup();
      const row = source({ lastScanAt: '2026-08-04 09:00:00', lastScanJson: '{not json' });
      expect(svc.resultLine(row).text).toBe('discover.never_scanned_short');
    });
  });
});

describe('formatScanTime', () => {
  it('reads a SQLite UTC stamp as a clock time', () => {
    expect(formatScanTime('2026-08-04 09:30:00')).toMatch(/\d{2}:\d{2}/);
  });

  it('returns nothing for a stamp it cannot read, rather than "Invalid Date"', () => {
    expect(formatScanTime('not a date')).toBe('');
  });
});
