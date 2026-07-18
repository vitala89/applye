-- Discover scan engine (ROADMAP §11, feat/discover): per-source scan bookkeeping.
-- last_scan_at    - when this source was last scanned (any outcome).
-- last_scan_json  - the last ScanSourceResult as JSON (fetched/filtered/new/error),
--                   shown in the Sources drawer without re-running a scan.
ALTER TABLE sources ADD COLUMN last_scan_at TEXT;
ALTER TABLE sources ADD COLUMN last_scan_json TEXT;
