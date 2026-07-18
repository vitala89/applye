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
    /// Which `document_library` row was used (ROADMAP §16). `cv_path` above
    /// stays the frozen apply-time snapshot and is never rewritten from this.
    pub cv_document_id: Option<i64>,
    pub cover_letter_document_id: Option<i64>,
    pub contract_type: Option<String>,
    pub eor_provider: Option<String>,
    pub doc_language: Option<String>,
    pub notes: Option<String>,
    pub source_url: Option<String>,
    pub contact_name: Option<String>,
    pub contact_role: Option<String>,
    pub contact_channel: Option<String>,
    pub next_action: Option<String>,
    pub next_action_at: Option<String>,
    pub salary_range: Option<String>,
    pub priority: Option<String>,
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
    /// Which `document_library` doc this application uses. Persisted with
    /// COALESCE so a caller that omits them (a minimal status/tracker upsert)
    /// never wipes an existing link - only an explicit id changes it.
    pub cv_document_id: Option<i64>,
    pub cover_letter_document_id: Option<i64>,
    pub contract_type: Option<String>,
    pub eor_provider: Option<String>,
    pub doc_language: Option<String>,
    pub notes: Option<String>,
    pub source_url: Option<String>,
    pub contact_name: Option<String>,
    pub contact_role: Option<String>,
    pub contact_channel: Option<String>,
    pub next_action: Option<String>,
    pub next_action_at: Option<String>,
    pub salary_range: Option<String>,
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
    db_upsert_application_core(application, &db.pool).await
}

