-- Where a job's company and title came from, and whether the user has already
-- declined to name them (job identity, part B).
--
-- title_source / company_source  - 'extracted' (read from the posting),
--   'inferred' (named by the AI step), or 'user' (typed by hand). NULL for every
--   row parsed before this migration, which reads as "unknown" and keeps part
--   A's behaviour for those rows.
--
-- identity_prompt_skipped - the user was asked to name the missing field and
--   chose Skip. Stored here rather than in the browser because it is a fact
--   about the job, not about the machine looking at it.
--
-- Additive and backwards compatible: no backfill, no default that changes an
-- existing read.
ALTER TABLE jobs ADD COLUMN title_source TEXT;
ALTER TABLE jobs ADD COLUMN company_source TEXT;
ALTER TABLE jobs ADD COLUMN identity_prompt_skipped INTEGER NOT NULL DEFAULT 0;
