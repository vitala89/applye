use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Application {
    pub id: i64,
    pub job_id: Option<i64>,
    pub status: Option<String>,
    pub application_method: Option<String>,
    pub applied_at: Option<String>,
    pub follow_up_at: Option<String>,
    pub cv_path: Option<String>,
    pub cover_letter_path: Option<String>,
    pub contract_type: Option<String>,
    pub eor_provider: Option<String>,
    pub doc_language: Option<String>,
    pub notes: Option<String>,
    pub updated_at: Option<String>,
}

/// Upsert payload. When `id` is present the row is updated; otherwise inserted.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationInput {
    pub id: Option<i64>,
    pub job_id: i64,
    pub status: String,
    pub application_method: Option<String>,
    pub applied_at: Option<String>,
    pub follow_up_at: Option<String>,
    pub cv_path: Option<String>,
    pub cover_letter_path: Option<String>,
    pub contract_type: Option<String>,
    pub eor_provider: Option<String>,
    pub doc_language: Option<String>,
    pub notes: Option<String>,
}

#[tauri::command]
pub async fn db_list_applications(db: State<'_, Db>) -> Result<Vec<Application>, String> {
    sqlx::query_as::<_, Application>("SELECT * FROM applications ORDER BY updated_at DESC, id DESC")
        .fetch_all(&db.pool)
        .await
        .map_err(|e| format!("db_list_applications: {e}"))
}

#[tauri::command]
pub async fn db_upsert_application(
    application: ApplicationInput,
    db: State<'_, Db>,
) -> Result<Application, String> {
    let a = &application;
    let id = match a.id {
        Some(id) => {
            sqlx::query(
                "UPDATE applications SET
                   job_id = ?, status = ?, application_method = ?, applied_at = ?,
                   follow_up_at = ?, cv_path = ?, cover_letter_path = ?, contract_type = ?,
                   eor_provider = ?, doc_language = ?, notes = ?, updated_at = datetime('now')
                 WHERE id = ?",
            )
            .bind(a.job_id)
            .bind(&a.status)
            .bind(&a.application_method)
            .bind(&a.applied_at)
            .bind(&a.follow_up_at)
            .bind(&a.cv_path)
            .bind(&a.cover_letter_path)
            .bind(&a.contract_type)
            .bind(&a.eor_provider)
            .bind(&a.doc_language)
            .bind(&a.notes)
            .bind(id)
            .execute(&db.pool)
            .await
            .map_err(|e| format!("db_upsert_application (update): {e}"))?;
            id
        }
        None => {
            let res = sqlx::query(
                "INSERT INTO applications
                   (job_id, status, application_method, applied_at, follow_up_at, cv_path,
                    cover_letter_path, contract_type, eor_provider, doc_language, notes, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
            )
            .bind(a.job_id)
            .bind(&a.status)
            .bind(&a.application_method)
            .bind(&a.applied_at)
            .bind(&a.follow_up_at)
            .bind(&a.cv_path)
            .bind(&a.cover_letter_path)
            .bind(&a.contract_type)
            .bind(&a.eor_provider)
            .bind(&a.doc_language)
            .bind(&a.notes)
            .execute(&db.pool)
            .await
            .map_err(|e| format!("db_upsert_application (insert): {e}"))?;
            res.last_insert_rowid()
        }
    };

    fetch_application(&db, id).await
}

/// Update status AND append a `status_history` row in a single transaction.
/// `changed_at` / `updated_at` are auto-stamped — the source of truth for the
/// Agentur für Arbeit report and analytics.
#[tauri::command]
pub async fn db_set_application_status(
    id: i64,
    status: String,
    db: State<'_, Db>,
) -> Result<Application, String> {
    let mut tx = db
        .pool
        .begin()
        .await
        .map_err(|e| format!("db_set_application_status (begin): {e}"))?;

    sqlx::query("UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(&status)
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("db_set_application_status (update): {e}"))?;

    sqlx::query(
        "INSERT INTO status_history (application_id, status, changed_at)
         VALUES (?, ?, datetime('now'))",
    )
    .bind(id)
    .bind(&status)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("db_set_application_status (history): {e}"))?;

    tx.commit()
        .await
        .map_err(|e| format!("db_set_application_status (commit): {e}"))?;

    fetch_application(&db, id).await
}

/// Kanban card: application joined with job title/company and latest score.
#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PipelineCard {
    pub id: i64,
    pub job_id: Option<i64>,
    pub status: Option<String>,
    pub applied_at: Option<String>,
    pub updated_at: Option<String>,
    pub company: Option<String>,
    pub title: Option<String>,
    pub score: Option<f64>,
}

#[tauri::command]
pub async fn db_pipeline_cards(db: State<'_, Db>) -> Result<Vec<PipelineCard>, String> {
    sqlx::query_as::<_, PipelineCard>(
        "SELECT
           a.id, a.job_id, a.status, a.applied_at, a.updated_at,
           j.company, j.title,
           sc.score
         FROM applications a
         LEFT JOIN jobs j ON a.job_id = j.id
         LEFT JOIN (
           SELECT job_id, MAX(id) AS max_id FROM scoring_cache GROUP BY job_id
         ) latest ON latest.job_id = j.id
         LEFT JOIN scoring_cache sc ON sc.id = latest.max_id
         ORDER BY a.updated_at DESC, a.id DESC",
    )
    .fetch_all(&db.pool)
    .await
    .map_err(|e| format!("db_pipeline_cards: {e}"))
}

async fn fetch_application(db: &Db, id: i64) -> Result<Application, String> {
    sqlx::query_as::<_, Application>("SELECT * FROM applications WHERE id = ?")
        .bind(id)
        .fetch_one(&db.pool)
        .await
        .map_err(|e| format!("fetch_application: {e}"))
}
