//! Tauri IPC adapter for application tracking. Workflow and SQL live in
//! `crate::applications`.

use tauri::State;

use crate::applications::{
    Application, ApplicationInput, ApplicationTrackerFieldsInput, Comment, PipelineCard,
};
use crate::db::Db;

#[tauri::command]
pub async fn db_list_applications(db: State<'_, Db>) -> Result<Vec<Application>, String> {
    crate::applications::list(&db.pool).await
}

#[tauri::command]
pub async fn db_upsert_application(
    application: ApplicationInput,
    db: State<'_, Db>,
) -> Result<Application, String> {
    crate::applications::upsert(application, &db.pool).await
}

#[tauri::command]
pub async fn db_set_application_status(
    id: i64,
    status: String,
    db: State<'_, Db>,
) -> Result<Application, String> {
    crate::applications::set_status(id, status, &db.pool).await
}

#[tauri::command]
pub async fn db_pipeline_cards(db: State<'_, Db>) -> Result<Vec<PipelineCard>, String> {
    crate::applications::pipeline_cards(&db.pool).await
}

#[tauri::command]
pub async fn db_update_application_tracker_fields(
    input: ApplicationTrackerFieldsInput,
    db: State<'_, Db>,
) -> Result<Application, String> {
    crate::applications::update_tracker_fields(input, &db.pool).await
}

#[tauri::command]
pub async fn set_application_priority(
    application_id: i64,
    priority: Option<String>,
    db: State<'_, Db>,
) -> Result<Application, String> {
    crate::applications::set_priority(application_id, priority, &db.pool).await
}

#[tauri::command]
pub async fn add_application_comment(
    application_id: i64,
    comment_text: String,
    db: State<'_, Db>,
) -> Result<Comment, String> {
    crate::applications::add_comment(application_id, comment_text, &db.pool).await
}

#[tauri::command]
pub async fn list_application_comments(
    application_id: i64,
    db: State<'_, Db>,
) -> Result<Vec<Comment>, String> {
    crate::applications::list_comments(application_id, &db.pool).await
}
