-- followup_drafts: AI-drafted follow-up emails for overdue applications,
-- cached per application + input hash (company, role, applied date,
-- language, model). Additive only - never edit an applied migration.

CREATE TABLE IF NOT EXISTS followup_drafts (
    id            INTEGER PRIMARY KEY,
    application_id INTEGER REFERENCES applications(id),
    input_hash    TEXT,
    language      TEXT,
    subject       TEXT,
    body          TEXT,
    model_used    TEXT,
    tokens_input  INTEGER,
    tokens_output INTEGER,
    created_at    TEXT,
    UNIQUE(application_id, input_hash)
);
