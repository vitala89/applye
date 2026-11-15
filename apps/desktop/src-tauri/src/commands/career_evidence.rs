//! Tauri IPC adapter for Career Evidence. Validation and SQL live in
//! `crate::career_evidence`. This module does not log statement or provenance.

use tauri::State;

use crate::career_evidence::{CareerEvidenceInput, CareerEvidenceRow};
use crate::db::Db;

#[tauri::command]
pub async fn db_insert_career_evidence(
    evidence: CareerEvidenceInput,
    db: State<'_, Db>,
) -> Result<CareerEvidenceRow, String> {
    crate::career_evidence::insert(evidence, &db.pool).await
}

#[tauri::command]
pub async fn db_list_career_evidence(db: State<'_, Db>) -> Result<Vec<CareerEvidenceRow>, String> {
    crate::career_evidence::list(&db.pool).await
}

#[tauri::command]
pub async fn db_save_career_evidence_lifecycle(
    id: i64,
    evidence: CareerEvidenceInput,
    db: State<'_, Db>,
) -> Result<CareerEvidenceRow, String> {
    crate::career_evidence::save_lifecycle(id, evidence, &db.pool).await
}
