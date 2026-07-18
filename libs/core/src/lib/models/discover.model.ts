// Discover scan engine (ROADMAP §11): deterministic Tier-2/Tier-3 collection.
// Shapes mirror the Rust structs in src-tauri commands/discover.rs.

/** Per-source outcome of one scan run. */
export interface ScanSourceResult {
  sourceId: number;
  sourceName: string;
  fetched: number;
  filteredOut: number;
  duplicates: number;
  newJobs: number;
  error: string | null;
}

/** Whole-scan summary returned by discover_scan. */
export interface ScanSummary {
  sources: ScanSourceResult[];
  totalFetched: number;
  totalNew: number;
  durationMs: number;
}

/** One non-dismissed scanned job in the Discover feed. */
export interface DiscoverFeedItem {
  id: number;
  company: string | null;
  title: string | null;
  location: string | null;
  source: string | null;
  createdAt: string | null;
  /** NULL when the item is listed for the first time - the UI's NEW marker. */
  discoverShownAt: string | null;
}

/** A scannable source row as listed for the Sources drawer. */
export interface DiscoverSource {
  id: number;
  name: string | null;
  type: string | null;
  url: string | null;
  slug: string | null;
  isBuiltin: boolean;
  isEnabled: boolean;
  geoTagsJson: string | null;
  legalityNote: string | null;
  lastScanAt: string | null;
  /** The last ScanSourceResult for this source, JSON-encoded. */
  lastScanJson: string | null;
}