pub(crate) async fn db_upsert_application_core(
    application: ApplicationInput,
    pool: &sqlx::SqlitePool,
) -> Result<Application, String> {
    let a = &application;
    let id = match a.id {
        Some(id) => {
            sqlx::query(
                "UPDATE applications SET
                   job_id = ?, status = ?, application_method = ?, applied_at = ?,
                   follow_up_at = ?, cv_path = ?, cover_letter_path = ?,
                   cv_document_id = COALESCE(?, cv_document_id),
                   cover_letter_document_id = COALESCE(?, cover_letter_document_id),
                   contract_type = ?,
                   eor_provider = ?, doc_language = ?, notes = ?,
                   source_url = ?, contact_name = ?, contact_role = ?, contact_channel = ?,
                   next_action = ?, next_action_at = ?, salary_range = ?,
                   updated_at = datetime('now')
                 WHERE id = ?",
            )
            .bind(a.job_id)
            .bind(&a.status)
            .bind(&a.application_method)
            .bind(&a.applied_at)
            .bind(&a.follow_up_at)
            .bind(&a.cv_path)
            .bind(&a.cover_letter_path)
            .bind(a.cv_document_id)
            .bind(a.cover_letter_document_id)
            .bind(&a.contract_type)
            .bind(&a.eor_provider)
            .bind(&a.doc_language)
            .bind(&a.notes)
            .bind(&a.source_url)
            .bind(&a.contact_name)
            .bind(&a.contact_role)
            .bind(&a.contact_channel)
            .bind(&a.next_action)
            .bind(&a.next_action_at)
            .bind(&a.salary_range)
            .bind(id)
            .execute(pool)
            .await
            .map_err(|e| format!("db_upsert_application (update): {e}"))?;
            id
        }
        None => {
            let res = sqlx::query(
                "INSERT INTO applications
                   (job_id, status, application_method, applied_at, follow_up_at, cv_path,
                    cover_letter_path, cv_document_id, cover_letter_document_id,
                    contract_type, eor_provider, doc_language, notes,
                    source_url, contact_name, contact_role, contact_channel,
                    next_action, next_action_at, salary_range, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
            )
            .bind(a.job_id)
            .bind(&a.status)
            .bind(&a.application_method)
            .bind(&a.applied_at)
            .bind(&a.follow_up_at)
            .bind(&a.cv_path)
            .bind(&a.cover_letter_path)
            .bind(a.cv_document_id)
            .bind(a.cover_letter_document_id)
            .bind(&a.contract_type)
            .bind(&a.eor_provider)
            .bind(&a.doc_language)
            .bind(&a.notes)
            .bind(&a.source_url)
            .bind(&a.contact_name)
            .bind(&a.contact_role)
            .bind(&a.contact_channel)
            .bind(&a.next_action)
            .bind(&a.next_action_at)
            .bind(&a.salary_range)
            .execute(pool)
            .await
            .map_err(|e| format!("db_upsert_application (insert): {e}"))?;
            res.last_insert_rowid()
        }
    };

    fetch_application(pool, id).await
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

pub(crate) async fn db_set_application_status_core(
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
    pub location: Option<String>,
    pub doc_language: Option<String>,
    pub score: Option<f64>,
    /// The `scoring_cache.profile_hash` the stored `score` was computed against
    /// (equals the `profile.scoring_hash` at scoring time). The dashboard marks
    /// a score stale when this no longer equals the current profile's hash.
    pub score_profile_hash: Option<String>,
    /// When that cached score was created — powers the dashboard "N days old"
    /// staleness badge.
    pub score_at: Option<String>,
    pub priority: Option<String>,
    pub current_stage_order: Option<i64>,
    pub current_stage_label: Option<String>,
    pub current_stage_status: Option<String>,
    pub current_stage_scheduled_at: Option<String>,
    /// Total interview stages logged for this application — powers the card's
    /// "stage N of M" progress track. `current_stage_order` is the position.
    pub current_stage_total: Option<i64>,
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
           a.updated_at, a.priority, a.doc_language,
           j.company, j.title, j.location,
           sc.score,
           sc.profile_hash AS score_profile_hash,
           sc.created_at AS score_at,
           cs.stage_order AS current_stage_order,
           cs.stage_label AS current_stage_label,
           cs.status AS current_stage_status,
           cs.scheduled_at AS current_stage_scheduled_at,
           (SELECT COUNT(*) FROM interview_stages s2 WHERE s2.application_id = a.id)
             AS current_stage_total
         FROM applications a
         LEFT JOIN jobs j ON a.job_id = j.id
         LEFT JOIN (
           SELECT job_id, MAX(id) AS max_id FROM scoring_cache GROUP BY job_id
         ) latest ON latest.job_id = j.id
         LEFT JOIN scoring_cache sc ON sc.id = latest.max_id
         LEFT JOIN interview_stages cs ON cs.id = (
           SELECT s.id FROM interview_stages s
           WHERE s.application_id = a.id
           ORDER BY
             CASE WHEN s.status NOT IN ('rejected', 'cancelled') THEN 0 ELSE 1 END ASC,
             s.stage_order DESC
           LIMIT 1
         )
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

/// Patch payload for the Job Tracker's inline edit — only the tracker fields
/// the screen lets the user edit directly (contact, next action, salary,
/// notes). Deliberately narrower than `ApplicationInput`: a full upsert would
/// silently null out `cv_path` / `cover_letter_path` / `doc_language` /
/// `application_method` etc. since the Tracker table doesn't carry them.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationTrackerFieldsInput {
    pub id: i64,
    pub contact_name: Option<String>,
    pub contact_role: Option<String>,
    pub contact_channel: Option<String>,
    pub next_action: Option<String>,
    pub next_action_at: Option<String>,
    pub salary_range: Option<String>,
    pub notes: Option<String>,
    /// JSON blob of custom-column values ({ "<colId>": "<value>" }). When None,
    /// the existing value is kept (COALESCE), so a normal edit never wipes it.
    pub custom_fields: Option<String>,
}

#[tauri::command]
pub async fn db_update_application_tracker_fields(
    input: ApplicationTrackerFieldsInput,
    db: State<'_, Db>,
) -> Result<Application, String> {
    db_update_application_tracker_fields_core(input, &db.pool).await
}

async fn db_update_application_tracker_fields_core(
    input: ApplicationTrackerFieldsInput,
    pool: &sqlx::SqlitePool,
) -> Result<Application, String> {
    sqlx::query(
        "UPDATE applications SET
           contact_name = ?, contact_role = ?, contact_channel = ?,
           next_action = ?, next_action_at = ?, salary_range = ?, notes = ?,
           custom_fields = COALESCE(?, custom_fields),
           updated_at = datetime('now')
         WHERE id = ?",
    )
    .bind(&input.contact_name)
    .bind(&input.contact_role)
    .bind(&input.contact_channel)
    .bind(&input.next_action)
    .bind(&input.next_action_at)
    .bind(&input.salary_range)
    .bind(&input.notes)
    .bind(&input.custom_fields)
    .bind(input.id)
    .execute(pool)
    .await
    .map_err(|e| format!("db_update_application_tracker_fields: {e}"))?;

    fetch_application(pool, input.id).await
}

/// Pipeline quick-view priority flag — a different concept from the
/// deterministic legitimacy tier: this is the user's own triage signal.
#[tauri::command]
pub async fn set_application_priority(
    application_id: i64,
    priority: Option<String>,
    db: State<'_, Db>,
) -> Result<Application, String> {
    if let Some(p) = &priority {
        if !matches!(p.as_str(), "low" | "medium" | "high") {
            return Err(format!("invalid priority: {p}"));
        }
    }
    sqlx::query("UPDATE applications SET priority = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(&priority)
        .bind(application_id)
        .execute(&db.pool)
        .await
        .map_err(|e| format!("set_application_priority: {e}"))?;

    fetch_application(&db.pool, application_id).await
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: i64,
    pub application_id: i64,
    pub comment_text: String,
    pub created_at: String,
}

#[tauri::command]
pub async fn add_application_comment(
    application_id: i64,
    comment_text: String,
    db: State<'_, Db>,
) -> Result<Comment, String> {
    let id = sqlx::query(
        "INSERT INTO application_comments (application_id, comment_text, created_at)
         VALUES (?, ?, datetime('now'))",
    )
    .bind(application_id)
    .bind(&comment_text)
    .execute(&db.pool)
    .await
    .map_err(|e| format!("add_application_comment: {e}"))?
    .last_insert_rowid();

    sqlx::query_as::<_, Comment>("SELECT * FROM application_comments WHERE id = ?")
        .bind(id)
        .fetch_one(&db.pool)
        .await
        .map_err(|e| format!("add_application_comment (reload): {e}"))
}

/// Oldest → newest, for the quick-view comment feed.
#[tauri::command]
pub async fn list_application_comments(
    application_id: i64,
    db: State<'_, Db>,
) -> Result<Vec<Comment>, String> {
    sqlx::query_as::<_, Comment>(
        "SELECT * FROM application_comments WHERE application_id = ? ORDER BY id ASC",
    )
    .bind(application_id)
    .fetch_all(&db.pool)
    .await
    .map_err(|e| format!("list_application_comments: {e}"))
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

    fn app_input(
        job_id: i64,
        cv_document_id: Option<i64>,
        cover_letter_document_id: Option<i64>,
    ) -> ApplicationInput {
        ApplicationInput {
            id: None,
            job_id,
            status: "saved".to_string(),
            application_method: None,
            applied_at: None,
            follow_up_at: None,
            cv_path: None,
            cover_letter_path: None,
            cv_document_id,
            cover_letter_document_id,
            contract_type: None,
            eor_provider: None,
            doc_language: None,
            notes: None,
            source_url: None,
            contact_name: None,
            contact_role: None,
            contact_channel: None,
            next_action: None,
            next_action_at: None,
            salary_range: None,
        }
    }

    /// Regression: the apply wizard links a generated CV / cover letter to the
    /// application through `db_upsert_application`. The doc-id columns must
    /// actually persist - they were silently dropped before (missing from the
    /// input struct + SQL), so the freshly-shown "Review" button reverted to
    /// "Generate" a moment later and one-doc-per-job minted duplicates. A later
    /// minimal upsert that omits the ids must not wipe the link (COALESCE).
    #[tokio::test]
    async fn upsert_persists_and_preserves_document_ids() {
        let pool = test_pool().await;
        let job_id: i64 = sqlx::query_scalar(
            "INSERT INTO jobs (jd_text, jd_hash, created_at) VALUES ('jd', ?, datetime('now')) RETURNING id",
        )
        .bind(format!("hash-{}", uuid_ish()))
        .fetch_one(&pool)
        .await
        .expect("insert job");

        let cv_doc: i64 = sqlx::query_scalar(
            "INSERT INTO document_library (doc_type, source, created_at, updated_at)
             VALUES ('cv', 'generated', datetime('now'), datetime('now')) RETURNING id",
        )
        .fetch_one(&pool)
        .await
        .expect("insert cv doc");

        let created = db_upsert_application_core(app_input(job_id, Some(cv_doc), None), &pool)
            .await
            .expect("insert application");
        assert_eq!(
            created.cv_document_id,
            Some(cv_doc),
            "the linked CV id must persist to the applications row"
        );

        let mut minimal = app_input(job_id, None, None);
        minimal.id = Some(created.id);
        minimal.status = "applied".to_string();
        let updated = db_upsert_application_core(minimal, &pool)
            .await
            .expect("update application");
        assert_eq!(
            updated.cv_document_id,
            Some(cv_doc),
            "omitting the doc id on a later upsert must not clear the existing link"
        );
        assert_eq!(updated.status.as_deref(), Some("applied"));
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

    /// The Job Tracker inline-edit patch writes only the 7 tracker fields —
    /// it must never null out cv_path/cover_letter_path/application_method,
    /// which the Tracker table doesn't carry and would otherwise clobber.
    #[tokio::test]
    async fn tracker_fields_patch_never_clobbers_unrelated_columns() {
        let pool = test_pool().await;
        let id = insert_job_and_application(&pool).await;
        sqlx::query(
            "UPDATE applications SET
               cv_path = 'cv.pdf', cover_letter_path = 'cl.pdf',
               application_method = 'email', contract_type = 'permanent'
             WHERE id = ?",
        )
        .bind(id)
        .execute(&pool)
        .await
        .unwrap();

        let patched = db_update_application_tracker_fields_core(
            ApplicationTrackerFieldsInput {
                id,
                contact_name: Some("Jane Doe".to_string()),
                contact_role: Some("Recruiter".to_string()),
                contact_channel: Some("jane@acme.example".to_string()),
                next_action: Some("Follow up".to_string()),
                next_action_at: Some("2026-07-10".to_string()),
                salary_range: Some("70-80k EUR".to_string()),
                notes: Some("Great call".to_string()),
                custom_fields: None,
            },
            &pool,
        )
        .await
        .expect("patch tracker fields");

        assert_eq!(patched.contact_name.as_deref(), Some("Jane Doe"));
        assert_eq!(patched.salary_range.as_deref(), Some("70-80k EUR"));
        // Fields the Tracker screen never sends must survive untouched.
        assert_eq!(patched.cv_path.as_deref(), Some("cv.pdf"));
        assert_eq!(patched.cover_letter_path.as_deref(), Some("cl.pdf"));
        assert_eq!(patched.application_method.as_deref(), Some("email"));
        assert_eq!(patched.contract_type.as_deref(), Some("permanent"));
    }

    /// `doc_language` must flow through the Pipeline card query so the
    /// follow-up drafting language selector can default to it.
    #[tokio::test]
    async fn pipeline_cards_include_doc_language() {
        let pool = test_pool().await;
        let id = insert_job_and_application(&pool).await;
        sqlx::query("UPDATE applications SET doc_language = 'de' WHERE id = ?")
            .bind(id)
            .execute(&pool)
            .await
            .unwrap();

        let cards = db_pipeline_cards_core(&pool).await.expect("list cards");
        let card = cards.into_iter().find(|c| c.id == id).expect("card exists");
        assert_eq!(card.doc_language.as_deref(), Some("de"));
    }

    /// The latest cached score's `profile_hash` and `created_at` must surface on
    /// the card so the Dashboard can mark a score stale (its hash no longer
    /// matches the current profile) and show how old it is.
    #[tokio::test]
    async fn pipeline_cards_include_score_profile_hash_and_age() {
        let pool = test_pool().await;
        let id = insert_job_and_application(&pool).await;
        let job_id: i64 = sqlx::query_scalar("SELECT job_id FROM applications WHERE id = ?")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO scoring_cache (job_id, profile_hash, jd_hash, score, created_at)
             VALUES (?, 'phash-1', 'jd-1', 82.0, '2026-07-01T00:00:00Z')",
        )
        .bind(job_id)
        .execute(&pool)
        .await
        .unwrap();

        let cards = db_pipeline_cards_core(&pool).await.expect("list cards");
        let card = cards.into_iter().find(|c| c.id == id).expect("card exists");
        assert_eq!(card.score, Some(82.0));
        assert_eq!(card.score_profile_hash.as_deref(), Some("phash-1"));
        assert_eq!(card.score_at.as_deref(), Some("2026-07-01T00:00:00Z"));
    }
}
