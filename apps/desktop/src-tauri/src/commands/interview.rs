// Interview stages: a free-form, ordered list per application. Every real
// hiring process looks different, so this is deliberately NOT a fixed
// template — stage_type is only a coarse category for future AI prep-
// generation routing, stage_label is the free-text name the user actually
// sees everywhere.
//
// Status lifecycle (app-level enum, no DB CHECK constraint — `status` is
// plain TEXT in the schema):
//   scheduled | awaiting_scheduling | awaiting_response | passed | rejected
//   | cancelled
//
// Rejection is terminal at ANY stage (not just the last one) and syncs the
// parent application's kanban status via the SAME db_set_application_status
// core used by drag-and-drop and the quick-view modal — no second
// status-update path. `cancelled` never triggers this sync.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

use crate::commands::applications::db_set_application_status_core;
use crate::db::Db;

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct InterviewStage {
    pub id: i64,
    pub application_id: i64,
    pub stage_order: i64,
    pub stage_type: String,
    pub stage_label: String,
    pub scheduled_at: Option<String>,
    pub status: String,
    pub stage_language: Option<String>,
    pub interviewer_name: Option<String>,
    pub interviewer_role: Option<String>,
    pub interviewer_email: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInterviewStageInput {
    pub application_id: i64,
    pub stage_order: i64,
    pub stage_type: String,
    pub stage_label: String,
    pub scheduled_at: Option<String>,
    pub stage_language: Option<String>,
    pub interviewer_name: Option<String>,
    pub interviewer_role: Option<String>,
    pub interviewer_email: Option<String>,
    pub notes: Option<String>,
}

/// A new stage's status is derived, not chosen: a confirmed date means
/// `scheduled`, no date yet means `awaiting_scheduling`.
#[tauri::command]
pub async fn create_interview_stage(
    input: CreateInterviewStageInput,
    db: State<'_, Db>,
) -> Result<InterviewStage, String> {
    create_interview_stage_core(input, &db.pool).await
}

async fn create_interview_stage_core(
    input: CreateInterviewStageInput,
    pool: &SqlitePool,
) -> Result<InterviewStage, String> {
    let status = if input.scheduled_at.as_deref().unwrap_or("").is_empty() {
        "awaiting_scheduling"
    } else {
        "scheduled"
    };

    let id = sqlx::query(
        "INSERT INTO interview_stages
           (application_id, stage_order, stage_type, stage_label, scheduled_at, status,
            stage_language, interviewer_name, interviewer_role, interviewer_email, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(input.application_id)
    .bind(input.stage_order)
    .bind(&input.stage_type)
    .bind(&input.stage_label)
    .bind(&input.scheduled_at)
    .bind(status)
    .bind(&input.stage_language)
    .bind(&input.interviewer_name)
    .bind(&input.interviewer_role)
    .bind(&input.interviewer_email)
    .bind(&input.notes)
    .execute(pool)
    .await
    .map_err(|e| format!("create_interview_stage: {e}"))?
    .last_insert_rowid();

    fetch_stage(pool, id).await
}

/// Partial patch — every field but `stageId` is optional; an absent field
/// keeps its current value. When the merged status becomes `rejected` (and
/// wasn't already), this reuses db_set_application_status_core to move the
/// parent application to `rejected` and write status_history — the exact
/// same path drag-and-drop and the quick-view modal use.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInterviewStageInput {
    pub stage_id: i64,
    pub stage_order: Option<i64>,
    pub stage_type: Option<String>,
    pub stage_label: Option<String>,
    pub scheduled_at: Option<String>,
    pub status: Option<String>,
    pub stage_language: Option<String>,
    pub interviewer_name: Option<String>,
    pub interviewer_role: Option<String>,
    pub interviewer_email: Option<String>,
    pub notes: Option<String>,
}

#[tauri::command]
pub async fn update_interview_stage(
    input: UpdateInterviewStageInput,
    db: State<'_, Db>,
) -> Result<InterviewStage, String> {
    update_interview_stage_core(input, &db.pool).await
}

async fn update_interview_stage_core(
    input: UpdateInterviewStageInput,
    pool: &SqlitePool,
) -> Result<InterviewStage, String> {
    let existing = fetch_stage(pool, input.stage_id).await?;

    let stage_order = input.stage_order.unwrap_or(existing.stage_order);
    let stage_type = input.stage_type.unwrap_or(existing.stage_type);
    let stage_label = input.stage_label.unwrap_or(existing.stage_label);
    let scheduled_at = input.scheduled_at.or(existing.scheduled_at);
    let new_status = input.status.unwrap_or_else(|| existing.status.clone());
    let stage_language = input.stage_language.or(existing.stage_language);
    let interviewer_name = input.interviewer_name.or(existing.interviewer_name);
    let interviewer_role = input.interviewer_role.or(existing.interviewer_role);
    let interviewer_email = input.interviewer_email.or(existing.interviewer_email);
    let notes = input.notes.or(existing.notes);

    sqlx::query(
        "UPDATE interview_stages SET
           stage_order = ?, stage_type = ?, stage_label = ?, scheduled_at = ?, status = ?,
           stage_language = ?, interviewer_name = ?, interviewer_role = ?,
           interviewer_email = ?, notes = ?
         WHERE id = ?",
    )
    .bind(stage_order)
    .bind(&stage_type)
    .bind(&stage_label)
    .bind(&scheduled_at)
    .bind(&new_status)
    .bind(&stage_language)
    .bind(&interviewer_name)
    .bind(&interviewer_role)
    .bind(&interviewer_email)
    .bind(&notes)
    .bind(input.stage_id)
    .execute(pool)
    .await
    .map_err(|e| format!("update_interview_stage: {e}"))?;

    if new_status == "rejected" && existing.status != "rejected" {
        db_set_application_status_core(existing.application_id, "rejected".to_string(), pool)
            .await?;
    }

    fetch_stage(pool, input.stage_id).await
}

#[tauri::command]
pub async fn delete_interview_stage(stage_id: i64, db: State<'_, Db>) -> Result<(), String> {
    delete_interview_stage_core(stage_id, &db.pool).await
}

async fn delete_interview_stage_core(stage_id: i64, pool: &SqlitePool) -> Result<(), String> {
    sqlx::query("DELETE FROM interview_stages WHERE id = ?")
        .bind(stage_id)
        .execute(pool)
        .await
        .map_err(|e| format!("delete_interview_stage: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn list_interview_stages(
    application_id: i64,
    db: State<'_, Db>,
) -> Result<Vec<InterviewStage>, String> {
    list_interview_stages_core(application_id, &db.pool).await
}

async fn list_interview_stages_core(
    application_id: i64,
    pool: &SqlitePool,
) -> Result<Vec<InterviewStage>, String> {
    sqlx::query_as::<_, InterviewStage>(
        "SELECT * FROM interview_stages WHERE application_id = ? ORDER BY stage_order ASC, id ASC",
    )
    .bind(application_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("list_interview_stages: {e}"))
}

async fn fetch_stage(pool: &SqlitePool, id: i64) -> Result<InterviewStage, String> {
    sqlx::query_as::<_, InterviewStage>("SELECT * FROM interview_stages WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("fetch_stage: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

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

    fn counter() -> u64 {
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        COUNTER.fetch_add(1, Ordering::Relaxed)
    }

    async fn insert_job_and_application(pool: &SqlitePool, status: &str) -> i64 {
        let jd_hash = format!("hash-{}", counter());
        let job_id: i64 = sqlx::query_scalar(
            "INSERT INTO jobs (jd_text, jd_hash, created_at) VALUES ('jd', ?, datetime('now')) RETURNING id",
        )
        .bind(&jd_hash)
        .fetch_one(pool)
        .await
        .expect("insert job");

        sqlx::query_scalar(
            "INSERT INTO applications (job_id, status, updated_at)
             VALUES (?, ?, datetime('now')) RETURNING id",
        )
        .bind(job_id)
        .bind(status)
        .fetch_one(pool)
        .await
        .expect("insert application")
    }

    fn create_input(
        application_id: i64,
        stage_order: i64,
        label: &str,
        scheduled_at: Option<&str>,
    ) -> CreateInterviewStageInput {
        CreateInterviewStageInput {
            application_id,
            stage_order,
            stage_type: "hr_screen".into(),
            stage_label: label.into(),
            scheduled_at: scheduled_at.map(String::from),
            stage_language: None,
            interviewer_name: None,
            interviewer_role: None,
            interviewer_email: None,
            notes: None,
        }
    }

    /// No date => awaiting_scheduling; a confirmed date => scheduled. Status
    /// is derived, the caller never passes it directly on create.
    #[tokio::test]
    async fn create_derives_status_from_scheduled_at() {
        let pool = test_pool().await;
        let app_id = insert_job_and_application(&pool, "interview").await;

        let no_date =
            create_interview_stage_core(create_input(app_id, 1, "Recruiter screen", None), &pool)
                .await
                .expect("create");
        assert_eq!(no_date.status, "awaiting_scheduling");

        let with_date = create_interview_stage_core(
            create_input(app_id, 2, "Technical round", Some("2026-08-01")),
            &pool,
        )
        .await
        .expect("create");
        assert_eq!(with_date.status, "scheduled");
    }

    /// Rejecting an EARLY stage (not the last one added) still syncs the
    /// parent application to rejected — the sync isn't gated on stage_order
    /// being the max.
    #[tokio::test]
    async fn rejecting_early_stage_syncs_application_status() {
        let pool = test_pool().await;
        let app_id = insert_job_and_application(&pool, "interview").await;
        let stage_1 = create_interview_stage_core(create_input(app_id, 1, "Screen", None), &pool)
            .await
            .unwrap();
        create_interview_stage_core(create_input(app_id, 2, "Technical", None), &pool)
            .await
            .unwrap();
        create_interview_stage_core(create_input(app_id, 3, "Final", None), &pool)
            .await
            .unwrap();

        update_interview_stage_core(
            UpdateInterviewStageInput {
                stage_id: stage_1.id,
                stage_order: None,
                stage_type: None,
                stage_label: None,
                scheduled_at: None,
                status: Some("rejected".into()),
                stage_language: None,
                interviewer_name: None,
                interviewer_role: None,
                interviewer_email: None,
                notes: None,
            },
            &pool,
        )
        .await
        .expect("update");

        let app_status: String = sqlx::query_scalar("SELECT status FROM applications WHERE id = ?")
            .bind(app_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(app_status, "rejected");

        let history_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM status_history WHERE application_id = ? AND status = 'rejected'",
        )
        .bind(app_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(history_count, 1);
    }

    /// cancelled never touches the parent application's status.
    #[tokio::test]
    async fn cancelling_a_stage_does_not_sync_application_status() {
        let pool = test_pool().await;
        let app_id = insert_job_and_application(&pool, "interview").await;
        let stage = create_interview_stage_core(create_input(app_id, 1, "Screen", None), &pool)
            .await
            .unwrap();

        update_interview_stage_core(
            UpdateInterviewStageInput {
                stage_id: stage.id,
                stage_order: None,
                stage_type: None,
                stage_label: None,
                scheduled_at: None,
                status: Some("cancelled".into()),
                stage_language: None,
                interviewer_name: None,
                interviewer_role: None,
                interviewer_email: None,
                notes: None,
            },
            &pool,
        )
        .await
        .expect("update");

        let app_status: String = sqlx::query_scalar("SELECT status FROM applications WHERE id = ?")
            .bind(app_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(app_status, "interview");
    }

    /// Partial update only touches the fields provided — everything else
    /// (label, type, interviewer info) survives untouched.
    #[tokio::test]
    async fn partial_update_only_changes_provided_fields() {
        let pool = test_pool().await;
        let app_id = insert_job_and_application(&pool, "interview").await;
        let stage = create_interview_stage_core(create_input(app_id, 1, "Screen", None), &pool)
            .await
            .unwrap();

        let updated = update_interview_stage_core(
            UpdateInterviewStageInput {
                stage_id: stage.id,
                stage_order: Some(2),
                stage_type: None,
                stage_label: None,
                scheduled_at: None,
                status: None,
                stage_language: None,
                interviewer_name: None,
                interviewer_role: None,
                interviewer_email: None,
                notes: None,
            },
            &pool,
        )
        .await
        .expect("update");

        assert_eq!(updated.stage_order, 2);
        assert_eq!(updated.stage_label, "Screen");
        assert_eq!(updated.stage_type, "hr_screen");
        assert_eq!(updated.status, "awaiting_scheduling");
    }

    #[tokio::test]
    async fn list_orders_by_stage_order_ascending() {
        let pool = test_pool().await;
        let app_id = insert_job_and_application(&pool, "interview").await;
        create_interview_stage_core(create_input(app_id, 2, "Second", None), &pool)
            .await
            .unwrap();
        create_interview_stage_core(create_input(app_id, 1, "First", None), &pool)
            .await
            .unwrap();

        let stages = list_interview_stages_core(app_id, &pool).await.unwrap();
        assert_eq!(
            stages
                .iter()
                .map(|s| s.stage_label.as_str())
                .collect::<Vec<_>>(),
            vec!["First", "Second"]
        );
    }

    #[tokio::test]
    async fn delete_removes_the_stage() {
        let pool = test_pool().await;
        let app_id = insert_job_and_application(&pool, "interview").await;
        let stage = create_interview_stage_core(create_input(app_id, 1, "Screen", None), &pool)
            .await
            .unwrap();

        delete_interview_stage_core(stage.id, &pool)
            .await
            .expect("delete");

        let remaining = list_interview_stages_core(app_id, &pool).await.unwrap();
        assert!(remaining.is_empty());
    }
}
