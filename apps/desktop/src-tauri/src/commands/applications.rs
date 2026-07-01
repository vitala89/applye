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

    fetch_application(&db.pool, id).await
}

/// Update status AND append a `status_history` row in a single transaction.
/// `changed_at` / `updated_at` are auto-stamped — the source of truth for the
/// Agentur für Arbeit report and analytics.
///
/// Entering `applied` or `interview` also (re)computes `follow_up_at`
/// deterministically in SQL from the settings cadence — 0 AI tokens. This
/// only fires on an actual status transition (not on every load), so a
/// manually-edited `follow_up_at` survives until the user changes status
/// again. Terminal statuses (`offer`/`rejected`) leave `follow_up_at`
/// untouched — there is no further action to remind the user about.
#[tauri::command]
pub async fn db_set_application_status(
    id: i64,
    status: String,
    db: State<'_, Db>,
) -> Result<Application, String> {
    db_set_application_status_core(id, status, &db.pool).await
}

async fn db_set_application_status_core(
    id: i64,
    status: String,
    pool: &sqlx::SqlitePool,
) -> Result<Application, String> {
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("db_set_application_status (begin): {e}"))?;

    match status.as_str() {
        "applied" => {
            sqlx::query(
                "UPDATE applications SET
                   status = ?,
                   applied_at = COALESCE(applied_at, date('now')),
                   follow_up_at = date('now', '+' || COALESCE(
                     (SELECT followup_days_after_apply FROM settings WHERE id = 1), 7) || ' days'),
                   updated_at = datetime('now')
                 WHERE id = ?",
            )
            .bind(&status)
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("db_set_application_status (update): {e}"))?;
        }
        "interview" => {
            sqlx::query(
                "UPDATE applications SET
                   status = ?,
                   follow_up_at = date('now', '+' || COALESCE(
                     (SELECT followup_days_after_interview FROM settings WHERE id = 1), 5) || ' days'),
                   updated_at = datetime('now')
                 WHERE id = ?",
            )
            .bind(&status)
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("db_set_application_status (update): {e}"))?;
        }
        _ => {
            sqlx::query(
                "UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?",
            )
            .bind(&status)
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("db_set_application_status (update): {e}"))?;
        }
    }

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

    fetch_application(pool, id).await
}

/// Kanban card: application joined with job title/company and latest score.
#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PipelineCard {
    pub id: i64,
    pub job_id: Option<i64>,
    pub status: Option<String>,
    pub applied_at: Option<String>,
    pub follow_up_at: Option<String>,
    pub overdue: bool,
    pub updated_at: Option<String>,
    pub company: Option<String>,
    pub title: Option<String>,
    pub score: Option<f64>,
}

/// `overdue` is computed in SQL (0 tokens): a follow-up is due once its date
/// has passed. Terminal statuses never carry a `follow_up_at`, so they never
/// show as overdue.
#[tauri::command]
pub async fn db_pipeline_cards(db: State<'_, Db>) -> Result<Vec<PipelineCard>, String> {
    db_pipeline_cards_core(&db.pool).await
}

