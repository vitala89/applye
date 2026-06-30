-- 0006_career_ops_features.sql
-- Phase 4.5 schema sync: bring the live SQLite schema up to ROADMAP §12.
--
-- Purely additive. Every statement is either ALTER TABLE ADD COLUMN (new
-- nullable / defaulted columns, existing rows keep their data) or
-- CREATE TABLE IF NOT EXISTS (two new caches). No table is dropped, no column
-- is removed or retyped, so applying this on a populated database preserves
-- all existing jobs, applications, scoring, and settings.
--
-- SQLite has no "ADD COLUMN IF NOT EXISTS"; that is safe here because sqlx
-- runs each migration exactly once and records its checksum.

-- profile: required target archetypes before scoring (JSON array of strings).
ALTER TABLE profile ADD COLUMN target_archetypes TEXT;

-- jobs: deterministic legitimacy tier (0 tokens) computed before scoring,
-- plus provenance and "discover" feed bookkeeping.
-- NOTE: legitimacy_* are in ROADMAP §12; imported_from / discover_* are not yet
-- in §12 but are specified by the Phase 4.5 task. ROADMAP §12 should be updated
-- to match. All defaults are constants, safe for ALTER ADD COLUMN.
ALTER TABLE jobs ADD COLUMN legitimacy_tier TEXT DEFAULT 'green'; -- green/yellow/red
ALTER TABLE jobs ADD COLUMN legitimacy_notes TEXT;               -- what triggered the flag
ALTER TABLE jobs ADD COLUMN imported_from TEXT DEFAULT 'manual_paste'; -- provenance
ALTER TABLE jobs ADD COLUMN discover_dismissed INTEGER DEFAULT 0;      -- hidden from discover feed
ALTER TABLE jobs ADD COLUMN discover_shown_at TEXT;                    -- first surfaced in discover

-- scoring_cache: "before you submit" notes and a failure message for retries.
ALTER TABLE scoring_cache ADD COLUMN before_you_submit_json TEXT;
ALTER TABLE scoring_cache ADD COLUMN error_message TEXT;

-- company_research: market-rate comp data and the model that produced it.
ALTER TABLE company_research ADD COLUMN comp_research_json TEXT;
ALTER TABLE company_research ADD COLUMN model_used TEXT;

-- settings: configurable follow-up cadence and the global notify threshold.
ALTER TABLE settings ADD COLUMN followup_days_after_apply INTEGER DEFAULT 7;
ALTER TABLE settings ADD COLUMN followup_days_after_interview INTEGER DEFAULT 5;
ALTER TABLE settings ADD COLUMN min_score_notify REAL DEFAULT 7.0;

-- sources: ATS slug, per-source title filters, and per-source notify override.
ALTER TABLE sources ADD COLUMN slug TEXT;
ALTER TABLE sources ADD COLUMN title_filter_positive_json TEXT;
ALTER TABLE sources ADD COLUMN title_filter_negative_json TEXT;
ALTER TABLE sources ADD COLUMN min_score_notify REAL;

-- portal_answers: AI-drafted answers to a portal's open-ended questions,
-- cached per job + profile + input hash.
CREATE TABLE IF NOT EXISTS portal_answers (
    id            INTEGER PRIMARY KEY,
    job_id        INTEGER REFERENCES jobs(id),
    profile_hash  TEXT,
    questions_json TEXT,        -- open-ended questions from the portal
    answers_json  TEXT,         -- AI-drafted answers, one per question
    input_hash    TEXT,
    model_used    TEXT,
    tokens_input  INTEGER,
    tokens_output INTEGER,
    created_at    TEXT,
    UNIQUE(job_id, profile_hash, input_hash)
);

-- pattern_analysis: cached rejection-pattern analysis over aggregated data.
CREATE TABLE IF NOT EXISTS pattern_analysis (
    id            INTEGER PRIMARY KEY,
    input_hash    TEXT UNIQUE,  -- hash of aggregated rejection data
    analysis_json TEXT,         -- structured pattern output
    recommendations_json TEXT,
    sample_size   INTEGER,
    model_used    TEXT,
    tokens_input  INTEGER,
    tokens_output INTEGER,
    created_at    TEXT
);
