use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::{stable_hash, Db};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: i64,
    pub company: Option<String>,
    pub title: Option<String>,
    pub jd_text: Option<String>,
    pub jd_hash: Option<String>,
    pub source: Option<String>,
    pub location: Option<String>,
    pub language: Option<String>,
    pub salary_min: Option<i64>,
    pub blue_card_eligible: Option<bool>,
    pub hard_filter_passed: Option<bool>,
    pub created_at: Option<String>,
}

/// Payload from the frontend. `jd_hash` is intentionally NOT accepted — it is
/// always computed in Rust from `jd_text` so dedupe stays authoritative.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobInput {
    pub company: Option<String>,
    pub title: Option<String>,
    pub jd_text: String,
    pub source: Option<String>,
    pub location: Option<String>,
    pub language: Option<String>,
    pub salary_min: Option<i64>,
    pub blue_card_eligible: Option<bool>,
    pub hard_filter_passed: Option<bool>,
}

#[tauri::command]
pub async fn db_list_jobs(db: State<'_, Db>) -> Result<Vec<Job>, String> {
    sqlx::query_as::<_, Job>("SELECT * FROM jobs ORDER BY created_at DESC, id DESC")
        .fetch_all(&db.pool)
        .await
        .map_err(|e| format!("db_list_jobs: {e}"))
}

#[tauri::command]
pub async fn db_upsert_job(job: JobInput, db: State<'_, Db>) -> Result<Job, String> {
    // jd_hash is the dedupe key (0 tokens). Re-pasting the same JD updates in place.
    let jd_hash = stable_hash(&job.jd_text);

    sqlx::query(
        "INSERT INTO jobs
           (company, title, jd_text, jd_hash, source, location, language,
            salary_min, blue_card_eligible, hard_filter_passed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(jd_hash) DO UPDATE SET
           company            = excluded.company,
           title              = excluded.title,
           source             = excluded.source,
           location           = excluded.location,
           language           = excluded.language,
           salary_min         = excluded.salary_min,
           blue_card_eligible = excluded.blue_card_eligible,
           hard_filter_passed = excluded.hard_filter_passed",
    )
    .bind(&job.company)
    .bind(&job.title)
    .bind(&job.jd_text)
    .bind(&jd_hash)
    .bind(&job.source)
    .bind(&job.location)
    .bind(&job.language)
    .bind(job.salary_min)
    .bind(job.blue_card_eligible)
    .bind(job.hard_filter_passed)
    .execute(&db.pool)
    .await
    .map_err(|e| format!("db_upsert_job: {e}"))?;

    sqlx::query_as::<_, Job>("SELECT * FROM jobs WHERE jd_hash = ?")
        .bind(&jd_hash)
        .fetch_one(&db.pool)
        .await
        .map_err(|e| format!("db_upsert_job (reload): {e}"))
}
