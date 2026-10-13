//! Application tracking workflow: status transitions, tracker edits, pipeline
//! projection, and comments. SQL lives in `persistence`. Tauri stays in
//! `commands::applications`.

mod domain;
mod persistence;

use sqlx::SqlitePool;

pub use persistence::{
    Application, ApplicationInput, ApplicationTrackerFieldsInput, Comment, PipelineCard,
};

pub(crate) async fn list(pool: &SqlitePool) -> Result<Vec<Application>, String> {
    persistence::list(pool).await
}

pub(crate) async fn upsert(
    application: ApplicationInput,
    pool: &SqlitePool,
) -> Result<Application, String> {
    persistence::upsert(application, pool).await
}

/// Update status and append `status_history` in one transaction.
///
/// Entering `applied` or `interview` recomputes `follow_up_at` from the
/// settings cadence. Other statuses, including `offer` and `rejected`, leave
/// `follow_up_at` untouched. Interview rejection reuses this function so
/// there is one status-transition implementation.
pub(crate) async fn set_status(
    id: i64,
    status: String,
    pool: &SqlitePool,
) -> Result<Application, String> {
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("db_set_application_status (begin): {e}"))?;

    match status.as_str() {
        "applied" => persistence::mark_applied(&mut tx, id, &status).await?,
        "interview" => persistence::mark_interview(&mut tx, id, &status).await?,
        _ => persistence::mark_other_status(&mut tx, id, &status).await?,
    }
    persistence::append_status_history(&mut tx, id, &status).await?;

    tx.commit()
        .await
        .map_err(|e| format!("db_set_application_status (commit): {e}"))?;

    persistence::fetch(pool, id).await
}

pub(crate) async fn pipeline_cards(pool: &SqlitePool) -> Result<Vec<PipelineCard>, String> {
    persistence::pipeline_cards(pool).await
}

pub(crate) async fn update_tracker_fields(
    input: ApplicationTrackerFieldsInput,
    pool: &SqlitePool,
) -> Result<Application, String> {
    persistence::update_tracker_fields(input, pool).await
}

pub(crate) async fn set_priority(
    application_id: i64,
    priority: Option<String>,
    pool: &SqlitePool,
) -> Result<Application, String> {
    domain::validate_priority(priority.as_deref())?;
    persistence::set_priority(application_id, priority, pool).await
}

pub(crate) async fn add_comment(
    application_id: i64,
    comment_text: String,
    pool: &SqlitePool,
) -> Result<Comment, String> {
    persistence::add_comment(application_id, comment_text, pool).await
}

pub(crate) async fn list_comments(
    application_id: i64,
    pool: &SqlitePool,
) -> Result<Vec<Comment>, String> {
    persistence::list_comments(application_id, pool).await
}

#[cfg(test)]
mod followup_tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

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

        let created = upsert(app_input(job_id, Some(cv_doc), None), &pool)
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
        let updated = upsert(minimal, &pool).await.expect("update application");
        assert_eq!(
            updated.cv_document_id,
            Some(cv_doc),
            "omitting the doc id on a later upsert must not clear the existing link"
        );
        assert_eq!(updated.status.as_deref(), Some("applied"));
    }

    /// Moving into `applied` sets follow_up_at = today + settings cadence
    /// (default 7 days), read straight from the settings row - 0 tokens.
    #[tokio::test]
    async fn applied_sets_follow_up_at_from_apply_cadence() {
        let pool = test_pool().await;
        let id = insert_job_and_application(&pool).await;

        let app = set_status(id, "applied".to_string(), &pool)
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

        let app = set_status(id, "interview".to_string(), &pool)
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

        let app = set_status(id, "applied".to_string(), &pool)
            .await
            .expect("set status");

        let expected: String = sqlx::query_scalar("SELECT date('now', '+2 days')")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(app.follow_up_at.as_deref(), Some(expected.as_str()));
    }

    /// A manually-set follow_up_at survives until the user changes status
    /// again - it is never silently recomputed on an unrelated load/reload.
    #[tokio::test]
    async fn manual_override_is_not_clobbered_by_unrelated_reads() {
        let pool = test_pool().await;
        let id = insert_job_and_application(&pool).await;
        set_status(id, "applied".to_string(), &pool)
            .await
            .expect("set status");

        sqlx::query("UPDATE applications SET follow_up_at = '2099-01-01' WHERE id = ?")
            .bind(id)
            .execute(&pool)
            .await
            .unwrap();

        // Plain reads never touch follow_up_at - only a fresh status transition does.
        let reloaded = persistence::fetch(&pool, id).await.expect("reload");
        assert_eq!(reloaded.follow_up_at.as_deref(), Some("2099-01-01"));
    }

    /// Terminal statuses (offer/rejected) leave follow_up_at untouched.
    #[tokio::test]
    async fn terminal_status_does_not_set_follow_up_at() {
        let pool = test_pool().await;
        let id = insert_job_and_application(&pool).await;

        let app = set_status(id, "offer".to_string(), &pool)
            .await
            .expect("set status");

        assert!(app.follow_up_at.is_none());
    }

    /// The status update and the history row commit together.
    #[tokio::test]
    async fn status_change_appends_history_in_the_same_transaction() {
        let pool = test_pool().await;
        let id = insert_job_and_application(&pool).await;

        set_status(id, "applied".to_string(), &pool)
            .await
            .expect("set status");

        let history: Vec<String> = sqlx::query_scalar(
            "SELECT status FROM status_history WHERE application_id = ? ORDER BY id",
        )
        .bind(id)
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(history, vec!["applied".to_string()]);
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

        let cards = pipeline_cards(&pool).await.expect("cards");
        let overdue = |id: i64| cards.iter().find(|c| c.id == id).unwrap().overdue;
        assert!(overdue(overdue_id));
        assert!(!overdue(due_today_id));
        assert!(!overdue(future_id));
    }

    /// The Job Tracker inline-edit patch writes only the 7 tracker fields -
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

        let patched = update_tracker_fields(
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

        let cards = pipeline_cards(&pool).await.expect("list cards");
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

        let cards = pipeline_cards(&pool).await.expect("list cards");
        let card = cards.into_iter().find(|c| c.id == id).expect("card exists");
        assert_eq!(card.score, Some(82.0));
        assert_eq!(card.score_profile_hash.as_deref(), Some("phash-1"));
        assert_eq!(card.score_at.as_deref(), Some("2026-07-01T00:00:00Z"));
    }

    #[tokio::test]
    async fn invalid_priority_is_rejected_before_a_write() {
        let pool = test_pool().await;
        let id = insert_job_and_application(&pool).await;

        let err = set_priority(id, Some("urgent".to_string()), &pool)
            .await
            .expect_err("invalid priority");
        assert_eq!(err, "invalid priority: urgent");

        let stored: Option<String> =
            sqlx::query_scalar("SELECT priority FROM applications WHERE id = ?")
                .bind(id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(stored.is_none());
    }
}
