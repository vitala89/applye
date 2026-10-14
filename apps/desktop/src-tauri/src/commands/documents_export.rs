//! Tauri IPC adapter for library document export. Byte generation lives in
//! `crate::documents`. This module writes the user-chosen path and records it
//! in `ExportedPaths` so Open/Reveal can reach a file outside the app folder.

use tauri::State;

use crate::db::Db;
use crate::exported_paths::ExportedPaths;

#[tauri::command]
pub async fn cv_document_export(
    id: i64,
    format: String,
    save_path: String,
    db: State<'_, Db>,
    exported: State<'_, ExportedPaths>,
) -> Result<String, String> {
    let bytes = crate::documents::export_cv_bytes(id, &format, &db.pool).await?;
    std::fs::write(&save_path, bytes).map_err(|e| format!("cv_document_export: write: {e}"))?;
    exported.remember(std::path::Path::new(&save_path));
    Ok(save_path)
}

#[tauri::command]
pub async fn cover_letter_document_export(
    id: i64,
    format: String,
    save_path: String,
    db: State<'_, Db>,
    exported: State<'_, ExportedPaths>,
) -> Result<String, String> {
    let bytes = crate::documents::export_cover_letter_bytes(id, &format, &db.pool).await?;
    std::fs::write(&save_path, bytes)
        .map_err(|e| format!("cover_letter_document_export: write: {e}"))?;
    exported.remember(std::path::Path::new(&save_path));
    Ok(save_path)
}
