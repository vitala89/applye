-- Pipeline quick-view: user-set priority flag + comment thread.
-- Additive only - never edit an applied migration.

ALTER TABLE applications ADD COLUMN priority TEXT DEFAULT NULL; -- NULL/'low'/'medium'/'high'

CREATE TABLE IF NOT EXISTS application_comments (
  id INTEGER PRIMARY KEY,
  application_id INTEGER REFERENCES applications(id),
  comment_text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Preserve existing notes: any non-empty applications.notes becomes the
-- first comment (notes column stays in place as legacy - never dropped).
INSERT INTO application_comments (application_id, comment_text, created_at)
SELECT id, notes, COALESCE(updated_at, datetime('now'))
FROM applications
WHERE notes IS NOT NULL AND TRIM(notes) != '';
