//! Career Evidence persistence. Commands forward arguments here.

mod persistence;
mod types;
mod validate;

use sqlx::SqlitePool;

pub use types::{CareerEvidenceInput, CareerEvidenceRow};

use types::CanonicalEvidence;
use validate::STORED;

pub async fn insert(
    input: CareerEvidenceInput,
    pool: &SqlitePool,
) -> Result<CareerEvidenceRow, String> {
    let canonical = validate::canonical_for_insert(&input)?;
    let row = persistence::insert(&canonical, pool).await?;
    validate::ensure_row(&row)?;
    Ok(row)
}

pub async fn list(pool: &SqlitePool) -> Result<Vec<CareerEvidenceRow>, String> {
    let rows = persistence::list(pool).await?;
    for row in &rows {
        validate::ensure_row(row)?;
    }
    Ok(rows)
}

pub async fn save_lifecycle(
    id: i64,
    input: CareerEvidenceInput,
    pool: &SqlitePool,
) -> Result<CareerEvidenceRow, String> {
    if id <= 0 {
        return Err("Career Evidence row was not found.".to_string());
    }
    let canonical = validate::canonical_for_lifecycle(&input)?;
    let affected = persistence::compare_and_set(id, &canonical, pool).await?;
    if affected == 1 {
        let row = persistence::fetch_required(pool, id).await?;
        validate::ensure_row(&row)?;
        return Ok(row);
    }
    if affected != 0 {
        return Err(STORED.to_string());
    }
    match persistence::fetch_optional(pool, id).await? {
        None => Err("Career Evidence row was not found.".to_string()),
        Some(row) => classify(row, &canonical),
    }
}

fn classify(
    row: CareerEvidenceRow,
    requested: &CanonicalEvidence,
) -> Result<CareerEvidenceRow, String> {
    if same_record(&row, requested) {
        return Ok(row);
    }
    if row.review_state == requested.review_state && review_clocks_differ(&row, requested) {
        return Err("Career Evidence lifecycle timestamps cannot change.".to_string());
    }
    if row.statement != requested.statement {
        return Err("Career Evidence lifecycle cannot change the statement.".to_string());
    }
    if provenance_differs(&row, requested) {
        return Err("Career Evidence lifecycle cannot change provenance.".to_string());
    }
    if row.created_at != requested.created_at {
        return Err("Career Evidence lifecycle cannot change createdAt.".to_string());
    }
    if row.review_state == "confirmed" && requested.review_state == "rejected" {
        return Err(
            "Confirmed Career Evidence cannot be rejected without a new review.".to_string(),
        );
    }
    if row.review_state == "rejected" && requested.review_state == "confirmed" {
        return Err("Rejected Career Evidence cannot be confirmed.".to_string());
    }
    Err(STORED.to_string())
}

fn same_record(row: &CareerEvidenceRow, requested: &CanonicalEvidence) -> bool {
    row.statement == requested.statement
        && row.review_state == requested.review_state
        && row.origin == requested.origin
        && same_optional(&row.source_label, &requested.source_label)
        && same_optional(&row.source_ref, &requested.source_ref)
        && row.captured_at == requested.captured_at
        && row.created_at == requested.created_at
        && row.updated_at == requested.updated_at
        && same_optional(&row.confirmed_at, &requested.confirmed_at)
        && same_optional(&row.rejected_at, &requested.rejected_at)
}

fn review_clocks_differ(row: &CareerEvidenceRow, requested: &CanonicalEvidence) -> bool {
    row.updated_at != requested.updated_at
        || !same_optional(&row.confirmed_at, &requested.confirmed_at)
        || !same_optional(&row.rejected_at, &requested.rejected_at)
}

fn provenance_differs(row: &CareerEvidenceRow, requested: &CanonicalEvidence) -> bool {
    row.origin != requested.origin
        || !same_optional(&row.source_label, &requested.source_label)
        || !same_optional(&row.source_ref, &requested.source_ref)
        || row.captured_at != requested.captured_at
}

fn same_optional(left: &Option<String>, right: &Option<String>) -> bool {
    left.as_deref() == right.as_deref()
}

#[cfg(test)]
mod tests;
