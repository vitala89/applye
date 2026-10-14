//! Legacy generated-document rows. Kept until Architecture Stabilization PR 6
//! audits whether this surface is still called.

use serde::{Deserialize, Serialize};

// ── Generated docs ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedDoc {
    pub id: i64,
    pub job_id: i64,
    pub doc_type: String,
    pub export_format: String,
    pub input_hash: String,
    pub file_path: String,
    pub created_at: Option<String>,
}

pub(crate) async fn generated_doc_get(
    job_id: i64,
    input_hash: String,
    export_format: String,
    pool: &sqlx::SqlitePool,
) -> Result<Option<GeneratedDoc>, String> {
    fetch_generated_doc(job_id, &input_hash, &export_format, pool).await
}

pub(crate) async fn fetch_generated_doc(
    job_id: i64,
    input_hash: &str,
    export_format: &str,
    pool: &sqlx::SqlitePool,
) -> Result<Option<GeneratedDoc>, String> {
    sqlx::query_as::<_, GeneratedDoc>(
        "SELECT * FROM generated_docs
         WHERE job_id=? AND input_hash=? AND export_format=? AND doc_type='cv' LIMIT 1",
    )
    .bind(job_id)
    .bind(input_hash)
    .bind(export_format)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("generated_doc_get: {e}"))
}

pub(crate) async fn upsert_generated_doc(
    job_id: i64,
    input_hash: &str,
    export_format: &str,
    file_path: &str,
    pool: &sqlx::SqlitePool,
) -> Result<GeneratedDoc, String> {
    sqlx::query(
        "INSERT OR REPLACE INTO generated_docs
           (job_id, doc_type, export_format, input_hash, file_path, created_at)
         VALUES (?, 'cv', ?, ?, ?, datetime('now'))",
    )
    .bind(job_id)
    .bind(export_format)
    .bind(input_hash)
    .bind(file_path)
    .execute(pool)
    .await
    .map_err(|e| format!("generated_doc upsert: {e}"))?;

    sqlx::query_as::<_, GeneratedDoc>(
        "SELECT * FROM generated_docs
         WHERE job_id=? AND doc_type='cv' AND export_format=? AND input_hash=? LIMIT 1",
    )
    .bind(job_id)
    .bind(export_format)
    .bind(input_hash)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("generated_doc reload: {e}"))
}
