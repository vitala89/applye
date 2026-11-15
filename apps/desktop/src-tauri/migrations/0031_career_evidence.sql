-- Local Career Evidence lifecycle. The row id is infrastructure identity.
-- Statement, origin, source text, captured_at, and created_at are written
-- once. A later lifecycle update may change only the review state and the
-- review clocks, and only when those clocks stay equal to the state they mark.

CREATE TABLE career_evidence (
  id INTEGER PRIMARY KEY,
  statement TEXT NOT NULL,
  review_state TEXT NOT NULL,
  origin TEXT NOT NULL,
  source_label TEXT,
  source_ref TEXT,
  captured_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confirmed_at TEXT,
  rejected_at TEXT,
  CHECK (length(statement) > 0 AND statement = trim(statement)),
  CHECK (review_state IN ('draft', 'proposal', 'confirmed', 'rejected')),
  CHECK (origin IN ('user', 'ai', 'import')),
  CHECK (
    source_label IS NULL
    OR (length(source_label) > 0 AND source_label = trim(source_label))
  ),
  CHECK (
    source_ref IS NULL
    OR (length(source_ref) > 0 AND source_ref = trim(source_ref))
  ),
  CHECK (length(captured_at) > 0 AND captured_at = trim(captured_at)),
  CHECK (length(created_at) > 0 AND created_at = trim(created_at)),
  CHECK (length(updated_at) > 0 AND updated_at = trim(updated_at)),
  CHECK (
    confirmed_at IS NULL
    OR (length(confirmed_at) > 0 AND confirmed_at = trim(confirmed_at))
  ),
  CHECK (
    rejected_at IS NULL
    OR (length(rejected_at) > 0 AND rejected_at = trim(rejected_at))
  ),
  CHECK (
    (
      review_state = 'draft'
      AND origin = 'user'
      AND confirmed_at IS NULL
      AND rejected_at IS NULL
      AND updated_at = created_at
    )
    OR (
      review_state = 'proposal'
      AND origin IN ('ai', 'import')
      AND confirmed_at IS NULL
      AND rejected_at IS NULL
      AND updated_at = created_at
    )
    OR (
      review_state = 'confirmed'
      AND confirmed_at IS NOT NULL
      AND rejected_at IS NULL
      AND updated_at = confirmed_at
    )
    OR (
      review_state = 'rejected'
      AND rejected_at IS NOT NULL
      AND confirmed_at IS NULL
      AND updated_at = rejected_at
    )
  )
);
