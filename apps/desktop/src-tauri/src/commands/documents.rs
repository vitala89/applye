//! Tauri IPC adapter for the document library and custom CV templates.
//! Persistence lives in `crate::documents`.

use tauri::State;

use crate::db::Db;
use crate::documents::{
    CvTemplate, DocumentLibraryItem, UpsertCvTemplateInput, UpsertDocumentLibraryItemInput,
};

#[tauri::command]
pub async fn cv_templates_list(db: State<'_, Db>) -> Result<Vec<CvTemplate>, String> {
    crate::documents::list_templates(&db.pool).await
}

#[tauri::command]
pub async fn cv_template_upsert(
    input: UpsertCvTemplateInput,
    db: State<'_, Db>,
) -> Result<CvTemplate, String> {
    crate::documents::upsert_template(input, &db.pool).await
}

#[tauri::command]
pub async fn document_library_list(
    doc_type: Option<String>,
    db: State<'_, Db>,
) -> Result<Vec<DocumentLibraryItem>, String> {
    crate::documents::list(doc_type, &db.pool).await
}

#[tauri::command]
pub async fn document_library_get(
    id: i64,
    db: State<'_, Db>,
) -> Result<Option<DocumentLibraryItem>, String> {
    crate::documents::get(id, &db.pool).await
}

#[tauri::command]
pub async fn document_library_upsert(
    input: UpsertDocumentLibraryItemInput,
    db: State<'_, Db>,
) -> Result<DocumentLibraryItem, String> {
    crate::documents::upsert(input, &db.pool).await
}

#[tauri::command]
pub async fn document_library_commit(
    id: i64,
    db: State<'_, Db>,
) -> Result<Option<DocumentLibraryItem>, String> {
    crate::documents::commit(id, &db.pool).await
}

#[tauri::command]
pub async fn document_library_delete(id: i64, db: State<'_, Db>) -> Result<(), String> {
    crate::documents::delete(id, &db.pool).await
}
