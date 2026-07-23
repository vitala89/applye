-- Every built-in-source seed migration so far (0021, and the first cut of
-- what is now 0025) hardcoded an explicit low `id` and relied on
-- `INSERT OR IGNORE` to make re-seeding safe. That is unsafe: `sources.id`
-- is a plain autoincrement primary key that user-added custom sources also
-- consume, so a real install with even a handful of manually-added sources
-- can already occupy those low ids by the time a new built-in ships. The
-- INSERT then silently no-ops on the primary-key conflict instead of the
-- intended "skip if already seeded" behavior - found live 2026-07-24: a
-- dev database with 4 custom sources at ids 5-8 meant migration 0021's
-- `id=4` collided with an existing custom source, and Bundesagentur fuer
-- Arbeit was never actually inserted despite migration 0021 reporting
-- success.
--
-- Fix: seed migrations from here on omit `id` entirely (SQLite assigns the
-- next free one, same as a user-added source would get) and rely on this
-- unique index over `url` for idempotency instead. Partial (url != '') so
-- the several ATS sources that store only a slug and ship with url='' don't
-- collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_url_unique
  ON sources(url)
  WHERE url IS NOT NULL AND url != '';

-- Backfill: insert Bundesagentur fuer Arbeit if migration 0021 silently
-- failed to (the id=4 collision above). INSERT OR IGNORE + the new url
-- index means this is a true no-op on a database where it already exists.
INSERT OR IGNORE INTO sources (name, type, url, is_builtin, is_enabled, geo_tags_json, legality_note)
VALUES
  ('Bundesagentur fuer Arbeit', 'api_arbeitsagentur',
   'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs',
   1, 0, '["de"]',
   'Tier 2 - official public REST API of the German federal employment agency, read with the anonymous client key published in its own API documentation.');
