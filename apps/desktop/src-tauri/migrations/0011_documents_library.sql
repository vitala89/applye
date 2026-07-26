-- 0011_documents_library.sql
-- Documents library (ROADMAP §16, DDL §12) — Step 1a, data layer only.
--
-- Purely additive: two new tables plus two nullable FK columns on the
-- existing `applications` table. `document_library` is the live, editable
-- CV/Cover-Letter library; distinct from `generated_docs`, which stays the
-- export journal. `applications.cv_path` / `cover_letter_path` are left
-- untouched — they remain the frozen apply-time snapshot (Agentur report
-- accuracy); the new *_document_id FKs only record which library doc was
-- used, they never rewrite the snapshot.

CREATE TABLE IF NOT EXISTS cv_templates (
    id                     INTEGER PRIMARY KEY,
    name                   TEXT,
    region_tag             TEXT,
    sections_json          TEXT,
    include_photo          INTEGER DEFAULT 0,
    include_birthdate      INTEGER DEFAULT 0,
    include_marital_status INTEGER DEFAULT 0,
    is_builtin             INTEGER DEFAULT 0,
    created_at             TEXT
);

CREATE TABLE IF NOT EXISTS document_library (
    id             INTEGER PRIMARY KEY,
    doc_type       TEXT NOT NULL,
    source         TEXT NOT NULL,
    label          TEXT,
    content_json   TEXT,
    file_path      TEXT,
    template_id    INTEGER REFERENCES cv_templates(id),
    style_json     TEXT,
    region_tag     TEXT,
    language       TEXT,
    archetype_tag  TEXT,
    is_default     INTEGER DEFAULT 0,
    input_hash     TEXT,
    model_used     TEXT,
    tokens_input   INTEGER,
    tokens_output  INTEGER,
    created_at     TEXT,
    updated_at     TEXT
);

ALTER TABLE applications ADD COLUMN cv_document_id INTEGER REFERENCES document_library(id);
ALTER TABLE applications ADD COLUMN cover_letter_document_id INTEGER REFERENCES document_library(id);

-- Built-in CV layout templates (ROADMAP §16.2).
INSERT INTO cv_templates (name, region_tag, sections_json, include_photo, include_birthdate, include_marital_status, is_builtin, created_at)
VALUES
    ('DE-traditional', 'de', '["photo","personal_details","summary","experience","education","skills","languages"]', 1, 1, 1, 1, datetime('now')),
    ('DE-ATS-modern', 'de', '["summary","experience","education","skills","languages"]', 0, 0, 0, 1, datetime('now')),
    ('US', 'us', '["summary","experience","education","skills"]', 0, 0, 0, 1, datetime('now')),
    ('UK', 'uk', '["summary","experience","education","skills"]', 0, 0, 0, 1, datetime('now')),
    ('generic', 'generic', '["summary","experience","education","skills"]', 0, 0, 0, 1, datetime('now'));
