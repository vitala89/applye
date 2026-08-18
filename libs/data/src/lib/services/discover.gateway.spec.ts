import { TestBed } from '@angular/core/testing';
import { invoke } from '@tauri-apps/api/core';

import { DiscoverGateway } from './discover.gateway';

jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn(async () => null) }));

/**
 * The command strings and argument shapes, for the reason `drafts.gateway.spec.ts`
 * states: every consumer stubs the gateway, so a method invoking the wrong Rust
 * command leaves the whole suite green and fails only in the running app.
 *
 * Two things here are specific to Discover and are the ones worth having.
 * `addSource` passes its input object **as the argument map itself** rather than
 * wrapped under a key, which is the opposite of every save method in
 * `DraftsGateway` - so a well-meaning "make it consistent" edit would break it
 * silently. And `discoverDismiss` has a **default argument**: called with one
 * argument it must still send `dismissed: true`, because restoring an item is
 * the same command with `false`.
 */
describe('DiscoverGateway', () => {
  let gateway: DiscoverGateway;

  beforeEach(() => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    (invoke as jest.Mock).mockClear();
    TestBed.configureTestingModule({ providers: [DiscoverGateway] });
    gateway = TestBed.inject(DiscoverGateway);
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('runs a scan and reads the feed with no arguments', async () => {
    await gateway.discoverScan();
    expect(invoke).toHaveBeenCalledWith('discover_scan', undefined);
    await gateway.discoverFeed();
    expect(invoke).toHaveBeenCalledWith('db_discover_feed', undefined);
  });

  it('dismisses by default and restores explicitly', async () => {
    await gateway.discoverDismiss(4);
    expect(invoke).toHaveBeenCalledWith('db_discover_dismiss', { jobId: 4, dismissed: true });
    await gateway.discoverDismiss(4, false);
    expect(invoke).toHaveBeenCalledWith('db_discover_dismiss', { jobId: 4, dismissed: false });
  });

  it('clears the feed with no arguments', async () => {
    await gateway.discoverClear();
    expect(invoke).toHaveBeenCalledWith('db_discover_clear', undefined);
  });

  it('lists sources and toggles one by id', async () => {
    await gateway.listSources();
    expect(invoke).toHaveBeenCalledWith('db_list_sources', undefined);
    await gateway.setSourceEnabled(9, false);
    expect(invoke).toHaveBeenCalledWith('db_set_source_enabled', { sourceId: 9, enabled: false });
  });

  it('plans and applies a market change with both id lists', async () => {
    await gateway.marketSourcePlan(['de', 'pl']);
    expect(invoke).toHaveBeenCalledWith('db_market_source_plan', { markets: ['de', 'pl'] });
    await gateway.applyMarketSourcePlan([1, 2], [3]);
    expect(invoke).toHaveBeenCalledWith('db_apply_market_source_plan', {
      enableIds: [1, 2],
      disableIds: [3],
    });
  });

  it('adds a source by spreading its input, not by wrapping it', async () => {
    // The one method in either gateway that does this. Wrapping it under a key
    // to match the save methods elsewhere would type-check and fail at runtime.
    const input = { name: 'Example', sourceType: 'rss' as const, url: 'https://example.com/f' };
    await gateway.addSource(input);
    expect(invoke).toHaveBeenCalledWith('db_add_source', input);
  });

  it('removes a source by id', async () => {
    await gateway.removeSource(9);
    expect(invoke).toHaveBeenCalledWith('db_remove_source', { sourceId: 9 });
  });

  it('sends ten distinct commands, one per method', async () => {
    // Counted rather than listed: two methods sharing a string passes every
    // assertion above. Same check as `DraftsGateway`'s.
    await gateway.discoverScan();
    await gateway.discoverFeed();
    await gateway.discoverDismiss(1);
    await gateway.discoverClear();
    await gateway.listSources();
    await gateway.setSourceEnabled(1, true);
    await gateway.marketSourcePlan([]);
    await gateway.applyMarketSourcePlan([], []);
    await gateway.addSource({ name: 'n', sourceType: 'rss', url: 'u' });
    await gateway.removeSource(1);
    const commands = (invoke as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(new Set(commands).size).toBe(10);
  });
});