async fn db_pipeline_cards_core(pool: &sqlx::SqlitePool) -> Result<Vec<PipelineCard>, String> {
    sqlx::query_as::<_, PipelineCard>(
        "SELECT
           a.id, a.job_id, a.status, a.applied_at, a.follow_up_at,
           (a.follow_up_at IS NOT NULL AND a.follow_up_at < date('now')) AS overdue,
           a.updated_at,
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
    .fetch_all(pool)
    .await
    .map_err(|e| format!("db_pipeline_cards: {e}"))
}

async fn fetch_application(pool: &sqlx::SqlitePool, id: i64) -> Result<Application, String> {
    sqlx::query_as::<_, Application>("SELECT * FROM applications WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("fetch_application: {e}"))
}

#[cfg(test)]
mod followup_tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::SqlitePool;

    fn uuid_ish() -> u64 {
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        COUNTER.fetch_add(1, Ordering::Relaxed)
    }

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .expect("open in-memory sqlite");
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("run migrations");
        pool
    }

    async fn insert_job_and_application(pool: &SqlitePool) -> i64 {
        let jd_hash = format!("hash-{}", uuid_ish());
        let job_id: i64 = sqlx::query_scalar(
            "INSERT INTO jobs (jd_text, jd_hash, created_at) VALUES ('jd', ?, datetime('now')) RETURNING id",
        )
        .bind(&jd_hash)
        .fetch_one(pool)
        .await
        .expect("insert job");

        sqlx::query_scalar(
            "INSERT INTO applications (job_id, status, updated_at)
             VALUES (?, 'saved', datetime('now')) RETURNING id",
        )
        .bind(job_id)
        .fetch_one(pool)
        .await
        .expect("insert application")
    }

    /// Moving into `applied` sets follow_up_at = today + settings cadence
    /// (default 7 days), read straight from the settings row — 0 tokens.
    #[tokio::test]
    async fn applied_sets_follow_up_at_from_apply_cadence() {
        let pool = test_pool().await;
        let id = insert_job_and_application(&pool).await;

        let app = db_set_application_status_core(id, "applied".to_string(), &pool)
            .await
            .expect("set status");

        let expected: String = sqlx::query_scalar("SELECT date('now', '+7 days')")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(app.follow_up_at.as_deref(), Some(expected.as_str()));
        assert!(app.applied_at.is_some());
    }

    /// Moving into `interview` uses the interview cadence (default 5 days),
    /// independent of the apply cadence.
    #[tokio::test]
    async fn interview_sets_follow_up_at_from_interview_cadence() {
        let pool = test_pool().await;
        let id = insert_job_and_application(&pool).await;

        let app = db_set_application_status_core(id, "interview".to_string(), &pool)
            .await
            .expect("set status");

        let expected: String = sqlx::query_scalar("SELECT date('now', '+5 days')")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(app.follow_up_at.as_deref(), Some(expected.as_str()));
    }

    /// A custom cadence in settings is honored (not the hardcoded default).
    #[tokio::test]
    async fn custom_cadence_is_honored() {
        let pool = test_pool().await;
        let id = insert_job_and_application(&pool).await;
        sqlx::query("UPDATE settings SET followup_days_after_apply = 2 WHERE id = 1")
            .execute(&pool)
            .await
            .unwrap();

        let app = db_set_application_status_core(id, "applied".to_string(), &pool)
            .await
            .expect("set status");

        let expected: String = sqlx::query_scalar("SELECT date('now', '+2 days')")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(app.follow_up_at.as_deref(), Some(expected.as_str()));
    }

    /// A manually-set follow_up_at survives until the user changes status
    /// again — it is never silently recomputed on an unrelated load/reload.
    #[tokio::test]
    async fn manual_override_is_not_clobbered_by_unrelated_reads() {
        let pool = test_pool().await;
        let id = insert_job_and_application(&pool).await;
        db_set_application_status_core(id, "applied".to_string(), &pool)
            .await
            .expect("set status");

        sqlx::query("UPDATE applications SET follow_up_at = '2099-01-01' WHERE id = ?")
            .bind(id)
            .execute(&pool)
            .await
            .unwrap();

        // Plain reads (db_list_applications / db_pipeline_cards path) never
        // touch follow_up_at — only a fresh status transition does.
        let reloaded = fetch_application(&pool, id).await.expect("reload");
        assert_eq!(reloaded.follow_up_at.as_deref(), Some("2099-01-01"));
    }

    /// Terminal statuses (offer/rejected) leave follow_up_at untouched.
    #[tokio::test]
    async fn terminal_status_does_not_set_follow_up_at() {
        let pool = test_pool().await;
        let id = insert_job_and_application(&pool).await;

        let app = db_set_application_status_core(id, "offer".to_string(), &pool)
            .await
            .expect("set status");

        assert!(app.follow_up_at.is_none());
    }

    /// Overdue boundary: a follow_up_at strictly before today is overdue; a
    /// follow_up_at of today or later is not.
    #[tokio::test]
    async fn overdue_boundary_detection() {
        let pool = test_pool().await;
        let overdue_id = insert_job_and_application(&pool).await;
        let due_today_id = insert_job_and_application(&pool).await;
        let future_id = insert_job_and_application(&pool).await;

        sqlx::query("UPDATE applications SET status = 'applied', follow_up_at = date('now', '-1 day') WHERE id = ?")
            .bind(overdue_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "UPDATE applications SET status = 'applied', follow_up_at = date('now') WHERE id = ?",
        )
        .bind(due_today_id)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("UPDATE applications SET status = 'applied', follow_up_at = date('now', '+1 day') WHERE id = ?")
            .bind(future_id)
            .execute(&pool)
            .await
            .unwrap();

        let cards = db_pipeline_cards_core(&pool).await.expect("cards");
        let overdue = |id: i64| cards.iter().find(|c| c.id == id).unwrap().overdue;
        assert!(overdue(overdue_id));
        assert!(!overdue(due_today_id));
        assert!(!overdue(future_id));
    }
}
