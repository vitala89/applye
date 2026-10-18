//! Tauri IPC adapter for Career Evidence. SQL and lifecycle checks live in
//! `crate::career_evidence`.

use tauri::State;

use crate::career_evidence::{CareerEvidenceInput, CareerEvidenceRecord};
use crate::db::Db;

#[tauri::command]
pub async fn db_insert_career_evidence(
    evidence: CareerEvidenceInput,
    db: State<'_, Db>,
) -> Result<CareerEvidenceRecord, String> {
    crate::career_evidence::insert(evidence, &db.pool).await
}

#[tauri::command]
pub async fn db_list_career_evidence(
    db: State<'_, Db>,
) -> Result<Vec<CareerEvidenceRecord>, String> {
    crate::career_evidence::list(&db.pool).await
}

#[tauri::command]
pub async fn db_save_career_evidence_lifecycle(
    id: i64,
    evidence: CareerEvidenceInput,
    db: State<'_, Db>,
) -> Result<CareerEvidenceRecord, String> {
    crate::career_evidence::save_lifecycle(id, evidence, &db.pool).await
}
