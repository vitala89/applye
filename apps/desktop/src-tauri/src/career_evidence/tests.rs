#[cfg(test)]
mod contract {
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
    use sqlx::SqlitePool;

    use crate::career_evidence::types::ProvenanceInput;
    use crate::career_evidence::{insert, list, save_lifecycle, CareerEvidenceInput};

    const STATEMENT: &str = "Owned frontend architecture for a high-volume workflow.";
    const CAPTURED: &str = "2026-10-16T08:00:00.000Z";
    const CREATED: &str = "2026-10-16T09:00:00.000Z";
    const REVIEWED: &str = "2026-10-16T10:00:00.000Z";

    fn next_id() -> u64 {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        COUNTER.fetch_add(1, Ordering::Relaxed)
    }

    async fn memory_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("open sqlite");
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("migrate");
        pool
    }

    async fn file_pool() -> (SqlitePool, PathBuf) {
        let dir = std::env::temp_dir().join(format!("applye-career-evidence-{}", next_id()));
        std::fs::create_dir_all(&dir).expect("scratch dir");
        let path = dir.join("applye.db");
        let options = SqliteConnectOptions::new()
            .filename(&path)
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal)
            .busy_timeout(Duration::from_secs(5));
        let pool = SqlitePoolOptions::new()
            .max_connections(2)
            .connect_with(options)
            .await
            .expect("open file sqlite");
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("migrate");
        (pool, dir)
    }

    fn evidence(
        review_state: &str,
        origin: &str,
        source_label: Option<&str>,
        source_ref: Option<&str>,
        created_at: &str,
        updated_at: &str,
        confirmed_at: Option<&str>,
        rejected_at: Option<&str>,
    ) -> CareerEvidenceInput {
        CareerEvidenceInput {
            statement: STATEMENT.to_string(),
            review_state: review_state.to_string(),
            provenance: ProvenanceInput {
                origin: origin.to_string(),
                source_label: source_label.map(str::to_string),
                source_ref: source_ref.map(str::to_string),
                captured_at: CAPTURED.to_string(),
            },
            created_at: created_at.to_string(),
            updated_at: updated_at.to_string(),
            confirmed_at: confirmed_at.map(str::to_string),
            rejected_at: rejected_at.map(str::to_string),
        }
    }

    fn draft() -> CareerEvidenceInput {
        evidence("draft", "user", None, None, CREATED, CREATED, None, None)
    }

    fn proposal(origin: &str) -> CareerEvidenceInput {
        evidence(
            "proposal",
            origin,
            Some("2024 CV"),
            Some("doc:cv"),
            CREATED,
            CREATED,
            None,
            None,
        )
    }

    fn confirmed_from(base: &CareerEvidenceInput, at: &str) -> CareerEvidenceInput {
        let mut next = base.clone();
        next.review_state = "confirmed".to_string();
        next.updated_at = at.to_string();
        next.confirmed_at = Some(at.to_string());
        next.rejected_at = None;
        next
    }

    fn rejected_from(base: &CareerEvidenceInput, at: &str) -> CareerEvidenceInput {
        let mut next = base.clone();
        next.review_state = "rejected".to_string();
        next.updated_at = at.to_string();
        next.confirmed_at = None;
        next.rejected_at = Some(at.to_string());
        next
    }

    async fn count_updates(pool: &SqlitePool) -> i64 {
        sqlx::query_scalar("SELECT n FROM career_evidence_update_probe")
            .fetch_one(pool)
            .await
            .expect("update probe")
    }

    async fn install_update_probe(pool: &SqlitePool) {
        sqlx::query("CREATE TABLE career_evidence_update_probe (n INTEGER NOT NULL)")
            .execute(pool)
            .await
            .expect("probe table");
        sqlx::query("INSERT INTO career_evidence_update_probe (n) VALUES (0)")
            .execute(pool)
            .await
            .expect("probe row");
        sqlx::query(
            "CREATE TRIGGER career_evidence_update_probe_count
             AFTER UPDATE ON career_evidence
             BEGIN
               UPDATE career_evidence_update_probe SET n = n + 1;
             END",
        )
        .execute(pool)
        .await
        .expect("probe trigger");
    }

    #[tokio::test]
    async fn fresh_database_migrates_and_keeps_jobs() {
        let pool = memory_pool().await;
        let version: i64 = sqlx::query_scalar(
            "SELECT version FROM _sqlx_migrations ORDER BY version DESC LIMIT 1",
        )
        .fetch_one(&pool)
        .await
        .expect("migration version");
        assert_eq!(version, 31);
        let jobs: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'jobs'",
        )
        .fetch_one(&pool)
        .await
        .expect("jobs table");
        assert_eq!(jobs, 1);
    }

    #[tokio::test]
    async fn user_draft_round_trip_keeps_absent_provenance() {
        let pool = memory_pool().await;
        let stored = insert(draft(), &pool).await.expect("insert draft");
        assert!(stored.id > 0);
        assert_eq!(stored.review_state, "draft");
        assert_eq!(stored.origin, "user");
        assert_eq!(stored.source_label, None);
        assert_eq!(stored.source_ref, None);
        assert_eq!(stored.captured_at, CAPTURED);
        assert_eq!(stored.created_at, CREATED);
        assert_eq!(stored.updated_at, CREATED);
        assert_eq!(stored.confirmed_at, None);
        assert_eq!(stored.rejected_at, None);

        let listed = list(&pool).await.expect("list");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, stored.id);
        assert_eq!(listed[0].statement, STATEMENT);
    }

    #[tokio::test]
    async fn ai_and_import_proposals_round_trip() {
        let pool = memory_pool().await;
        let ai = insert(proposal("ai"), &pool).await.expect("ai");
        let imported = insert(proposal("import"), &pool).await.expect("import");
        let listed = list(&pool).await.expect("list");
        assert_eq!(
            listed.iter().map(|row| row.id).collect::<Vec<_>>(),
            vec![ai.id, imported.id]
        );
        assert_eq!(ai.origin, "ai");
        assert_eq!(ai.review_state, "proposal");
        assert_eq!(ai.source_label.as_deref(), Some("2024 CV"));
        assert_eq!(ai.source_ref.as_deref(), Some("doc:cv"));
        assert_eq!(imported.origin, "import");
        assert_eq!(ai.confirmed_at, None);
    }

    #[tokio::test]
    async fn blank_provenance_is_stored_absent_and_untrimmed_text_is_refused() {
        let pool = memory_pool().await;
        let mut blank = draft();
        blank.provenance.source_label = Some("   ".to_string());
        blank.provenance.source_ref = Some(String::new());
        let stored = insert(blank, &pool).await.expect("blank provenance");
        assert_eq!(stored.source_label, None);
        assert_eq!(stored.source_ref, None);

        let mut padded = draft();
        padded.provenance.source_label = Some(" 2024 CV ".to_string());
        let refused = insert(padded, &pool).await;
        assert_eq!(
            refused.expect_err("untrimmed label"),
            "Career Evidence could not be stored."
        );
        let listed = list(&pool).await.expect("list");
        assert_eq!(listed.len(), 1);
    }

    #[tokio::test]
    async fn confirmed_and_rejected_round_trips_keep_immutable_fields() {
        let pool = memory_pool().await;
        let draft_row = insert(proposal("ai"), &pool).await.expect("proposal");
        let confirmed = save_lifecycle(
            draft_row.id,
            confirmed_from(&proposal("ai"), REVIEWED),
            &pool,
        )
        .await
        .expect("confirm");
        assert_eq!(confirmed.review_state, "confirmed");
        assert_eq!(confirmed.statement, STATEMENT);
        assert_eq!(confirmed.origin, "ai");
        assert_eq!(confirmed.source_label.as_deref(), Some("2024 CV"));
        assert_eq!(confirmed.captured_at, CAPTURED);
        assert_eq!(confirmed.created_at, CREATED);
        assert_eq!(confirmed.updated_at, REVIEWED);
        assert_eq!(confirmed.confirmed_at.as_deref(), Some(REVIEWED));
        assert_eq!(confirmed.rejected_at, None);

        let other = insert(draft(), &pool).await.expect("draft");
        let rejected = save_lifecycle(other.id, rejected_from(&draft(), REVIEWED), &pool)
            .await
            .expect("reject");
        assert_eq!(rejected.review_state, "rejected");
        assert_eq!(rejected.statement, STATEMENT);
        assert_eq!(rejected.created_at, CREATED);
        assert_eq!(rejected.updated_at, REVIEWED);
        assert_eq!(rejected.rejected_at.as_deref(), Some(REVIEWED));
        assert_eq!(rejected.confirmed_at, None);
        assert_eq!(rejected.origin, "user");
    }

    #[tokio::test]
    async fn direct_insert_of_a_terminal_row_is_refused() {
        let pool = memory_pool().await;
        let confirmed = insert(confirmed_from(&draft(), REVIEWED), &pool).await;
        let rejected = insert(rejected_from(&proposal("import"), REVIEWED), &pool).await;
        assert!(confirmed.is_err());
        assert!(rejected.is_err());
        let listed = list(&pool).await.expect("list");
        assert!(listed.is_empty());
    }

    #[tokio::test]
    async fn sqlite_rejects_illegal_state_and_clock_combinations() {
        let pool = memory_pool().await;
        macro_rules! refuse_row {
            ($values:literal) => {
                assert!(
                    sqlx::query(concat!(
                        "INSERT INTO career_evidence
                           (statement, review_state, origin, source_label, source_ref,
                            captured_at, created_at, updated_at, confirmed_at, rejected_at)
                         VALUES ",
                        $values
                    ))
                    .execute(&pool)
                    .await
                    .is_err(),
                    "sqlite accepted a forbidden row"
                );
            };
        }
        refuse_row!("('claim', 'draft', 'ai', NULL, NULL, 'c', 't', 't', NULL, NULL)");
        refuse_row!("('claim', 'proposal', 'user', NULL, NULL, 'c', 't', 't', NULL, NULL)");
        refuse_row!("('claim', 'confirmed', 'user', NULL, NULL, 'c', 't', 'later', 't', NULL)");
        refuse_row!("('claim', 'rejected', 'user', NULL, NULL, 'c', 't', 'later', NULL, 't')");
        refuse_row!("('claim', 'draft', 'user', NULL, NULL, 'c', 't', 'later', NULL, NULL)");
        refuse_row!("('claim', 'proposal', 'ai', NULL, NULL, 'c', 't', 'later', NULL, NULL)");
        refuse_row!("('claim', 'confirmed', 'ai', NULL, NULL, 'c', 't', 't', NULL, 't')");
        refuse_row!("('claim', 'rejected', 'ai', NULL, NULL, 'c', 't', 't', 't', NULL)");
        refuse_row!("('  claim', 'draft', 'user', NULL, NULL, 'c', 't', 't', NULL, NULL)");
    }

    #[tokio::test]
    async fn lifecycle_save_cannot_rewrite_immutable_fields() {
        let pool = memory_pool().await;
        let stored = insert(proposal("ai"), &pool).await.expect("proposal");
        let mut changed_statement = confirmed_from(&proposal("ai"), REVIEWED);
        changed_statement.statement = "A different claim.".to_string();
        let statement_error = save_lifecycle(stored.id, changed_statement, &pool)
            .await
            .expect_err("statement");
        assert_eq!(
            statement_error,
            "Career Evidence lifecycle cannot change the statement."
        );

        let mut changed_origin = confirmed_from(&proposal("ai"), REVIEWED);
        changed_origin.provenance.origin = "import".to_string();
        let provenance_error = save_lifecycle(stored.id, changed_origin, &pool)
            .await
            .expect_err("provenance");
        assert_eq!(
            provenance_error,
            "Career Evidence lifecycle cannot change provenance."
        );

        let mut changed_created = confirmed_from(&proposal("ai"), REVIEWED);
        changed_created.created_at = "2026-10-16T11:00:00.000Z".to_string();
        let created_error = save_lifecycle(stored.id, changed_created, &pool)
            .await
            .expect_err("createdAt");
        assert_eq!(
            created_error,
            "Career Evidence lifecycle cannot change createdAt."
        );

        let current = list(&pool).await.expect("list");
        assert_eq!(current[0].statement, STATEMENT);
        assert_eq!(current[0].origin, "ai");
        assert_eq!(current[0].created_at, CREATED);
        assert_eq!(current[0].review_state, "proposal");
    }

    #[tokio::test]
    async fn terminal_transitions_do_not_cross_and_identical_saves_are_idempotent() {
        let pool = memory_pool().await;
        let confirmed_row = insert(draft(), &pool).await.expect("draft");
        let confirmed = save_lifecycle(confirmed_row.id, confirmed_from(&draft(), REVIEWED), &pool)
            .await
            .expect("confirm");
        install_update_probe(&pool).await;
        let again = save_lifecycle(confirmed.id, confirmed_from(&draft(), REVIEWED), &pool)
            .await
            .expect("idempotent confirm");
        assert_eq!(again.updated_at, REVIEWED);
        assert_eq!(again.confirmed_at.as_deref(), Some(REVIEWED));
        assert_eq!(count_updates(&pool).await, 0);

        let moved_clock = save_lifecycle(
            confirmed.id,
            confirmed_from(&draft(), "2026-10-16T12:00:00.000Z"),
            &pool,
        )
        .await
        .expect_err("new clock");
        assert_eq!(
            moved_clock,
            "Career Evidence lifecycle timestamps cannot change."
        );

        let reject_confirmed = save_lifecycle(
            confirmed.id,
            rejected_from(&draft(), "2026-10-16T12:00:00.000Z"),
            &pool,
        )
        .await
        .expect_err("reject confirmed");
        assert_eq!(
            reject_confirmed,
            "Confirmed Career Evidence cannot be rejected without a new review."
        );

        let rejected_row = insert(proposal("import"), &pool).await.expect("proposal");
        let rejected = save_lifecycle(
            rejected_row.id,
            rejected_from(&proposal("import"), REVIEWED),
            &pool,
        )
        .await
        .expect("reject");
        let updates_after_reject = count_updates(&pool).await;
        let again_rejected = save_lifecycle(
            rejected.id,
            rejected_from(&proposal("import"), REVIEWED),
            &pool,
        )
        .await
        .expect("idempotent reject");
        assert_eq!(again_rejected.rejected_at.as_deref(), Some(REVIEWED));
        assert_eq!(count_updates(&pool).await, updates_after_reject);
        let confirm_rejected = save_lifecycle(
            rejected.id,
            confirmed_from(&proposal("import"), "2026-10-16T12:00:00.000Z"),
            &pool,
        )
        .await
        .expect_err("confirm rejected");
        assert_eq!(
            confirm_rejected,
            "Rejected Career Evidence cannot be confirmed."
        );
        assert_eq!(count_updates(&pool).await, updates_after_reject);
    }

    #[tokio::test]
    async fn a_missing_row_is_not_created_by_a_lifecycle_save() {
        let pool = memory_pool().await;
        let missing = save_lifecycle(4, confirmed_from(&draft(), REVIEWED), &pool)
            .await
            .expect_err("missing");
        assert_eq!(missing, "Career Evidence row was not found.");
    }

    #[tokio::test]
    async fn stray_payload_id_does_not_become_the_row_id() {
        let pool = memory_pool().await;
        let input: CareerEvidenceInput = serde_json::from_value(serde_json::json!({
            "id": 99,
            "statement": STATEMENT,
            "reviewState": "draft",
            "provenance": { "origin": "user", "capturedAt": CAPTURED },
            "createdAt": CREATED,
            "updatedAt": CREATED
        }))
        .expect("parse");
        let stored = insert(input, &pool).await.expect("insert");
        assert_ne!(stored.id, 99);
        assert_eq!(stored.statement, STATEMENT);
    }

    #[tokio::test]
    async fn competing_terminal_transitions_leave_exactly_one_winner() {
        let (pool, dir) = file_pool().await;
        let stored = insert(draft(), &pool).await.expect("draft");
        install_update_probe(&pool).await;
        let barrier = Arc::new(tokio::sync::Barrier::new(2));
        let confirm_barrier = Arc::clone(&barrier);
        let reject_barrier = barrier;
        let confirm_pool = pool.clone();
        let reject_pool = pool.clone();
        let id = stored.id;

        let confirm = tokio::spawn(async move {
            confirm_barrier.wait().await;
            save_lifecycle(id, confirmed_from(&draft(), REVIEWED), &confirm_pool).await
        });
        let reject = tokio::spawn(async move {
            reject_barrier.wait().await;
            save_lifecycle(
                id,
                rejected_from(&draft(), "2026-10-16T11:00:00.000Z"),
                &reject_pool,
            )
            .await
        });

        let confirm_result = confirm.await.expect("confirm task");
        let reject_result = reject.await.expect("reject task");
        let wins = [confirm_result.is_ok(), reject_result.is_ok()]
            .into_iter()
            .filter(|ok| *ok)
            .count();
        assert_eq!(wins, 1, "one terminal transition wins");
        assert_eq!(count_updates(&pool).await, 1);

        let listed = list(&pool).await.expect("list");
        assert_eq!(listed.len(), 1);
        let winner = &listed[0];
        if confirm_result.is_ok() {
            assert_eq!(winner.review_state, "confirmed");
            assert_eq!(winner.confirmed_at.as_deref(), Some(REVIEWED));
            assert_eq!(winner.rejected_at, None);
            assert_eq!(
                reject_result.expect_err("loser"),
                "Confirmed Career Evidence cannot be rejected without a new review."
            );
        } else {
            assert_eq!(winner.review_state, "rejected");
            assert_eq!(
                winner.rejected_at.as_deref(),
                Some("2026-10-16T11:00:00.000Z")
            );
            assert_eq!(winner.confirmed_at, None);
            assert_eq!(
                confirm_result.expect_err("loser"),
                "Rejected Career Evidence cannot be confirmed."
            );
        }
        assert_eq!(winner.statement, STATEMENT);
        assert_eq!(winner.created_at, CREATED);
        assert_eq!(winner.captured_at, CAPTURED);
        let _ = std::fs::remove_dir_all(dir);
    }
}
