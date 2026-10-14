// Command entrypoints are Tauri IPC adapters. A command receives Tauri State,
// an AppHandle, or serialized arguments, then delegates.
//
// Jobs, Discover, and Tailoring keep their rules, parsers, renderers, and SQL
// in `jobs`, `discover`, and `tailoring`. Applications, Documents, Interview,
// and Tracklist Import already do the same. `exported_paths` and `web_text`
// are shared support, not commands.
//
// Profile, tracker, analytics, portal answers, follow-up drafts, health,
// settings, and the ATS check still mix adapter code with their helpers.
// That is outside this slice. The Angular frontend only calls typed invoke()s.

pub mod analytics;
pub mod applications;
pub mod archetypes;
pub mod ats;
pub mod ats_format;
pub mod ats_tokens;
pub mod database_backup;
pub mod discover;
pub mod discover_sources;
pub mod documents;
pub mod documents_export;
pub mod documents_import;
pub mod documents_style;
pub mod followup_drafts;
pub mod health;
pub mod import;
pub mod interview;
pub mod job_identity_source;
pub mod job_paste;
pub mod job_url;
pub mod jobs;
pub mod portal_answers;
pub mod print;
pub mod profile;
pub mod scoring;
pub mod settings;
pub mod shell;
pub mod tailoring_journal;
pub mod tracker;
