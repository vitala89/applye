//! Tauri IPC adapter for the scoring cache.

use tauri::State;

use crate::db::Db;
use crate::jobs::scoring::{SaveScoreInput, ScoringCache};

#[tauri::command]
pub async fn score_cache_get(
    job_id: i64,
    profile_hash: String,
    db: State<'_, Db>,
) -> Result<Option<ScoringCache>, String> {
    crate::jobs::scoring::score_cache_get(job_id, profile_hash, &db.pool).await
}

#[tauri::command]
pub async fn score_cache_latest(
    job_id: i64,
    db: State<'_, Db>,
) -> Result<Option<ScoringCache>, String> {
    crate::jobs::scoring::score_cache_latest(job_id, &db.pool).await
}

#[tauri::command]
pub async fn score_cache_save(
    input: SaveScoreInput,
    db: State<'_, Db>,
) -> Result<ScoringCache, String> {
    crate::jobs::scoring::score_cache_save(input, &db.pool).await
}
