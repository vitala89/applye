//! Tauri IPC adapter for the legacy tailoring cache, generated documents, and
//! app-data exports. Opening a file is `commands::shell`, not this module.

use tauri::{AppHandle, Manager, State};

use crate::db::Db;
use crate::tailoring::cache::{SaveTailoringInput, TailoringCache};
use crate::tailoring::generated::GeneratedDoc;

#[tauri::command]
pub async fn tailoring_cache_get(
    job_id: i64,
    pass: i64,
    input_hash: String,
    db: State<'_, Db>,
) -> Result<Option<TailoringCache>, String> {
    crate::tailoring::cache::tailoring_cache_get(job_id, pass, input_hash, &db.pool).await
}

#[tauri::command]
pub async fn tailoring_cache_save(
    input: SaveTailoringInput,
    db: State<'_, Db>,
) -> Result<TailoringCache, String> {
    crate::tailoring::cache::tailoring_cache_save(input, &db.pool).await
}

#[tauri::command]
pub async fn generated_doc_get(
    job_id: i64,
    input_hash: String,
    export_format: String,
    db: State<'_, Db>,
) -> Result<Option<GeneratedDoc>, String> {
    crate::tailoring::generated::generated_doc_get(job_id, input_hash, export_format, &db.pool)
        .await
}

#[tauri::command]
pub async fn export_docx(
    job_id: i64,
    content_md: String,
    company: String,
    job_title: String,
    input_hash: String,
    app: AppHandle,
    db: State<'_, Db>,
) -> Result<GeneratedDoc, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    crate::tailoring::files::export_docx(
        job_id, content_md, company, job_title, input_hash, &app_data, &db.pool,
    )
    .await
}

#[tauri::command]
pub async fn export_pdf(
    job_id: i64,
    content_md: String,
    company: String,
    job_title: String,
    input_hash: String,
    app: AppHandle,
    db: State<'_, Db>,
) -> Result<GeneratedDoc, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    crate::tailoring::files::export_pdf(
        job_id, content_md, company, job_title, input_hash, &app_data, &db.pool,
    )
    .await
}
