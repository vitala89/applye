//! SQL for Career Evidence. Lifecycle checks live in the parent module.
//! Statements and provenance are written on insert and are not columns of the
//! lifecycle update.

use sqlx::SqlitePool;

use super::CareerEvidenceFields;

#[derive(Debug, Clone, serde::Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CareerEvidenceRecord {
    pub id: i64,
    pub statement: String,
    pub review_state: String,
    pub origin: String,
    pub source_label: Option<String>,
    pub source_ref: Option<String>,
    pub captured_at: String,
    pub created_at: String,
    pub updated_at: String,
    pub confirmed_at: Option<String>,
    pub rejected_at: Option<String>,
}

pub(crate) async fn insert(
    fields: &CareerEvidenceFields,
    pool: &SqlitePool,
) -> Result<CareerEvidenceRecord, String> {
    sqlx::query_as::<_, CareerEvidenceRecord>(
        "INSERT INTO career_evidence (
            statement, review_state, origin, source_label, source_ref,
            captured_at, created_at, updated_at, confirmed_at, rejected_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING *",
    )
    .bind(&fields.statement)
    .bind(&fields.review_state)
    .bind(&fields.origin)
    .bind(&fields.source_label)
    .bind(&fields.source_ref)
    .bind(&fields.captured_at)
    .bind(&fields.created_at)
    .bind(&fields.updated_at)
    .bind(&fields.confirmed_at)
    .bind(&fields.rejected_at)
    .fetch_one(pool)
    .await
    .map_err(|_| "Career Evidence could not be stored.".to_string())
}

pub(crate) async fn list(pool: &SqlitePool) -> Result<Vec<CareerEvidenceRecord>, String> {
    sqlx::query_as::<_, CareerEvidenceRecord>("SELECT * FROM career_evidence ORDER BY id ASC")
        .fetch_all(pool)
        .await
        .map_err(|_| "Career Evidence could not be loaded.".to_string())
}

pub(crate) async fn fetch(
    pool: &SqlitePool,
    id: i64,
) -> Result<Option<CareerEvidenceRecord>, String> {
    sqlx::query_as::<_, CareerEvidenceRecord>("SELECT * FROM career_evidence WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|_| "Career Evidence could not be loaded.".to_string())
}

/// Writes review state and its timestamps. Statement, origin, provenance, and
/// `created_at` are not in the SET list.
pub(crate) async fn update_lifecycle(
    id: i64,
    fields: &CareerEvidenceFields,
    pool: &SqlitePool,
) -> Result<CareerEvidenceRecord, String> {
    let updated = sqlx::query(
        "UPDATE career_evidence
         SET review_state = ?, updated_at = ?, confirmed_at = ?, rejected_at = ?
         WHERE id = ?",
    )
    .bind(&fields.review_state)
    .bind(&fields.updated_at)
    .bind(&fields.confirmed_at)
    .bind(&fields.rejected_at)
    .bind(id)
    .execute(pool)
    .await
    .map_err(|_| "Career Evidence could not be stored.".to_string())?;

    if updated.rows_affected() == 0 {
        return Err("Career Evidence row was not found.".to_string());
    }
    fetch(pool, id)
        .await?
        .ok_or_else(|| "Career Evidence row was not found.".to_string())
}
