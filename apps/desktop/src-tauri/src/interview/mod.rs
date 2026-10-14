//! Interview workflow: stage lifecycle, prep-card batches, and the one place
//! a rejected stage moves the parent application.

mod domain;
mod persistence;

use sqlx::SqlitePool;

pub use persistence::{
    CreateInterviewStageInput, InterviewPrepCard, InterviewStage, SaveInterviewPrepBatchInput,
    UpdateInterviewStageInput,
};

pub(crate) async fn create_stage(
    input: CreateInterviewStageInput,
    pool: &SqlitePool,
) -> Result<InterviewStage, String> {
    let status = domain::initial_stage_status(input.scheduled_at.as_deref());
    let id = persistence::insert_stage(&input, status, pool).await?;
    persistence::fetch_stage(pool, id).await
}

pub(crate) async fn update_stage(
    input: UpdateInterviewStageInput,
    pool: &SqlitePool,
) -> Result<InterviewStage, String> {
    let existing = persistence::fetch_stage(pool, input.stage_id).await?;

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

    persistence::update_stage(
        input.stage_id,
        persistence::StageUpdate {
            stage_order,
            stage_type: &stage_type,
            stage_label: &stage_label,
            scheduled_at: &scheduled_at,
            status: &new_status,
            stage_language: &stage_language,
            interviewer_name: &interviewer_name,
            interviewer_role: &interviewer_role,
            interviewer_email: &interviewer_email,
            notes: &notes,
        },
        pool,
    )
    .await?;

    if domain::rejection_propagates_to_application(&existing.status, &new_status) {
        crate::applications::set_status(existing.application_id, "rejected".to_string(), pool)
            .await?;
    }

    persistence::fetch_stage(pool, input.stage_id).await
}

pub(crate) async fn delete_stage(stage_id: i64, pool: &SqlitePool) -> Result<(), String> {
    persistence::delete_stage(stage_id, pool).await
}

pub(crate) async fn list_stages(
    application_id: i64,
    pool: &SqlitePool,
) -> Result<Vec<InterviewStage>, String> {
    persistence::list_stages(application_id, pool).await
}

pub(crate) async fn list_prep(
    stage_id: i64,
    pool: &SqlitePool,
) -> Result<Vec<InterviewPrepCard>, String> {
    persistence::list_prep(stage_id, pool).await
}

pub(crate) async fn save_prep_batch(
    input: SaveInterviewPrepBatchInput,
    pool: &SqlitePool,
) -> Result<Vec<InterviewPrepCard>, String> {
    let mut ids = Vec::with_capacity(input.cards.len());
    for card in &input.cards {
        ids.push(persistence::insert_prep_card(&input, card, pool).await?);
    }

    let mut cards = Vec::with_capacity(ids.len());
    for id in ids {
        cards.push(persistence::fetch_prep_card(pool, id).await?);
    }
    Ok(cards)
}

#[cfg(test)]
mod tests {
    use super::persistence::NewPrepCardInput;
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

        let no_date = create_stage(create_input(app_id, 1, "Recruiter screen", None), &pool)
            .await
            .expect("create");
        assert_eq!(no_date.status, "awaiting_scheduling");

