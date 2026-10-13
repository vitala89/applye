//! Application SQL and row mapping. The workflow in the parent module decides
//! which statement runs; this module does not choose a status transition.

use serde::{Deserialize, Serialize};
use sqlx::{Sqlite, SqlitePool, Transaction};

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
    /// When that cached score was created - powers the dashboard "N days old"
    /// staleness badge.
    pub score_at: Option<String>,
    pub priority: Option<String>,
    pub current_stage_order: Option<i64>,
    pub current_stage_label: Option<String>,
    pub current_stage_status: Option<String>,
    pub current_stage_scheduled_at: Option<String>,
    /// Total interview stages logged for this application - powers the card's
    /// "stage N of M" progress track. `current_stage_order` is the position.
    pub current_stage_total: Option<i64>,
}

/// Patch payload for the Job Tracker's inline edit - only the tracker fields
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

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: i64,
    pub application_id: i64,
    pub comment_text: String,
    pub created_at: String,
}

pub(crate) async fn list(pool: &SqlitePool) -> Result<Vec<Application>, String> {
    sqlx::query_as::<_, Application>("SELECT * FROM applications ORDER BY updated_at DESC, id DESC")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("db_list_applications: {e}"))
}

pub(crate) async fn upsert(
    application: ApplicationInput,
    pool: &SqlitePool,
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

    fetch(pool, id).await
}

pub(crate) async fn mark_applied(
    tx: &mut Transaction<'_, Sqlite>,
    id: i64,
    status: &str,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE applications SET
           status = ?,
           applied_at = COALESCE(applied_at, date('now')),
           follow_up_at = date('now', '+' || COALESCE(
             (SELECT followup_days_after_apply FROM settings WHERE id = 1), 7) || ' days'),
           updated_at = datetime('now')
         WHERE id = ?",
    )
    .bind(status)
    .bind(id)
    .execute(&mut **tx)
    .await
    .map_err(|e| format!("db_set_application_status (update): {e}"))?;
    Ok(())
}

pub(crate) async fn mark_interview(
    tx: &mut Transaction<'_, Sqlite>,
    id: i64,
    status: &str,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE applications SET
           status = ?,
           follow_up_at = date('now', '+' || COALESCE(
             (SELECT followup_days_after_interview FROM settings WHERE id = 1), 5) || ' days'),
           updated_at = datetime('now')
         WHERE id = ?",
    )
    .bind(status)
    .bind(id)
    .execute(&mut **tx)
    .await
    .map_err(|e| format!("db_set_application_status (update): {e}"))?;
    Ok(())
}

pub(crate) async fn mark_other_status(
    tx: &mut Transaction<'_, Sqlite>,
    id: i64,
    status: &str,
) -> Result<(), String> {
    sqlx::query("UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(status)
        .bind(id)
        .execute(&mut **tx)
        .await
        .map_err(|e| format!("db_set_application_status (update): {e}"))?;
    Ok(())
}

pub(crate) async fn append_status_history(
    tx: &mut Transaction<'_, Sqlite>,
    id: i64,
    status: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO status_history (application_id, status, changed_at)
         VALUES (?, ?, datetime('now'))",
    )
    .bind(id)
    .bind(status)
    .execute(&mut **tx)
    .await
    .map_err(|e| format!("db_set_application_status (history): {e}"))?;
    Ok(())
}

pub(crate) async fn fetch(pool: &SqlitePool, id: i64) -> Result<Application, String> {
    sqlx::query_as::<_, Application>("SELECT * FROM applications WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("fetch_application: {e}"))
}

/// `overdue` is computed in SQL (0 tokens): a follow-up is due once its date
/// has passed. Terminal statuses never carry a `follow_up_at`, so they never
/// show as overdue.
pub(crate) async fn pipeline_cards(pool: &SqlitePool) -> Result<Vec<PipelineCard>, String> {
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

pub(crate) async fn update_tracker_fields(
    input: ApplicationTrackerFieldsInput,
    pool: &SqlitePool,
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

    fetch(pool, input.id).await
}

pub(crate) async fn set_priority(
    application_id: i64,
    priority: Option<String>,
    pool: &SqlitePool,
) -> Result<Application, String> {
    sqlx::query("UPDATE applications SET priority = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(&priority)
        .bind(application_id)
        .execute(pool)
        .await
        .map_err(|e| format!("set_application_priority: {e}"))?;

    fetch(pool, application_id).await
}

pub(crate) async fn add_comment(
    application_id: i64,
    comment_text: String,
    pool: &SqlitePool,
) -> Result<Comment, String> {
    let id = sqlx::query(
        "INSERT INTO application_comments (application_id, comment_text, created_at)
         VALUES (?, ?, datetime('now'))",
    )
    .bind(application_id)
    .bind(&comment_text)
    .execute(pool)
    .await
    .map_err(|e| format!("add_application_comment: {e}"))?
    .last_insert_rowid();

    sqlx::query_as::<_, Comment>("SELECT * FROM application_comments WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("add_application_comment (reload): {e}"))
}

pub(crate) async fn list_comments(
    application_id: i64,
    pool: &SqlitePool,
) -> Result<Vec<Comment>, String> {
    sqlx::query_as::<_, Comment>(
        "SELECT * FROM application_comments WHERE application_id = ? ORDER BY id ASC",
    )
    .bind(application_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("list_application_comments: {e}"))
}
