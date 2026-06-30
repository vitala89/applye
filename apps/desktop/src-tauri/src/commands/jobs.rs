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
    pub legitimacy_tier: Option<String>,
    pub legitimacy_notes: Option<String>,
    pub imported_from: Option<String>,
    pub discover_dismissed: Option<bool>,
    pub discover_shown_at: Option<String>,
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

/// One row per job for the My Jobs table: the job's columns plus its latest
/// score and current application status (correlated subqueries, 0 tokens).
/// Read-only; sort/filter/search happen client-side over this small local list.
#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct JobOverview {
    pub id: i64,
    pub company: Option<String>,
    pub title: Option<String>,
    pub source: Option<String>,
    pub location: Option<String>,
    pub legitimacy_tier: Option<String>,
    pub created_at: Option<String>,
    pub score: Option<f64>,
    pub status: Option<String>,
}

#[tauri::command]
pub async fn db_list_jobs_overview(db: State<'_, Db>) -> Result<Vec<JobOverview>, String> {
    sqlx::query_as::<_, JobOverview>(
        "SELECT
           j.id, j.company, j.title, j.source, j.location,
           j.legitimacy_tier, j.created_at,
           (SELECT sc.score FROM scoring_cache sc
              WHERE sc.job_id = j.id ORDER BY sc.id DESC LIMIT 1) AS score,
           (SELECT a.status FROM applications a
              WHERE a.job_id = j.id ORDER BY a.id DESC LIMIT 1) AS status
         FROM jobs j
         ORDER BY j.created_at DESC, j.id DESC",
    )
    .fetch_all(&db.pool)
    .await
    .map_err(|e| format!("db_list_jobs_overview: {e}"))
}

#[tauri::command]
pub async fn db_get_job(id: i64, db: State<'_, Db>) -> Result<Option<Job>, String> {
    sqlx::query_as::<_, Job>("SELECT * FROM jobs WHERE id = ?")
        .bind(id)
        .fetch_optional(&db.pool)
        .await
        .map_err(|e| format!("db_get_job: {e}"))
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
