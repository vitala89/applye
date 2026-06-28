// Tauri command handlers — each module maps to a frontend invoke() call.
// All DB commands are async and receive the shared Db pool via Tauri State.
// All SQL lives here in Rust; the Angular frontend only calls typed invoke()s.

pub mod applications;
pub mod jobs;
pub mod profile;
pub mod scoring;
pub mod settings;

use tauri::State;

use crate::db::Db;

/// Backup stub for the future "export your data" feature: writes a clean,
/// WAL-consistent copy of the SQLite database to `target_path` via VACUUM INTO.
/// No UI yet — callable from the frontend / a future Settings action.
#[tauri::command]
pub async fn db_export(target_path: String, db: State<'_, Db>) -> Result<String, String> {
    sqlx::query("VACUUM INTO ?")
        .bind(&target_path)
        .execute(&db.pool)
        .await
        .map_err(|e| format!("db_export: {e}"))?;
    Ok(target_path)
}
