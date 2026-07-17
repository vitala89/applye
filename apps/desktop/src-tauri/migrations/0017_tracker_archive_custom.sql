-- Job Tracker redesign: soft-archive flag + user-defined custom columns.
-- Archive keeps a row out of the active grid while still counting toward the
-- Eigenbemuehungen report. Custom columns let the user add their own fields;
-- definitions live in tracker_custom_columns, per-application values in a JSON
-- blob on applications.custom_fields ({ "<colId>": "<value>" }).

ALTER TABLE applications ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE applications ADD COLUMN custom_fields TEXT;

CREATE TABLE IF NOT EXISTS tracker_custom_columns (
  id    TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  type  TEXT NOT NULL,
  sort  INTEGER NOT NULL DEFAULT 0
);
