//! Desktop persistence for Career Evidence.
//!
//! Insert stores a new draft or proposal. A lifecycle save records a domain
//! confirm or reject for an existing row. It does not rewrite the statement,
//! provenance, or `created_at`, and it has no revise or delete operation.

mod persistence;

use serde::Deserialize;
use sqlx::SqlitePool;

pub use persistence::CareerEvidenceRecord;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CareerEvidenceInput {
    pub statement: String,
    pub review_state: String,
    pub provenance: CareerEvidenceProvenanceInput,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub confirmed_at: Option<String>,
    #[serde(default)]
    pub rejected_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CareerEvidenceProvenanceInput {
    pub origin: String,
    #[serde(default)]
    pub source_label: Option<String>,
    #[serde(default)]
    pub source_ref: Option<String>,
    pub captured_at: String,
}

pub(crate) struct CareerEvidenceFields {
    statement: String,
    review_state: String,
    origin: String,
    source_label: Option<String>,
    source_ref: Option<String>,
    captured_at: String,
    created_at: String,
    updated_at: String,
    confirmed_at: Option<String>,
    rejected_at: Option<String>,
}

pub(crate) async fn insert(
    input: CareerEvidenceInput,
    pool: &SqlitePool,
) -> Result<CareerEvidenceRecord, String> {
    let fields = normalize(input)?;
    if fields.review_state != "draft" && fields.review_state != "proposal" {
        return Err("Career Evidence starts as a draft or a proposal.".to_string());
    }
    persistence::insert(&fields, pool).await
}

pub(crate) async fn list(pool: &SqlitePool) -> Result<Vec<CareerEvidenceRecord>, String> {
    persistence::list(pool).await
}

pub(crate) async fn save_lifecycle(
    id: i64,
    input: CareerEvidenceInput,
    pool: &SqlitePool,
) -> Result<CareerEvidenceRecord, String> {
    let incoming = normalize(input)?;
    let stored = persistence::fetch(pool, id)
        .await?
        .ok_or_else(|| "Career Evidence row was not found.".to_string())?;

    if stored.statement != incoming.statement {
        return Err("Career Evidence lifecycle cannot change the statement.".to_string());
    }
    if provenance_changed(&stored, &incoming) {
        return Err("Career Evidence lifecycle cannot change provenance.".to_string());
    }
    if stored.created_at != incoming.created_at {
        return Err("Career Evidence lifecycle cannot change createdAt.".to_string());
    }
    ensure_transition(&stored.review_state, &incoming.review_state)?;
    if stored.review_state == incoming.review_state {
        if timestamps_changed(&stored, &incoming) {
            return Err("Career Evidence lifecycle timestamps cannot change.".to_string());
        }
        return Ok(stored);
    }
    persistence::update_lifecycle(id, &incoming, pool).await
}

fn provenance_changed(stored: &CareerEvidenceRecord, incoming: &CareerEvidenceFields) -> bool {
    stored.origin != incoming.origin
        || stored.source_label != incoming.source_label
        || stored.source_ref != incoming.source_ref
        || stored.captured_at != incoming.captured_at
}

fn timestamps_changed(stored: &CareerEvidenceRecord, incoming: &CareerEvidenceFields) -> bool {
    stored.updated_at != incoming.updated_at
        || stored.confirmed_at != incoming.confirmed_at
        || stored.rejected_at != incoming.rejected_at
}

fn ensure_transition(from: &str, to: &str) -> Result<(), String> {
    if from == to {
        return Ok(());
    }
    match (from, to) {
        ("draft" | "proposal", "confirmed" | "rejected") => Ok(()),
        ("rejected", "confirmed") => {
            Err("Rejected Career Evidence cannot be confirmed.".to_string())
        }
        ("confirmed", "rejected") => {
            Err("Confirmed Career Evidence cannot be rejected without a new review.".to_string())
        }
        _ => Err("Career Evidence lifecycle transition is not allowed.".to_string()),
    }
}

fn normalize(input: CareerEvidenceInput) -> Result<CareerEvidenceFields, String> {
    let statement = canonical_text(&input.statement, "Career Evidence statement is empty.")?;
    let review_state = require_state(&input.review_state)?;
    let origin = require_origin(&input.provenance.origin)?;
    let captured_at = canonical_text(
        &input.provenance.captured_at,
        "Career Evidence capture time is empty.",
    )?;
    let created_at = canonical_text(&input.created_at, "Career Evidence time is empty.")?;
    let updated_at = canonical_text(&input.updated_at, "Career Evidence time is empty.")?;
    let source_label = optional_text(input.provenance.source_label)?;
    let source_ref = optional_text(input.provenance.source_ref)?;
    let confirmed_at = optional_text(input.confirmed_at)?;
    let rejected_at = optional_text(input.rejected_at)?;
    check_combination(
        &review_state,
        &origin,
        confirmed_at.as_deref(),
        rejected_at.as_deref(),
        &updated_at,
    )?;
    Ok(CareerEvidenceFields {
        statement,
        review_state,
        origin,
        source_label,
        source_ref,
        captured_at,
        created_at,
        updated_at,
        confirmed_at,
        rejected_at,
    })
}

fn check_combination(
    review_state: &str,
    origin: &str,
    confirmed_at: Option<&str>,
    rejected_at: Option<&str>,
    updated_at: &str,
) -> Result<(), String> {
    match review_state {
        "draft" => {
            if origin != "user" {
                return Err("A Career Evidence draft comes from the user.".to_string());
            }
            if confirmed_at.is_some() || rejected_at.is_some() {
                return Err("Draft Career Evidence cannot carry a review time.".to_string());
            }
        }
        "proposal" => {
            if origin != "ai" && origin != "import" {
                return Err("A Career Evidence proposal comes from AI or import.".to_string());
            }
            if confirmed_at.is_some() || rejected_at.is_some() {
                return Err("Proposal Career Evidence cannot carry a review time.".to_string());
            }
        }
        "confirmed" => {
            let Some(confirmed_at) = confirmed_at else {
                return Err(
                    "Confirmed Career Evidence is missing its confirmation time.".to_string(),
                );
            };
            if rejected_at.is_some() {
                return Err("Confirmed Career Evidence cannot carry a rejection time.".to_string());
            }
            if updated_at != confirmed_at {
                return Err("Career Evidence confirmation time does not match.".to_string());
            }
        }
        "rejected" => {
            let Some(rejected_at) = rejected_at else {
                return Err("Rejected Career Evidence is missing its rejection time.".to_string());
            };
            if confirmed_at.is_some() {
                return Err(
                    "Rejected Career Evidence cannot carry a confirmation time.".to_string()
                );
            }
            if updated_at != rejected_at {
                return Err("Career Evidence rejection time does not match.".to_string());
            }
        }
        _ => return Err("Career Evidence review state is not recognized.".to_string()),
    }
    Ok(())
}

fn require_state(value: &str) -> Result<String, String> {
    match value {
        "draft" | "proposal" | "confirmed" | "rejected" => Ok(value.to_string()),
        _ => Err("Career Evidence review state is not recognized.".to_string()),
    }
}

fn require_origin(value: &str) -> Result<String, String> {
    match value {
        "user" | "ai" | "import" => Ok(value.to_string()),
        _ => Err("Career Evidence origin is not recognized.".to_string()),
    }
}

fn canonical_text(value: &str, empty_message: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(empty_message.to_string());
    }
    if trimmed != value {
        return Err("Career Evidence text is not canonical.".to_string());
    }
    Ok(value.to_string())
}

