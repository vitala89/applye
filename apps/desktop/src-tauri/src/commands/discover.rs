//! Tauri IPC adapter for a Discover scan and its feed.

use tauri::State;

use crate::db::Db;
use crate::discover::scan::{DiscoverFeedItem, ScanSummary};

#[tauri::command]
pub async fn discover_scan(db: State<'_, Db>) -> Result<ScanSummary, String> {
    crate::discover::scan::discover_scan(&db.pool).await
}

#[tauri::command]
pub async fn db_discover_feed(db: State<'_, Db>) -> Result<Vec<DiscoverFeedItem>, String> {
    crate::discover::scan::db_discover_feed(&db.pool).await
}

#[tauri::command]
pub async fn db_discover_dismiss(
    job_id: i64,
    dismissed: bool,
    db: State<'_, Db>,
) -> Result<(), String> {
    crate::discover::scan::db_discover_dismiss(job_id, dismissed, &db.pool).await
}

#[tauri::command]
pub async fn db_discover_clear(db: State<'_, Db>) -> Result<u64, String> {
    crate::discover::scan::db_discover_clear(&db.pool).await
}
