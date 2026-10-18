-- Local Career Evidence rows. The domain value has no database id; `id` is
-- the desktop row identity only. `source_ref` stays an opaque label, so it is
-- not a foreign key. There is no revise or delete path in this migration.
CREATE TABLE career_evidence (
    id INTEGER PRIMARY KEY,
    statement TEXT NOT NULL CHECK (
        length(trim(statement)) > 0 AND statement = trim(statement)
    ),
    review_state TEXT NOT NULL CHECK (
        review_state IN ('draft', 'proposal', 'confirmed', 'rejected')
    ),
    origin TEXT NOT NULL CHECK (origin IN ('user', 'ai', 'import')),
    source_label TEXT CHECK (
        source_label IS NULL
        OR (length(trim(source_label)) > 0 AND source_label = trim(source_label))
    ),
    source_ref TEXT CHECK (
        source_ref IS NULL
        OR (length(trim(source_ref)) > 0 AND source_ref = trim(source_ref))
    ),
    captured_at TEXT NOT NULL CHECK (
        length(trim(captured_at)) > 0 AND captured_at = trim(captured_at)
    ),
    created_at TEXT NOT NULL CHECK (
        length(trim(created_at)) > 0 AND created_at = trim(created_at)
    ),
    updated_at TEXT NOT NULL CHECK (
        length(trim(updated_at)) > 0 AND updated_at = trim(updated_at)
    ),
    confirmed_at TEXT CHECK (
        confirmed_at IS NULL
        OR (length(trim(confirmed_at)) > 0 AND confirmed_at = trim(confirmed_at))
    ),
    rejected_at TEXT CHECK (
        rejected_at IS NULL
        OR (length(trim(rejected_at)) > 0 AND rejected_at = trim(rejected_at))
    ),
    CHECK (
        (
            review_state = 'draft'
            AND origin = 'user'
            AND confirmed_at IS NULL
            AND rejected_at IS NULL
        )
        OR (
            review_state = 'proposal'
            AND origin IN ('ai', 'import')
            AND confirmed_at IS NULL
            AND rejected_at IS NULL
        )
        OR (
            review_state = 'confirmed'
            AND confirmed_at IS NOT NULL
            AND rejected_at IS NULL
        )
        OR (
            review_state = 'rejected'
            AND rejected_at IS NOT NULL
            AND confirmed_at IS NULL
        )
    )
);
