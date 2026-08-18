import { TestBed } from '@angular/core/testing';
import type { ScanSummary } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { DiscoverGateway } from '@applye/data';
import { DiscoverScanStore } from './discover-scan.store';

const SUMMARY: ScanSummary = {
  sources: [
    { sourceName: 'Remote OK', fetched: 12, filteredOut: 9, newJobs: 3, error: null },
    { sourceName: 'We Work Remotely', fetched: 4, filteredOut: 4, newJobs: 0, error: null },
  ],
  totalFetched: 16,
  totalNew: 3,
  durationMs: 2500,
};

function createStore(discoverScan: jest.Mock): DiscoverScanStore {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      DiscoverScanStore,
      TranslateService,
      { provide: DiscoverGateway, useValue: { discoverScan } },
    ],
  });
  return TestBed.inject(DiscoverScanStore);
}

const noop = async (): Promise<void> => undefined;

describe('DiscoverScanStore', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    jest.restoreAllMocks();
  });

  it('starts idle, with a closed and empty console', () => {
    const store = createStore(jest.fn());
    expect(store.scanning()).toBe(false);
    expect(store.expanded()).toBe(false);
    expect(store.lines()).toEqual([]);
  });

  it('opens the console and narrates the sources it was given', async () => {
    const store = createStore(jest.fn().mockResolvedValue(SUMMARY));
    const seen: { scanning: boolean; expanded: boolean; lines: number } = {
      scanning: false,
      expanded: false,
      lines: 0,
    };

    await store.run(['Remote OK', 'We Work Remotely'], async () => {
      seen.scanning = store.scanning();
      seen.expanded = store.expanded();
      seen.lines = store.lines().length;
    });

    expect(seen.scanning).toBe(true);
    expect(seen.expanded).toBe(true);
    expect(seen.lines).toBeGreaterThan(0);
  });

  it('closes the console when the scan is over', async () => {
    const store = createStore(jest.fn().mockResolvedValue(SUMMARY));
    await store.run(['Remote OK'], noop);
    expect(store.scanning()).toBe(false);
    expect(store.expanded()).toBe(false);
    // The lines stay: the strip can reopen the console to show what happened.
    expect(store.lines().length).toBeGreaterThan(0);
  });

  /**
   * The reason the follow-up work is a continuation and not something the
   * caller does after `run` returns. In the version this replaces, reloading
   * the feed happened inside the same `try`, so the console stayed open across
   * it - and `view()` reads `scanning`, so releasing it early would show the
   * old feed for a frame.
   */
  it('is still scanning while the continuation runs', async () => {
    const store = createStore(jest.fn().mockResolvedValue(SUMMARY));
    let scanningDuringFollowUp = false;
    await store.run(['Remote OK'], async () => {
      await Promise.resolve();
      scanningDuringFollowUp = store.scanning();
    });
    expect(scanningDuringFollowUp).toBe(true);
  });

  /**
   * `run` does not resolve until the follow-up work is done. The page awaits it
   * and then decides whether to toast, so a continuation still running would
   * mean reporting an outcome that has not happened yet.
   */
  it('does not resolve until the continuation has finished', async () => {
    const store = createStore(jest.fn().mockResolvedValue(SUMMARY));
    let finished = false;
    await store.run(['Remote OK'], async () => {
      await Promise.resolve();
      await Promise.resolve();
      finished = true;
    });
    expect(finished).toBe(true);
  });

  it('reports the elapsed time the scan actually took', async () => {
    const store = createStore(jest.fn().mockResolvedValue(SUMMARY));
    const clock = jest.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(3_500);
    await store.run(['Remote OK'], noop, clock);
    expect(store.lines().some((l) => l.text.includes('2.5'))).toBe(true);
  });

  describe('when something fails', () => {
    it('reports the scan failure rather than raising it', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const store = createStore(jest.fn().mockRejectedValue(new Error('no network')));

      const error = await store.run(['Remote OK'], noop);

      expect(error).toContain('no network');
      expect(store.scanning()).toBe(false);
      expect(store.expanded()).toBe(false);
    });

    /**
     * The continuation is inside the same `try` on purpose: a scan that found
     * jobs but could not show them has not succeeded from where the user sits.
     */
    it('treats a failing continuation as a failed scan', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const store = createStore(jest.fn().mockResolvedValue(SUMMARY));

      const error = await store.run(['Remote OK'], async () => {
        throw new Error('feed reload failed');
      });

      expect(error).toContain('feed reload failed');
      expect(store.lines().some((l) => l.tone === 'err')).toBe(true);
    });

    it('narrates the failure under the lines already printed', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const store = createStore(jest.fn().mockRejectedValue(new Error('no network')));
      await store.run(['Remote OK'], noop);
      // The started lines are still there; the failure was appended to them.
      expect(store.lines().length).toBeGreaterThan(1);
    });

    /** Silence is a bug report nobody files. */
    it('does not swallow the failure silently', async () => {
      const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const store = createStore(jest.fn().mockRejectedValue(new Error('no network')));
      await store.run(['Remote OK'], noop);
      expect(logged).toHaveBeenCalled();
    });
  });

  /**
   * Two scans would interleave their console lines, so the second is dropped
   * rather than queued - and it must not run the continuation either.
   */
  it('ignores a second scan started while one is running', async () => {
    let release: (v: unknown) => void = () => undefined;
    const discoverScan = jest
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (release = r)))
      .mockResolvedValue(SUMMARY);
    const store = createStore(discoverScan);

    let followUps = 0;
    const first = store.run(['Remote OK'], async () => {
      followUps += 1;
    });
    const second = await store.run(['Remote OK'], async () => {
      followUps += 1;
    });

    expect(second).toBeNull();
    expect(discoverScan).toHaveBeenCalledTimes(1);

    release(SUMMARY);
    await first;
    expect(followUps).toBe(1);
  });

  describe('the console toggle', () => {
    /**
     * Collapsing is a view concern. The button is only offered while no scan is
     * running, but the guarantee is what makes that safe to change later.
     */
    it('does not stop a running scan', async () => {
      const store = createStore(jest.fn().mockResolvedValue(SUMMARY));
      let scanningAfterCollapse = false;
      await store.run(['Remote OK'], async () => {
        store.collapse();
        scanningAfterCollapse = store.scanning();
      });
      expect(scanningAfterCollapse).toBe(true);
    });

    it('collapses and expands without touching the scan', () => {
      const store = createStore(jest.fn());
      store.expand();
      expect(store.expanded()).toBe(true);
      expect(store.scanning()).toBe(false);

      store.collapse();
      expect(store.expanded()).toBe(false);
      expect(store.scanning()).toBe(false);
    });
  });
});
