-- Local-market built-in Discover sources: Ukraine, Russia, Germany, Poland,
-- plus a US-leaning worldwide remote board. Every endpoint below was probed
-- live before being added here (GET 200, no auth) - see
-- docs/product/local-markets-analysis.md for the probe notes.
--
-- Shipped DISABLED like every other built-in source (is_builtin=1,
-- is_enabled=0): collection stays an explicit user choice, and no request
-- reaches any of these servers until the user turns one on.
INSERT OR IGNORE INTO sources (id, name, type, url, is_builtin, is_enabled, geo_tags_json, legality_note)
VALUES
  (5, 'DOU.ua', 'rss',
   'https://jobs.dou.ua/vacancies/feeds/',
   1, 0, '["ua"]',
   'Tier 2 - standard RSS 2.0 feed published by DOU.ua, the largest Ukrainian IT job board; publicly available, no auth.'),

  (6, 'Djinni.co', 'rss',
   'https://djinni.co/jobs/rss/',
   1, 0, '["ua"]',
   'Tier 2 - standard RSS 2.0 feed published by Djinni.co, a Ukrainian IT job board; publicly available, no auth.'),

  (7, 'Habr Career', 'rss',
   'https://career.habr.com/vacancies/rss',
   1, 0, '["ru"]',
   'Tier 2 - standard RSS 2.0 feed published by Habr Career, a Russian IT job board; publicly available, no auth.'),

  (8, 'Jobicy', 'rss',
   'https://jobicy.com/?feed=job_feed',
   1, 0, '["us","worldwide"]',
   'Tier 2 - standard RSS 2.0 feed published by Jobicy, a remote-first job board weighted toward US postings; publicly available, no auth.'),

  (9, 'TrudVsem (Rostrud)', 'api_trudvsem',
   'https://opendata.trudvsem.ru/api/v1/vacancies?limit=100',
   1, 0, '["ru"]',
   'Tier 2 - official open-data portal of Rostrud (Russian federal labor service); publicly available, no auth.'),

  (10, 'Arbeitnow', 'api_arbeitnow',
   'https://www.arbeitnow.com/api/job-board-api',
   1, 0, '["de"]',
   'Tier 2 - public job board API published by Arbeitnow, weighted toward German postings; no auth.'),

  (11, 'No Fluff Jobs', 'api_nofluffjobs',
   'https://nofluffjobs.com/api/joboffers/main?salaryCurrency=PLN&salaryPeriod=month&region=pl',
   1, 0, '["pl"]',
   'Tier 2 - public job board API published by No Fluff Jobs, a Polish IT job board; no auth.');
