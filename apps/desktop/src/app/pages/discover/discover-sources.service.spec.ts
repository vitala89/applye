import { TestBed } from '@angular/core/testing';
import { DiscoverSource } from '@applye/core';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../core/toast/toast.service';
import { DiscoverSourcesService, formatScanTime } from './discover-sources.service';

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
  const toast = { success: jest.fn(), error: jest.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      DiscoverSourcesService,
      { provide: DbService, useValue: db },
      { provide: ToastService, useValue: toast },
      { provide: TranslateService, useValue: { t: () => (k: string) => k } },
    ],
  });
  return { svc: TestBed.inject(DiscoverSourcesService), db, toast };
}

describe('DiscoverSourcesService', () => {
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
  /// lands. That optimism is the reason this list is owned by a service rather
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
    await pending;
    expect(svc.all()[0].isEnabled).toBe(false);
  });

  /// A failed write must put the row back rather than leave the user looking at
  /// a switch that says something the database does not.
  it('reloads when the write fails, so the row cannot lie', async () => {
    const { svc, db, toast } = setup([source({ id: 1, isEnabled: true })]);
    await svc.reload();
    db.setSourceEnabled.mockRejectedValue(new Error('locked'));

    await svc.setEnabled(svc.all()[0]);

    expect(db.listSources).toHaveBeenCalledTimes(2);
    expect(svc.all()[0].isEnabled).toBe(true);
    expect(toast.error).toHaveBeenCalled();
  });

  it('names an unnamed RSS feed after its host, and refuses one with no url', async () => {
    const { svc, db } = setup();

    await expect(svc.addRss('https://jobs.example.com/feed.xml', '  ')).resolves.toBe(true);
    expect(db.addSource).toHaveBeenCalledWith({
      name: 'jobs.example.com',
      sourceType: 'rss',
      url: 'https://jobs.example.com/feed.xml',
    });

    db.addSource.mockClear();
    await expect(svc.addRss('   ', 'Named')).resolves.toBe(false);
    expect(db.addSource).not.toHaveBeenCalled();
  });

  it('builds a board row from its provider and slug', async () => {
    const { svc, db } = setup();

    await expect(svc.addBoard('ats_lever', '  Acme  ')).resolves.toBe(true);
    expect(db.addSource).toHaveBeenCalledWith({
      name: 'LEVER:ACME',
      sourceType: 'ats_lever',
      slug: 'acme',
    });
  });

  /// The caller clears its form only on a real success, so a failed write must
  /// not read as one.
  it('reports a failed add rather than swallowing it', async () => {
    const { svc, db, toast } = setup();
    db.addSource.mockRejectedValue(new Error('offline'));

    await expect(svc.addBoard('ats_ashby', 'acme')).resolves.toBe(false);
    expect(toast.error).toHaveBeenCalled();
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
