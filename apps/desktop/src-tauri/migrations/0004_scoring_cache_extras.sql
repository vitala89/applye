-- Extend scoring_cache with language tracking and ATS/summary fields.
ALTER TABLE scoring_cache ADD COLUMN language TEXT;
ALTER TABLE scoring_cache ADD COLUMN ats_pass INTEGER;
ALTER TABLE scoring_cache ADD COLUMN ats_notes TEXT;
ALTER TABLE scoring_cache ADD COLUMN summary TEXT;
