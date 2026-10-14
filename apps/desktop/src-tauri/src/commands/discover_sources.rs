//! Tauri IPC adapter for Discover source management.

use tauri::State;

use crate::db::Db;
use crate::discover::sources::{MarketSourcePlan, SourceListItem};

#[tauri::command]
pub async fn db_list_sources(db: State<'_, Db>) -> Result<Vec<SourceListItem>, String> {
    crate::discover::sources::db_list_sources(&db.pool).await
}

#[tauri::command]
pub async fn db_set_source_enabled(
    source_id: i64,
    enabled: bool,
    db: State<'_, Db>,
) -> Result<(), String> {
    crate::discover::sources::db_set_source_enabled(source_id, enabled, &db.pool).await
}

#[tauri::command]
pub async fn db_market_source_plan(
    markets: Vec<String>,
    db: State<'_, Db>,
) -> Result<MarketSourcePlan, String> {
    crate::discover::sources::db_market_source_plan(markets, &db.pool).await
}

#[tauri::command]
pub async fn db_apply_market_source_plan(
    enable_ids: Vec<i64>,
    disable_ids: Vec<i64>,
    db: State<'_, Db>,
) -> Result<(), String> {
    crate::discover::sources::db_apply_market_source_plan(enable_ids, disable_ids, &db.pool).await
}

#[tauri::command]
pub async fn db_add_source(
    name: String,
    source_type: String,
    url: Option<String>,
    slug: Option<String>,
    db: State<'_, Db>,
) -> Result<i64, String> {
    crate::discover::sources::db_add_source(name, source_type, url, slug, &db.pool).await
}

#[tauri::command]
pub async fn db_remove_source(source_id: i64, db: State<'_, Db>) -> Result<(), String> {
    crate::discover::sources::db_remove_source(source_id, &db.pool).await
}
