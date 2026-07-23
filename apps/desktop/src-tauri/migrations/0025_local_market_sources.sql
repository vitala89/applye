-- Local-market built-in Discover sources: Ukraine, Russia, Germany, Poland,
-- plus a US-leaning worldwide remote board. Every endpoint below was probed
-- live before being added here (GET 200, no auth) - see
-- docs/product/local-markets-analysis.md for the probe notes.
--
-- Shipped DISABLED like every other built-in source (is_builtin=1,
-- is_enabled=0): collection stays an explicit user choice, and no request
-- reaches any of these servers until the user turns one on.
--
-- `id` is omitted on purpose (see migration 0024): SQLite assigns the next
-- free one, same as a user-added source would get, and the unique index on
-- `url` from 0024 makes INSERT OR IGNORE idempotent without needing to know
-- which ids happen to be free on a given install.
INSERT OR IGNORE INTO sources (name, type, url, is_builtin, is_enabled, geo_tags_json, legality_note)
VALUES
  ('DOU.ua', 'rss',
   'https://jobs.dou.ua/vacancies/feeds/',
   1, 0, '["ua"]',
   'Tier 2 - standard RSS 2.0 feed published by DOU.ua, the largest Ukrainian IT job board; publicly available, no auth.'),

  ('Djinni.co', 'rss',
   'https://djinni.co/jobs/rss/',
   1, 0, '["ua"]',
   'Tier 2 - standard RSS 2.0 feed published by Djinni.co, a Ukrainian IT job board; publicly available, no auth.'),

  ('Habr Career', 'rss',
   'https://career.habr.com/vacancies/rss',
   1, 0, '["ru"]',
   'Tier 2 - standard RSS 2.0 feed published by Habr Career, a Russian IT job board; publicly available, no auth.'),

  ('Jobicy', 'rss',
   'https://jobicy.com/?feed=job_feed',
   1, 0, '["us","worldwide"]',
   'Tier 2 - standard RSS 2.0 feed published by Jobicy, a remote-first job board weighted toward US postings; publicly available, no auth.'),

  ('TrudVsem (Rostrud)', 'api_trudvsem',
   'https://opendata.trudvsem.ru/api/v1/vacancies?limit=100',
   1, 0, '["ru"]',
   'Tier 2 - official open-data portal of Rostrud (Russian federal labor service); publicly available, no auth.'),

  ('Arbeitnow', 'api_arbeitnow',
   'https://www.arbeitnow.com/api/job-board-api',
   1, 0, '["de"]',
   'Tier 2 - public job board API published by Arbeitnow, weighted toward German postings; no auth.'),

  ('No Fluff Jobs', 'api_nofluffjobs',
   'https://nofluffjobs.com/api/joboffers/main?salaryCurrency=PLN&salaryPeriod=month&region=pl',
   1, 0, '["pl"]',
   'Tier 2 - public job board API published by No Fluff Jobs, a Polish IT job board; no auth.');
