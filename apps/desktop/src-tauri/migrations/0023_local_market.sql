-- Local market layer: narrows which built-in Discover sources are shown by
-- default, without touching geoScope (the wide "which continents" layer).
-- NULL means no local market chosen - geoScope alone drives the wide filter.
ALTER TABLE settings ADD COLUMN market TEXT;
