-- Tailoring pass results cache (keyed by all inputs for that pass).
-- Pass 2 input_hash includes pass-1 result; pass 3 includes both - so
-- a different upstream pass always invalidates downstream cache entries.
CREATE TABLE IF NOT EXISTS tailoring_cache (
    id            INTEGER PRIMARY KEY,
    job_id        INTEGER REFERENCES jobs(id),
    pass          INTEGER NOT NULL,      -- 1 / 2 / 3
    input_hash    TEXT    NOT NULL,      -- hash of all inputs for this pass
    result_md     TEXT    NOT NULL,
    changes_json  TEXT,                  -- JSON array of change descriptions
    gaps_json     TEXT,                  -- pass 3 only: unaddressable JD requirements
    model_used    TEXT,
    tokens_input  INTEGER,
    tokens_output INTEGER,
    created_at    TEXT,
    UNIQUE(job_id, pass, input_hash)
);

-- Every exported file (DOCX, PDF, …) keyed by content hash so re-exporting
-- identical content returns the cached file without touching disk again.
CREATE TABLE IF NOT EXISTS generated_docs (
    id            INTEGER PRIMARY KEY,
    job_id        INTEGER REFERENCES jobs(id),
    doc_type      TEXT NOT NULL,         -- cv / cover_letter / pitch / interview_prep
    export_format TEXT NOT NULL,         -- docx / pdf / md / xlsx
    input_hash    TEXT NOT NULL,
    file_path     TEXT NOT NULL,
    created_at    TEXT,
    UNIQUE(job_id, doc_type, export_format, input_hash)
);
