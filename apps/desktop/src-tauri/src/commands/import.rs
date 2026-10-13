//! Tauri IPC adapter for tracklist import. Parsing, normalization, and SQL
//! live in `crate::tracklist_import`.

use tauri::State;

use crate::db::Db;
use crate::tracklist_import::{ImportFileContent, ImportPreviewRow, ImportRawRow, ImportResult};

#[tauri::command]
pub fn import_read_file(path: String) -> Result<ImportFileContent, String> {
    crate::tracklist_import::read_file(&path)
}

#[tauri::command]
pub async fn import_preview(
    rows: Vec<ImportRawRow>,
    db: State<'_, Db>,
) -> Result<Vec<ImportPreviewRow>, String> {
    crate::tracklist_import::preview(rows, &db.pool).await
}

#[tauri::command]
pub async fn import_confirm(
    rows: Vec<ImportRawRow>,
    imported_from: String,
    followup_days_after_apply: i64,
    db: State<'_, Db>,
) -> Result<ImportResult, String> {
    crate::tracklist_import::confirm(rows, &imported_from, followup_days_after_apply, &db.pool)
        .await
}
