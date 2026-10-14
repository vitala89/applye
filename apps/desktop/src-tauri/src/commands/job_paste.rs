//! Tauri IPC adapter for pasting a job description.

use tauri::State;

use crate::db::Db;
use crate::jobs::paste::IdentityPrecedence;
use crate::jobs::Job;

#[tauri::command]
pub async fn job_paste(
    jd_text: String,
    title: Option<String>,
    company: Option<String>,
    precedence: Option<IdentityPrecedence>,
    job_id: Option<i64>,
    db: State<'_, Db>,
) -> Result<Job, String> {
    crate::jobs::paste::job_paste(jd_text, title, company, precedence, job_id, &db.pool).await
}
