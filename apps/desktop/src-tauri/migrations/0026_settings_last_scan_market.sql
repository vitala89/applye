-- Records the local market (raw settings.market value) that the most recent
-- Discover scan ran under, so the Discover feed can tell the user when their
-- current market no longer matches the results on screen. NULL until the first
-- scan. Additive, no backfill needed.
ALTER TABLE settings ADD COLUMN last_scan_market TEXT;
