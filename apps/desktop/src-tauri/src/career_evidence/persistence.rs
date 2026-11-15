//! Career Evidence SQL. Lifecycle writes are one compare-and-set statement.
//! A read, an in-process check, then an unconditional update can let a later
//! terminal write replace the first one.

use sqlx::{sqlite::SqliteQueryResult, SqlitePool};

use super::types::{CanonicalEvidence, CareerEvidenceRow};
use super::validate::{READ, STORED};

pub(crate) async fn insert(
    evidence: &CanonicalEvidence,
    pool: &SqlitePool,
) -> Result<CareerEvidenceRow, String> {
    sqlx::query_as::<_, CareerEvidenceRow>(
        "INSERT INTO career_evidence
           (statement, review_state, origin, source_label, source_ref,
            captured_at, created_at, updated_at, confirmed_at, rejected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id, statement, review_state, origin, source_label, source_ref,
                   captured_at, created_at, updated_at, confirmed_at, rejected_at",
    )
    .bind(&evidence.statement)
    .bind(&evidence.review_state)
    .bind(&evidence.origin)
    .bind(evidence.source_label.as_deref())
    .bind(evidence.source_ref.as_deref())
    .bind(&evidence.captured_at)
    .bind(&evidence.created_at)
    .bind(&evidence.updated_at)
    .bind(evidence.confirmed_at.as_deref())
    .bind(evidence.rejected_at.as_deref())
    .fetch_one(pool)
    .await
    .map_err(stored)
}

pub(crate) async fn list(pool: &SqlitePool) -> Result<Vec<CareerEvidenceRow>, String> {
    sqlx::query_as::<_, CareerEvidenceRow>(
        "SELECT id, statement, review_state, origin, source_label, source_ref,
                captured_at, created_at, updated_at, confirmed_at, rejected_at
         FROM career_evidence
         ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(read)
}

pub(crate) async fn fetch_optional(
    pool: &SqlitePool,
    id: i64,
) -> Result<Option<CareerEvidenceRow>, String> {
    sqlx::query_as::<_, CareerEvidenceRow>(
        "SELECT id, statement, review_state, origin, source_label, source_ref,
                captured_at, created_at, updated_at, confirmed_at, rejected_at
         FROM career_evidence
         WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(read)
}

pub(crate) async fn fetch_required(
    pool: &SqlitePool,
    id: i64,
) -> Result<CareerEvidenceRow, String> {
    fetch_optional(pool, id)
        .await?
        .ok_or_else(|| "Career Evidence row was not found.".to_string())
}

/// One statement. Immutable columns are predicates, never assignments.
/// `source_label IS ?` is SQLite's null-safe comparison. The previous review
/// clocks are null because a terminal transition leaves draft or proposal.
pub(crate) async fn compare_and_set(
    id: i64,
    evidence: &CanonicalEvidence,
    pool: &SqlitePool,
) -> Result<u64, String> {
    let result: SqliteQueryResult = sqlx::query(
        "UPDATE career_evidence
         SET review_state = ?,
             updated_at = ?,
             confirmed_at = ?,
             rejected_at = ?
         WHERE id = ?
           AND review_state IN ('draft', 'proposal')
           AND statement = ?
           AND origin = ?
           AND captured_at = ?
           AND created_at = ?
           AND source_label IS ?
           AND source_ref IS ?
           AND confirmed_at IS NULL
           AND rejected_at IS NULL",
    )
    .bind(&evidence.review_state)
    .bind(&evidence.updated_at)
    .bind(evidence.confirmed_at.as_deref())
    .bind(evidence.rejected_at.as_deref())
    .bind(id)
    .bind(&evidence.statement)
    .bind(&evidence.origin)
    .bind(&evidence.captured_at)
    .bind(&evidence.created_at)
    .bind(evidence.source_label.as_deref())
    .bind(evidence.source_ref.as_deref())
    .execute(pool)
    .await
    .map_err(stored)?;
    Ok(result.rows_affected())
}

fn stored(error: sqlx::Error) -> String {
    drop(error);
    STORED.to_string()
}

fn read(error: sqlx::Error) -> String {
    drop(error);
    READ.to_string()
}
