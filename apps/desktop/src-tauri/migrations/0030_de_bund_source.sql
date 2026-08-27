-- German-market built-in Discover source: service.bund.de.
--
-- Public-sector postings (Bund, Laender, Kommunen) live on a different index
-- than Bundesagentur fuer Arbeit's general labor-market feed, and a Germany
-- geo scope currently misses all of it. service.bund.de publishes a standard
-- RSS 2.0 feed of its own listings, so this lands on the existing `rss`
-- source type - no new parser code, same as DOU.ua in migration 0025.
--
-- The feed's <description> is short structured metadata ("Arbeitgeber: X",
-- "Ort: Y", deadlines), not the posting's full text - each job's real
-- description lives on a page belonging to whichever employer's own
-- recruiting system the listing links to, which there is no single
-- machine-readable shape for. The existing "ort:" label in
-- `labelled_location` already reads the location out of that text, same as
-- it does for any other labelled RSS description.
--
-- Shipped DISABLED like every other built-in source (is_builtin=1,
-- is_enabled=0): collection stays an explicit user choice.
INSERT OR IGNORE INTO sources (name, type, url, is_builtin, is_enabled, geo_tags_json, legality_note)
VALUES
  ('service.bund.de', 'rss',
   'https://www.service.bund.de/Content/Globals/Functions/RSSFeed/RSSGenerator_Stellen.xml',
   1, 0, '["de"]',
   'Tier 2 - standard RSS 2.0 feed published by service.bund.de (Bundesverwaltungsamt), listing public-sector postings across Bund, Laender and Kommunen; publicly available, no auth.');
