-- Applye initial schema - all tables from ROADMAP §12.
-- Implemented in full now (even tables unused until later phases) to avoid
-- schema churn. Pragmas (WAL, foreign_keys) are set on the connection in db.rs.

-- Profile-level (source of truth)
CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY,
  full_md TEXT,
  scoring_json TEXT,        -- compressed profile for scoring (generated once)
  scoring_hash TEXT,        -- cache invalidation
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS story_bank (
  id INTEGER PRIMARY KEY,
  title TEXT,
  star_situation TEXT, star_task TEXT, star_action TEXT,
  star_result TEXT, star_reflection TEXT,
  tags_json TEXT,
  created_at TEXT
);

-- Jobs
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY,
  company TEXT, title TEXT,
  jd_text TEXT,
  jd_hash TEXT UNIQUE,      -- dedupe (0 tokens)
  source TEXT, location TEXT, language TEXT,
  salary_min INTEGER,
  blue_card_eligible INTEGER,
  hard_filter_passed INTEGER,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS scoring_cache (
  id INTEGER PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id),
  profile_hash TEXT, jd_hash TEXT,
  score REAL,
  dimensions_json TEXT,
  missing_keywords_json TEXT,
  red_flags_json TEXT,
  model_used TEXT,
  tokens_input INTEGER, tokens_output INTEGER,
  created_at TEXT,
  UNIQUE(job_id, profile_hash, jd_hash)
);

-- Applications
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id),
  status TEXT,              -- saved/applied/interview/offer/rejected
  application_method TEXT,  -- online_form/email/portal
  applied_at TEXT,
  follow_up_at TEXT,
  cv_path TEXT, cover_letter_path TEXT,
  contract_type TEXT, eor_provider TEXT,
  doc_language TEXT,        -- AI output language for this application's docs (overrides default)
  notes TEXT, updated_at TEXT
);

CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY,
  application_id INTEGER REFERENCES applications(id),
  status TEXT,
  changed_at TEXT          -- auto-set
);

-- Interview
CREATE TABLE IF NOT EXISTS interview_stages (
  id INTEGER PRIMARY KEY,
  application_id INTEGER REFERENCES applications(id),
  stage_order INTEGER,
  stage_type TEXT,         -- hr_screen/technical/system_design/behavioral/final
  stage_label TEXT,
  scheduled_at TEXT,
  status TEXT,             -- upcoming/done
  stage_language TEXT,     -- prep language for THIS stage (HR call in DE, tech round in EN...)
  interviewer_name TEXT,   -- (Gmail later)
  interviewer_role TEXT,
  interviewer_email TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS interview_prep (
  id INTEGER PRIMARY KEY,
  stage_id INTEGER REFERENCES interview_stages(id),
  format TEXT,             -- qa/star
  language TEXT,           -- language this card was generated in (part of input_hash)
  question TEXT, answer TEXT,
  star_situation TEXT, star_task TEXT, star_action TEXT,
  star_result TEXT, star_reflection TEXT,
  input_hash TEXT, model_used TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS pitches (
  id INTEGER PRIMARY KEY,
  scope TEXT,              -- default/application
  application_id INTEGER REFERENCES applications(id),
  language TEXT,           -- pitch language (a user may keep pitches in several languages)
  pitch_text TEXT,
  duration_hint TEXT,     -- 30s/60s/2min
  input_hash TEXT,
  is_user_edited INTEGER,
  model_used TEXT,
  created_at TEXT, updated_at TEXT
);

CREATE TABLE IF NOT EXISTS company_research (   -- v2
  id INTEGER PRIMARY KEY,
  application_id INTEGER REFERENCES applications(id),
  summary TEXT, recent_news TEXT, culture_notes TEXT,
  smart_questions_json TEXT,
  input_hash TEXT, created_at TEXT
);

-- Cross-cutting
CREATE TABLE IF NOT EXISTS generated_docs (
  id INTEGER PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id),
  doc_type TEXT,          -- cv/cover_letter/pitch/interview_prep/arbeitsagentur_report
  export_format TEXT,     -- pdf/docx/md/xlsx
  input_hash TEXT,
  file_path TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ai_mode TEXT,           -- api/cli
  provider TEXT,
  default_model TEXT, economy_model TEXT,
  auto_export_on_apply INTEGER DEFAULT 0,   -- future automation (off by default)
  auto_export_format TEXT DEFAULT 'pdf',
  export_dir TEXT,
  ui_language TEXT DEFAULT 'en',     -- interface language: en/de/ru/es/fr/uk
  default_doc_language TEXT DEFAULT 'en',  -- default AI output language (overridable per application)
  geo_scope TEXT DEFAULT 'worldwide' -- worldwide/europe/eu/usa/custom
);

-- Job sources (built-in + user-added)
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY,
  name TEXT,
  type TEXT,              -- rss / api / ats_greenhouse / ats_lever / ats_ashby / manual
  url TEXT,
  is_builtin INTEGER,     -- 1 = shipped (Remotive, WWR, Himalayas...), 0 = user-added
  is_enabled INTEGER DEFAULT 1,
  geo_tags_json TEXT,     -- ["worldwide"] / ["eu","de"] / ["usa"] for geo filtering
  legality_note TEXT,     -- legal tier reminder shown in UI
  created_at TEXT
);

-- Geo filter presets (countries selectable on top of scope)
CREATE TABLE IF NOT EXISTS geo_filters (
  id INTEGER PRIMARY KEY,
  country_code TEXT,      -- de, us, fr... or 'remote'
  is_active INTEGER DEFAULT 1
);

-- ---------------------------------------------------------------------------
-- Seeds (idempotent: INSERT OR IGNORE on fixed primary keys / unique stubs)
-- ---------------------------------------------------------------------------

-- One settings row (id = 1) with the schema defaults made explicit.
INSERT OR IGNORE INTO settings
  (id, ui_language, default_doc_language, geo_scope, auto_export_on_apply, auto_export_format)
VALUES
  (1, 'en', 'en', 'worldwide', 0, 'pdf');

-- Tier-2 built-in sources, shipped DISABLED (is_builtin=1, is_enabled=0).
-- Fixed ids keep the seed idempotent across re-runs.
INSERT OR IGNORE INTO sources (id, name, type, url, is_builtin, is_enabled, geo_tags_json, legality_note)
VALUES
  (1, 'Remotive', 'api', 'https://remotive.com/api/remote-jobs', 1, 0, '["worldwide"]', 'Tier 2 - public API built for machine reading.'),
  (2, 'We Work Remotely', 'rss', 'https://weworkremotely.com/remote-jobs.rss', 1, 0, '["worldwide"]', 'Tier 2 - public RSS feed.'),
  (3, 'Himalayas', 'api', 'https://himalayas.app/jobs/api', 1, 0, '["worldwide"]', 'Tier 2 - public API built for machine reading.');
