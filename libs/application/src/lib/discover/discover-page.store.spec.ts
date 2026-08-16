import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TranslateService } from '@applye/i18n';
import { DiscoverDetailStore } from './discover-detail.store';
import { type FeedRow, DiscoverFeedStore } from './discover-feed.store';
import { DiscoverPageStore } from './discover-page.store';
import { DiscoverProfileContextStore } from './discover-profile-context.store';
import { DiscoverRowMatchStore } from './discover-row-match.store';
import { DiscoverScanStore } from './discover-scan.store';
import { DiscoverSourcesStore } from './discover-sources.store';
import { ToastService } from '../shell/toast.service';

describe('DiscoverPageStore', () => {
  let store: DiscoverPageStore;
  let rows: ReturnType<typeof signal<FeedRow[]>>;
  let sources: ReturnType<typeof signal<Record<string, unknown>[]>>;
  let scanning: ReturnType<typeof signal<boolean>>;
  let expanded: ReturnType<typeof signal<boolean>>;
  let everScanned: ReturnType<typeof signal<boolean>>;
  let hasClearableJobs: ReturnType<typeof signal<boolean>>;
  let marketChanged: ReturnType<typeof signal<boolean>>;
  let clearResult: { removed: number } | { error: string };
  let calls: string[];

  function row(id: number, over: Partial<FeedRow> = {}): FeedRow {
    return {
      id,
      title: 't',
      company: 'c',
      source: 'RemoteOK',
      dismissed: false,
      ...over,
    } as FeedRow;
  }

  function source(over: Record<string, unknown> = {}) {
    return { isEnabled: true, lastScanAt: '2026-08-16 10:00:00', lastScanJson: null, ...over };
  }

  beforeEach(() => {
    rows = signal<FeedRow[]>([]);
    sources = signal<Record<string, unknown>[]>([]);
    scanning = signal(false);
    expanded = signal(false);
    everScanned = signal(false);
    hasClearableJobs = signal(true);
    marketChanged = signal(false);
    clearResult = { removed: 3 };
    calls = [];

    TestBed.configureTestingModule({
      providers: [
        DiscoverPageStore,
        {
          provide: DiscoverFeedStore,
          useValue: {
            rows,
            hasClearableJobs,
            clear: () => {
              calls.push('clear');
              return Promise.resolve(clearResult);
            },
          },
        },
        { provide: DiscoverSourcesStore, useValue: { all: sources, everScanned } },
        { provide: DiscoverScanStore, useValue: { scanning, expanded } },
        {
          provide: DiscoverDetailStore,
          useValue: {
            open: (id: number) => calls.push(`open:${id}`),
            close: () => calls.push('close'),
          },
        },
        {
          provide: DiscoverProfileContextStore,
          useValue: { keywords: signal(['angular']), marketChangedSinceScan: marketChanged },
        },
        { provide: DiscoverRowMatchStore, useValue: { badgeFor: () => null } },
        {
          provide: ToastService,
          useValue: {
            error: (m: string) => calls.push(`toast.error:${m}`),
            success: (m: string) => calls.push(`toast.success:${m}`),
          },
        },
        { provide: TranslateService, useValue: { t: signal((k: string) => k) } },
      ],
    });
    store = TestBed.inject(DiscoverPageStore);
  });

  describe('view', () => {
    // The order matters: each branch is only reachable because the ones above
    // it did not fire, and the screen has one state at a time.
    it('is the skeleton until the first load settles, whatever else is true', () => {
      rows.set([row(1)]);

      expect(store.view()).toBe('skeleton');
    });

    it('is scanning while a scan runs', () => {
      store.loading.set(false);
      scanning.set(true);

      expect(store.view()).toBe('scanning');
    });

    it('is the first-run state with no source enabled and nothing to show', () => {
      store.loading.set(false);
      sources.set([source({ isEnabled: false, lastScanAt: null })]);

      expect(store.view()).toBe('first');
    });

    it('is "never" once a source is enabled but has never been scanned', () => {
      store.loading.set(false);
      sources.set([source({ lastScanAt: null })]);

      expect(store.view()).toBe('never');
    });

    it('is "caught up" when a scan has run and every row is dismissed', () => {
      store.loading.set(false);
      sources.set([source()]);
      rows.set([row(1, { dismissed: true })]);

      expect(store.view()).toBe('caughtup');
    });

    it('is the feed once an undismissed row exists', () => {
      store.loading.set(false);
      sources.set([source()]);
      rows.set([row(1)]);

      expect(store.view()).toBe('feed');
    });
  });

  describe('what the strip and console show', () => {
    beforeEach(() => {
      store.loading.set(false);
      sources.set([source()]);
      rows.set([row(1)]);
      everScanned.set(true);
    });

    it('hides the header before the first scan and while the skeleton shows', () => {
      expect(store.showHeader()).toBe(true);

      store.loading.set(true);

      expect(store.showHeader()).toBe(false);
    });

    it('shows the strip only once something has been scanned', () => {
      expect(store.showStrip()).toBe(true);

      everScanned.set(false);

      expect(store.showStrip()).toBe(false);
    });

    it('shows the console while scanning, or when the user expanded it', () => {
      expect(store.showConsole()).toBe(false);

      expanded.set(true);

      expect(store.showConsole()).toBe(true);
    });
  });

  describe('the last scan summary', () => {
    it('adds up the per-source counts, and ignores a row it cannot parse', () => {
      sources.set([
        source({ lastScanJson: JSON.stringify({ newJobs: 4, filteredOut: 1 }) }),
        source({ lastScanJson: '{not json' }),
        source({ lastScanJson: JSON.stringify({ newJobs: 2, filteredOut: 5 }) }),
      ]);

      expect(store.newCount()).toBe(6);
      expect(store.filteredCount()).toBe(6);
    });

    it('reports no time before anything has been scanned', () => {
      sources.set([source({ lastScanAt: null })]);

      expect(store.lastScanLabel()).toBe('');
    });

    it('lists the distinct sources present in the feed, sorted', () => {
      rows.set([row(1, { source: 'RemoteOK' }), row(2, { source: 'Arbeitnow' }), row(3)]);

      expect(store.sourceOptions()).toEqual(['Arbeitnow', 'RemoteOK']);
    });
  });

  describe('the rescan banner', () => {
    it('shows on a market change, hides on dismissal, and returns after a rescan', () => {
      marketChanged.set(true);

      expect(store.marketChangedSinceScan()).toBe(true);

      store.dismissRescanBanner();

      expect(store.marketChangedSinceScan()).toBe(false);

      // Dismissal is about one mismatch, not about the banner as a feature.
      store.rearmRescanBanner();

      expect(store.marketChangedSinceScan()).toBe(true);
    });
  });

  describe('clearing the feed', () => {
    it('does not open the confirm when there is nothing to clear', () => {
      hasClearableJobs.set(false);

      store.askClearFeed();

      expect(store.clearConfirm()).toBe(false);
    });

    it('clears, closes the confirm and reports the count', async () => {
      store.askClearFeed();

      await store.confirmClearFeed();

      expect(calls).toEqual(['clear', 'toast.success:discover.clear_done']);
      expect(store.clearConfirm()).toBe(false);
      expect(store.clearing()).toBe(false);
    });

    // A failed clear must leave the confirm open: closing it would look like the
    // destructive action had succeeded.
    it('reports a failure and leaves the confirm open', async () => {
      clearResult = { error: 'database is locked' };
      store.askClearFeed();

      await store.confirmClearFeed();

      expect(calls).toEqual(['clear', 'toast.error:database is locked']);
      expect(store.clearConfirm()).toBe(true);
    });

    it('ignores a second confirm while one is in flight, and a cancel during it', async () => {
      store.clearing.set(true);

      await store.confirmClearFeed();
      store.cancelClearFeed();

      expect(calls).toEqual([]);
      expect(store.clearConfirm()).toBe(false);
    });
  });

  describe('the detail screen', () => {
    it('opens for a live row and closes again', () => {
      store.openDetail(row(7));
      store.closeDetail();

      expect(calls).toEqual(['open:7', 'close']);
    });

    // A dismissed row is struck through in the feed; clicking it should do
    // nothing rather than open a job the user has already discarded.
    it('does not open a dismissed row', () => {
      store.openDetail(row(7, { dismissed: true }));

      expect(calls).toEqual([]);
    });
  });
});
