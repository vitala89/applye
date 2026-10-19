//! IPC shapes for Career Evidence. The row id stays on the row, not inside a
//! domain value. TypeScript rehydration is what seals `CareerEvidence`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvenanceInput {
    pub origin: String,
    #[serde(default)]
    pub source_label: Option<String>,
    #[serde(default)]
    pub source_ref: Option<String>,
    pub captured_at: String,
}

/// Nested evidence argument. A stray persistence id is not a field here, so
/// it cannot become the domain identity.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CareerEvidenceInput {
    pub statement: String,
    pub review_state: String,
    pub provenance: ProvenanceInput,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub confirmed_at: Option<String>,
    #[serde(default)]
    pub rejected_at: Option<String>,
}

/// Flat stored row. Field names match the SQLite columns; serde emits camelCase.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CareerEvidenceRow {
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

#[derive(Debug, Clone)]
pub(crate) struct CanonicalEvidence {
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