fn optional_text(value: Option<String>) -> Result<Option<String>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed != value {
        return Err("Career Evidence text is not canonical.".to_string());
    }
    Ok(Some(value))
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

    fn draft_input() -> CareerEvidenceInput {
        CareerEvidenceInput {
            statement: "Owned frontend architecture for a high-volume workflow.".to_string(),
            review_state: "draft".to_string(),
            provenance: CareerEvidenceProvenanceInput {
                origin: "user".to_string(),
                source_label: None,
                source_ref: None,
                captured_at: "2026-10-16T08:00:00.000Z".to_string(),
            },
            created_at: "2026-10-16T09:00:00.000Z".to_string(),
            updated_at: "2026-10-16T09:00:00.000Z".to_string(),
            confirmed_at: None,
            rejected_at: None,
        }
    }

    fn proposal_input(origin: &str) -> CareerEvidenceInput {
        let mut input = draft_input();
        input.review_state = "proposal".to_string();
        input.provenance.origin = origin.to_string();
        input.provenance.source_label = Some("2024 CV".to_string());
        input.provenance.source_ref = Some("doc:cv".to_string());
        input
    }

    fn confirm(input: &CareerEvidenceInput) -> CareerEvidenceInput {
        let mut next = clone_input(input);
        next.review_state = "confirmed".to_string();
        next.updated_at = "2026-10-16T10:00:00.000Z".to_string();
        next.confirmed_at = Some("2026-10-16T10:00:00.000Z".to_string());
        next.rejected_at = None;
        next
    }

    fn reject(input: &CareerEvidenceInput) -> CareerEvidenceInput {
        let mut next = clone_input(input);
        next.review_state = "rejected".to_string();
        next.updated_at = "2026-10-16T11:00:00.000Z".to_string();
        next.confirmed_at = None;
        next.rejected_at = Some("2026-10-16T11:00:00.000Z".to_string());
        next
    }

    fn clone_input(input: &CareerEvidenceInput) -> CareerEvidenceInput {
        CareerEvidenceInput {
            statement: input.statement.clone(),
            review_state: input.review_state.clone(),
            provenance: CareerEvidenceProvenanceInput {
                origin: input.provenance.origin.clone(),
                source_label: input.provenance.source_label.clone(),
                source_ref: input.provenance.source_ref.clone(),
                captured_at: input.provenance.captured_at.clone(),
            },
            created_at: input.created_at.clone(),
            updated_at: input.updated_at.clone(),
            confirmed_at: input.confirmed_at.clone(),
            rejected_at: input.rejected_at.clone(),
        }
    }

    #[tokio::test]
    async fn migration_chain_creates_career_evidence() {
        let pool = test_pool().await;
        let version: i64 = sqlx::query_scalar("SELECT MAX(version) FROM _sqlx_migrations")
            .fetch_one(&pool)
            .await
            .expect("migration version");
        assert_eq!(version, 31);
        let jobs: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'jobs'",
        )
        .fetch_one(&pool)
        .await
        .expect("jobs table");
        assert_eq!(jobs, 1);
    }

    #[tokio::test]
    async fn insert_and_list_keep_draft_and_proposal_fields() {
        let pool = test_pool().await;
        let draft = insert(draft_input(), &pool).await.expect("draft");
        let ai = insert(proposal_input("ai"), &pool).await.expect("ai");
        let imported = insert(proposal_input("import"), &pool)
            .await
            .expect("import");

        assert!(draft.source_label.is_none());
        assert!(draft.source_ref.is_none());
        assert_eq!(draft.review_state, "draft");
        assert_eq!(draft.origin, "user");
        assert_eq!(ai.origin, "ai");
        assert_eq!(ai.source_label.as_deref(), Some("2024 CV"));
        assert_eq!(ai.source_ref.as_deref(), Some("doc:cv"));
        assert_eq!(imported.origin, "import");
        assert_eq!(imported.review_state, "proposal");

        let listed = list(&pool).await.expect("list");
        assert_eq!(
            listed.iter().map(|row| row.id).collect::<Vec<_>>(),
            vec![draft.id, ai.id, imported.id]
        );
        assert_eq!(listed[0].statement, draft.statement);
        assert_eq!(listed[0].created_at, "2026-10-16T09:00:00.000Z");
        assert_eq!(listed[0].captured_at, "2026-10-16T08:00:00.000Z");
    }

    #[tokio::test]
    async fn confirm_and_reject_keep_provenance_and_created_at() {
        let pool = test_pool().await;
        let draft = insert(draft_input(), &pool).await.expect("draft");
        let proposal = insert(proposal_input("ai"), &pool).await.expect("proposal");

        let confirmed = save_lifecycle(draft.id, confirm(&draft_input()), &pool)
            .await
            .expect("confirm draft");
        assert_eq!(confirmed.review_state, "confirmed");
        assert_eq!(confirmed.statement, draft.statement);
        assert_eq!(confirmed.origin, "user");
        assert_eq!(confirmed.created_at, draft.created_at);
        assert_eq!(
            confirmed.confirmed_at.as_deref(),
            Some("2026-10-16T10:00:00.000Z")
        );
        assert!(confirmed.rejected_at.is_none());

        let rejected = save_lifecycle(proposal.id, reject(&proposal_input("ai")), &pool)
            .await
            .expect("reject proposal");
        assert_eq!(rejected.review_state, "rejected");
        assert_eq!(rejected.origin, "ai");
        assert_eq!(rejected.source_label, proposal.source_label);
        assert_eq!(rejected.source_ref, proposal.source_ref);
        assert_eq!(rejected.created_at, proposal.created_at);
        assert_eq!(
            rejected.rejected_at.as_deref(),
            Some("2026-10-16T11:00:00.000Z")
        );
        assert!(rejected.confirmed_at.is_none());
    }

    #[tokio::test]
    async fn proposal_confirmation_keeps_the_original_provenance() {
        let pool = test_pool().await;
        let proposal = insert(proposal_input("import"), &pool)
            .await
            .expect("proposal");
        let confirmed = save_lifecycle(proposal.id, confirm(&proposal_input("import")), &pool)
            .await
            .expect("confirm");
        assert_eq!(confirmed.origin, "import");
        assert_eq!(confirmed.source_label.as_deref(), Some("2024 CV"));
        assert_eq!(confirmed.source_ref.as_deref(), Some("doc:cv"));
        assert_eq!(confirmed.captured_at, proposal.captured_at);
        assert_eq!(confirmed.created_at, proposal.created_at);
        assert_eq!(confirmed.statement, proposal.statement);
    }

    #[tokio::test]
    async fn illegal_lifecycle_and_revision_are_rejected() {
        let pool = test_pool().await;
        let draft = insert(draft_input(), &pool).await.expect("draft");
        let proposal = insert(proposal_input("ai"), &pool).await.expect("proposal");
        let confirmed = save_lifecycle(draft.id, confirm(&draft_input()), &pool)
            .await
            .expect("confirm");
        let rejected = save_lifecycle(proposal.id, reject(&proposal_input("ai")), &pool)
            .await
            .expect("reject");

        let rejected_confirm = save_lifecycle(rejected.id, confirm(&proposal_input("ai")), &pool)
            .await
            .expect_err("rejected cannot confirm");
        assert_eq!(
            rejected_confirm,
            "Rejected Career Evidence cannot be confirmed."
        );

        let mut confirmed_reject = reject(&draft_input());
        confirmed_reject.statement = confirmed.statement.clone();
        let confirmed_reject = save_lifecycle(confirmed.id, confirmed_reject, &pool)
            .await
            .expect_err("confirmed cannot reject");
        assert_eq!(
            confirmed_reject,
            "Confirmed Career Evidence cannot be rejected without a new review."
        );

        let mut rewritten = confirm(&draft_input());
        rewritten.statement = "A different confirmed statement.".to_string();
        let rewritten = save_lifecycle(confirmed.id, rewritten, &pool)
            .await
            .expect_err("statement stays");
        assert_eq!(
            rewritten,
            "Career Evidence lifecycle cannot change the statement."
        );

        let mut provenance = confirm(&draft_input());
        provenance.provenance.origin = "ai".to_string();
        let provenance = save_lifecycle(confirmed.id, provenance, &pool)
            .await
            .expect_err("provenance stays");
        assert_eq!(
            provenance,
            "Career Evidence lifecycle cannot change provenance."
        );

        let mut created = confirm(&draft_input());
        created.created_at = "2026-10-16T12:00:00.000Z".to_string();
        let created = save_lifecycle(confirmed.id, created, &pool)
            .await
            .expect_err("createdAt stays");
        assert_eq!(
            created,
            "Career Evidence lifecycle cannot change createdAt."
        );

        let stored = persistence::fetch(&pool, confirmed.id)
            .await
            .expect("fetch")
            .expect("row");
        assert_eq!(stored.statement, confirmed.statement);
        assert_eq!(stored.origin, "user");
        assert_eq!(stored.created_at, confirmed.created_at);
        assert_eq!(stored.review_state, "confirmed");
    }

    #[tokio::test]
    async fn insert_refuses_an_already_confirmed_row() {
        let pool = test_pool().await;
        let error = insert(confirm(&draft_input()), &pool)
            .await
            .expect_err("no confirmed insert");
        assert_eq!(error, "Career Evidence starts as a draft or a proposal.");
    }

    #[tokio::test]
    async fn table_rejects_impossible_review_combinations() {
        let pool = test_pool().await;
        let cases = [
            "INSERT INTO career_evidence (
                statement, review_state, origin, captured_at, created_at, updated_at, confirmed_at
             ) VALUES ('Claim', 'draft', 'user', 't', 't', 't', 't')",
            "INSERT INTO career_evidence (
                statement, review_state, origin, captured_at, created_at, updated_at, confirmed_at
             ) VALUES ('Claim', 'proposal', 'ai', 't', 't', 't', 't')",
            "INSERT INTO career_evidence (
                statement, review_state, origin, captured_at, created_at, updated_at, confirmed_at
             ) VALUES ('Claim', 'rejected', 'user', 't', 't', 't', 't')",
            "INSERT INTO career_evidence (
                statement, review_state, origin, captured_at, created_at, updated_at
             ) VALUES ('Claim', 'confirmed', 'user', 't', 't', 't')",
            "INSERT INTO career_evidence (
                statement, review_state, origin, captured_at, created_at, updated_at, rejected_at
             ) VALUES ('Claim', 'draft', 'user', 't', 't', 't', 't')",
            "INSERT INTO career_evidence (
                statement, review_state, origin, captured_at, created_at, updated_at
             ) VALUES ('Claim', 'proposal', 'user', 't', 't', 't')",
            "INSERT INTO career_evidence (
                statement, review_state, origin, captured_at, created_at, updated_at
             ) VALUES ('Claim', 'draft', 'ai', 't', 't', 't')",
        ];
        for sql in cases {
            let error = sqlx::query(sql)
                .execute(&pool)
                .await
                .expect_err("constraint");
            let message = error.to_string();
            assert!(
                message.contains("CHECK") || message.contains("constraint"),
                "{message}"
            );
            assert!(!message.contains("Claim"));
        }
    }
}