        let with_date = create_stage(
            create_input(app_id, 2, "Technical round", Some("2026-08-01")),
            &pool,
        )
        .await
        .expect("create");
        assert_eq!(with_date.status, "scheduled");
    }

    /// Rejecting an EARLY stage (not the last one added) still syncs the
    /// parent application to rejected - the sync isn't gated on stage_order
    /// being the max.
    #[tokio::test]
    async fn rejecting_early_stage_syncs_application_status() {
        let pool = test_pool().await;
        let app_id = insert_job_and_application(&pool, "interview").await;
        let stage_1 = create_stage(create_input(app_id, 1, "Screen", None), &pool)
            .await
            .unwrap();
        create_stage(create_input(app_id, 2, "Technical", None), &pool)
            .await
            .unwrap();
        create_stage(create_input(app_id, 3, "Final", None), &pool)
            .await
            .unwrap();

        update_stage(
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

        let follow_up_at: Option<String> =
            sqlx::query_scalar("SELECT follow_up_at FROM applications WHERE id = ?")
                .bind(app_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(
            follow_up_at.is_none(),
            "rejected is a terminal application status and must not schedule a follow-up"
        );
    }

    /// cancelled never touches the parent application's status.
    #[tokio::test]
    async fn cancelling_a_stage_does_not_sync_application_status() {
        let pool = test_pool().await;
        let app_id = insert_job_and_application(&pool, "interview").await;
        let stage = create_stage(create_input(app_id, 1, "Screen", None), &pool)
            .await
            .unwrap();

        update_stage(
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

    /// Partial update only touches the fields provided - everything else
    /// (label, type, interviewer info) survives untouched.
    #[tokio::test]
    async fn partial_update_only_changes_provided_fields() {
        let pool = test_pool().await;
        let app_id = insert_job_and_application(&pool, "interview").await;
        let stage = create_stage(create_input(app_id, 1, "Screen", None), &pool)
            .await
            .unwrap();

        let updated = update_stage(
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
        create_stage(create_input(app_id, 2, "Second", None), &pool)
            .await
            .unwrap();
        create_stage(create_input(app_id, 1, "First", None), &pool)
            .await
            .unwrap();

        let stages = list_stages(app_id, &pool).await.unwrap();
        assert_eq!(
            stages
                .iter()
                .map(|s| s.stage_label.as_str())
                .collect::<Vec<_>>(),
            vec!["First", "Second"]
        );
    }

    fn prep_input(
        stage_id: i64,
        input_hash: &str,
        questions: &[&str],
    ) -> SaveInterviewPrepBatchInput {
        SaveInterviewPrepBatchInput {
            stage_id,
            format: "qa".into(),
            language: "en".into(),
            input_hash: input_hash.into(),
            model_used: "claude-sonnet-5".into(),
            cards: questions
                .iter()
                .map(|q| NewPrepCardInput {
                    question: Some(q.to_string()),
                    answer: Some("Answer text".into()),
                    star_situation: None,
                    star_task: None,
                    star_action: None,
                    star_result: None,
                    star_reflection: None,
                })
                .collect(),
        }
    }

    /// Saving a batch inserts one row per card, all sharing the input_hash -
    /// a cache-hit check just needs list_interview_prep to be non-empty.
    #[tokio::test]
    async fn save_batch_inserts_one_row_per_card() {
        let pool = test_pool().await;
        let app_id = insert_job_and_application(&pool, "interview").await;
        let stage = create_stage(create_input(app_id, 1, "Screen", None), &pool)
            .await
            .unwrap();

        let saved = save_prep_batch(prep_input(stage.id, "hash-a", &["Q1", "Q2", "Q3"]), &pool)
            .await
            .expect("save batch");
        assert_eq!(saved.len(), 3);
        assert!(saved.iter().all(|c| c.input_hash == "hash-a"));

        let listed = list_prep(stage.id, &pool).await.unwrap();
        assert_eq!(listed.len(), 3);
    }

    /// "Give me N more" is a second batch save with a fresh input_hash - it
    /// appends alongside the first batch rather than replacing it.
    #[tokio::test]
    async fn a_second_batch_appends_rather_than_replacing() {
        let pool = test_pool().await;
        let app_id = insert_job_and_application(&pool, "interview").await;
        let stage = create_stage(create_input(app_id, 1, "Screen", None), &pool)
            .await
            .unwrap();

        save_prep_batch(prep_input(stage.id, "hash-a", &["Q1", "Q2"]), &pool)
            .await
            .unwrap();
        save_prep_batch(prep_input(stage.id, "hash-b", &["Q3"]), &pool)
            .await
            .unwrap();

        let listed = list_prep(stage.id, &pool).await.unwrap();
        assert_eq!(listed.len(), 3);
    }

    /// STAR+R cards carry the star_* fields and leave question/answer unset.
    #[tokio::test]
    async fn star_format_cards_store_star_fields() {
        let pool = test_pool().await;
        let app_id = insert_job_and_application(&pool, "interview").await;
        let stage = create_stage(create_input(app_id, 1, "Behavioral", None), &pool)
            .await
            .unwrap();

        let input = SaveInterviewPrepBatchInput {
            stage_id: stage.id,
            format: "star".into(),
            language: "en".into(),
            input_hash: "hash-star".into(),
            model_used: "claude-sonnet-5".into(),
            cards: vec![NewPrepCardInput {
                question: Some("Conflict resolution".into()),
                answer: None,
                star_situation: Some("A teammate disagreed on approach".into()),
                star_task: Some("Align on one direction before the deadline".into()),
                star_action: Some("Set up a working session, presented data".into()),
                star_result: Some("Shipped on time with agreement".into()),
                star_reflection: Some("Would raise the disagreement earlier next time".into()),
            }],
        };
        let saved = save_prep_batch(input, &pool).await.unwrap();
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].format, "star");
        assert_eq!(
            saved[0].star_reflection.as_deref(),
            Some("Would raise the disagreement earlier next time")
        );
    }

    #[tokio::test]
    async fn delete_removes_the_stage() {
        let pool = test_pool().await;
        let app_id = insert_job_and_application(&pool, "interview").await;
        let stage = create_stage(create_input(app_id, 1, "Screen", None), &pool)
            .await
            .unwrap();

        delete_stage(stage.id, &pool).await.expect("delete");

        let remaining = list_stages(app_id, &pool).await.unwrap();
        assert!(remaining.is_empty());
    }
}
