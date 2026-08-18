import { Injectable } from '@angular/core';
import { DiscoverFeedItem, DiscoverSource, MarketSourcePlan, ScanSummary } from '@applye/core';
import { tauriInvoke } from '../tauri.invoke';

/**
 * The Discover scan engine: running a scan, reading and pruning the feed, and
 * the sources the scan runs against.
 *
 * **The second per-domain gateway** cut out of `db.service.ts` - see
 * `CODE_QUALITY.md` for the migration and `DraftsGateway` for the pattern. A
 * method still on `DbService` means its domain has not moved yet, never that it
 * belongs there.
 *
 * **Discover went second on churn, not on size.** The order was re-judged when
 * the two turned out to be almost uncorrelated: profile and settings is seven
 * methods and sixty-eight files, while this is ten methods and eleven. The
 * point of going smallest-first is a reviewable diff, and that is measured in
 * files touched.
 *
 * **Six application methods were sitting under the Discover banner** with none
 * of their own - `upsertApplication` through `listApplicationComments`. They
 * are not Discover's and did not travel with it; they go to the jobs gateway,
 * and `db.service.ts` now has the banner it was missing.
 */
@Injectable({ providedIn: 'root' })
export class DiscoverGateway {
  /** Scan every enabled source: fetch, title/geo filter, dedupe. 0 tokens. */
  async discoverScan(): Promise<ScanSummary> {
    return tauriInvoke<ScanSummary>('discover_scan');
  }

  /** Non-dismissed scanned jobs, newest first. Marks unseen items as shown. */
  async discoverFeed(): Promise<DiscoverFeedItem[]> {
    return tauriInvoke<DiscoverFeedItem[]>('db_discover_feed');
  }

  /** Dismiss a scanned job, or restore it (inline Undo) with dismissed=false. */
  async discoverDismiss(jobId: number, dismissed = true): Promise<void> {
    return tauriInvoke<void>('db_discover_dismiss', { jobId, dismissed });
  }

  /** Clear the inbox: delete unsaved scanned jobs. Returns how many were removed. */
  async discoverClear(): Promise<number> {
    return tauriInvoke<number>('db_discover_clear');
  }

  async listSources(): Promise<DiscoverSource[]> {
    return tauriInvoke<DiscoverSource[]>('db_list_sources');
  }

  async setSourceEnabled(sourceId: number, enabled: boolean): Promise<void> {
    return tauriInvoke<void>('db_set_source_enabled', { sourceId, enabled });
  }

  /** What changing the local market would do to built-in sources. Read-only. */
  async marketSourcePlan(markets: string[]): Promise<MarketSourcePlan> {
    return tauriInvoke<MarketSourcePlan>('db_market_source_plan', { markets });
  }

  /** Applies exactly the ids the user confirmed, in one transaction. */
  async applyMarketSourcePlan(enableIds: number[], disableIds: number[]): Promise<void> {
    return tauriInvoke<void>('db_apply_market_source_plan', { enableIds, disableIds });
  }

  /** Add a user source: RSS feed (https url) or ATS board (type + slug). */
  async addSource(input: {
    name: string;
    sourceType: 'rss' | 'ats_greenhouse' | 'ats_lever' | 'ats_ashby' | 'ats_personio';
    url?: string;
    slug?: string;
  }): Promise<number> {
    return tauriInvoke<number>('db_add_source', input);
  }

  /** Remove a user-added source (builtin sources can only be disabled). */
  async removeSource(sourceId: number): Promise<void> {
    return tauriInvoke<void>('db_remove_source', { sourceId });
  }
}
