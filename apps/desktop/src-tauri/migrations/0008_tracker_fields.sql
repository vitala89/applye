-- 0008_tracker_fields.sql
-- Job Tracker parity with the user's real xlsx tracker (ROADMAP §9 + §12).
--
-- Purely additive: every statement is ALTER TABLE ADD COLUMN on existing
-- tables. No table is dropped, no column is removed or retyped, so applying
-- this on a populated database preserves all existing jobs, applications,
-- and dogfooding data. SQLite has no "ADD COLUMN IF NOT EXISTS"; that is
-- safe here because sqlx runs each migration exactly once and records its
-- checksum (0001-0007 are untouched).

-- jobs: tech stack the posting asks for (free text, e.g. "React, Node, AWS").
ALTER TABLE jobs ADD COLUMN tech_stack TEXT;

-- applications: source link, contact details, next action, and salary range
-- — the remaining columns from the user's xlsx tracker that don't already
-- exist on applications (contract_type, eor_provider, notes are from 0001).
ALTER TABLE applications ADD COLUMN source_url TEXT;
ALTER TABLE applications ADD COLUMN contact_name TEXT;
ALTER TABLE applications ADD COLUMN contact_role TEXT;
ALTER TABLE applications ADD COLUMN contact_channel TEXT;   -- email or LinkedIn URL
ALTER TABLE applications ADD COLUMN next_action TEXT;
ALTER TABLE applications ADD COLUMN next_action_at TEXT;
ALTER TABLE applications ADD COLUMN salary_range TEXT;      -- gross, free text (e.g. "70-80k EUR")
