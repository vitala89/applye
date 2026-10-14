//! Tauri IPC adapter for setting or skipping a job's identity.

use tauri::State;

use crate::db::Db;
use crate::jobs::provenance::IdentitySource;
use crate::jobs::Job;

#[tauri::command]
pub async fn job_set_identity(
    job_id: i64,
    title: Option<String>,
    company: Option<String>,
    title_source: Option<IdentitySource>,
    company_source: Option<IdentitySource>,
    db: State<'_, Db>,
) -> Result<Job, String> {
    crate::jobs::provenance::job_set_identity(
        job_id,
        title,
        company,
        title_source,
        company_source,
        &db.pool,
    )
    .await
}

#[tauri::command]
pub async fn job_skip_identity_prompt(job_id: i64, db: State<'_, Db>) -> Result<(), String> {
    crate::jobs::provenance::job_skip_identity_prompt(job_id, &db.pool).await
}
