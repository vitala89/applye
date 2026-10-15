//! Tauri IPC adapter for the tailoring cache. Opening a file is `commands::shell`.
//! The old generated-document commands (`generated_doc_get`, `export_docx`,
//! `export_pdf`) were removed in Architecture Stabilization PR 6. They had no
//! application caller. The `generated_docs` table stays for older databases.

use tauri::State;

use crate::db::Db;
use crate::tailoring::cache::{SaveTailoringInput, TailoringCache};

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
