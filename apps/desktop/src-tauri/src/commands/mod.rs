// Tauri command handlers - each module maps to a frontend invoke() call.
// All DB commands are async and receive the shared Db pool via Tauri State.
// All SQL lives here in Rust; the Angular frontend only calls typed invoke()s.

pub mod analytics;
pub mod applications;
pub mod archetypes;
pub mod ats;
pub mod ats_format;
pub mod discover;
pub mod discover_fetch;
pub mod discover_filter;
pub mod discover_geo;
pub mod discover_parsers;
pub mod discover_parsers_ats;
pub mod discover_parsers_nofluffjobs;
pub mod discover_sources;
pub mod documents;
pub mod documents_blocks;
pub mod documents_export;
pub mod documents_import;
pub mod documents_style;
pub mod followup_drafts;
pub mod health;
pub mod import;
pub mod interview;
pub mod job_identity;
pub mod job_identity_source;
pub mod job_paste;
pub mod job_url;
pub mod jobs;
pub mod legitimacy;
pub mod portal_answers;
pub mod print;
pub mod profile;
pub mod scoring;
pub mod settings;
pub mod tailoring;
pub mod tailoring_docx;
pub mod tailoring_fonts;
pub mod tailoring_journal;
pub mod tailoring_markdown;
pub mod tailoring_page;
pub mod tailoring_pdf;
pub mod tailoring_theme;
pub mod tracker;
pub mod untrusted;

use tauri::State;

use crate::db::Db;

/// Backup stub for the future "export your data" feature: writes a clean,
/// WAL-consistent copy of the SQLite database to `target_path` via VACUUM INTO.
/// No UI yet - callable from the frontend / a future Settings action.
#[tauri::command]
pub async fn db_export(target_path: String, db: State<'_, Db>) -> Result<String, String> {
    sqlx::query("VACUUM INTO ?")
        .bind(&target_path)
        .execute(&db.pool)
        .await
        .map_err(|e| format!("db_export: {e}"))?;
    Ok(target_path)
}
