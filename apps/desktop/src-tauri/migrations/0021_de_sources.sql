-- German-market built-in Discover sources.
--
-- The shipped source set (Remotive, We Work Remotely, Himalayas) is
-- remote-first and English-speaking, so a user whose geo scope is Germany
-- scanned three feeds that almost never carry a German posting. This adds the
-- Bundesagentur fuer Arbeit job search, the official public REST API of the
-- German federal employment agency and by far the largest German index.
--
-- Shipped DISABLED like every other built-in source (is_builtin=1,
-- is_enabled=0): collection stays an explicit user choice.
INSERT OR IGNORE INTO sources (id, name, type, url, is_builtin, is_enabled, geo_tags_json, legality_note)
VALUES
  (4, 'Bundesagentur fuer Arbeit', 'api_arbeitsagentur',
   'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs',
   1, 0, '["de"]',
   'Tier 2 - official public REST API of the German federal employment agency, read with the anonymous client key published in its own API documentation.');
