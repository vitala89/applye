//! Tauri IPC adapter for jobs. The model and SQL live in `crate::jobs`.

use tauri::State;

use crate::db::Db;
use crate::jobs::{Job, JobInput, JobOverview};

#[tauri::command]
pub async fn db_list_jobs(db: State<'_, Db>) -> Result<Vec<Job>, String> {
    crate::jobs::persistence::db_list_jobs(&db.pool).await
}

#[tauri::command]
pub async fn db_list_jobs_overview(db: State<'_, Db>) -> Result<Vec<JobOverview>, String> {
    crate::jobs::persistence::db_list_jobs_overview(&db.pool).await
}

#[tauri::command]
pub async fn db_get_job(id: i64, db: State<'_, Db>) -> Result<Option<Job>, String> {
    crate::jobs::persistence::db_get_job(id, &db.pool).await
}

#[tauri::command]
pub async fn db_upsert_job(job: JobInput, db: State<'_, Db>) -> Result<Job, String> {
    crate::jobs::persistence::db_upsert_job(job, &db.pool).await
}

#[tauri::command]
pub async fn db_delete_job(id: i64, db: State<'_, Db>) -> Result<(), String> {
    crate::jobs::persistence::db_delete_job(id, &db.pool).await
}
