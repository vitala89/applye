use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub id: i64,
    pub ai_mode: Option<String>,
    pub provider: Option<String>,
    pub default_model: Option<String>,
    pub economy_model: Option<String>,
    pub auto_export_on_apply: bool,
    pub auto_export_format: Option<String>,
    pub export_dir: Option<String>,
    pub ui_language: String,
    pub default_doc_language: String,
    pub geo_scope: String,
}

/// Partial update — only the fields present (non-null) are written; everything
/// else is preserved via COALESCE.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub ai_mode: Option<String>,
    pub provider: Option<String>,
    pub default_model: Option<String>,
    pub economy_model: Option<String>,
    pub auto_export_on_apply: Option<bool>,
    pub auto_export_format: Option<String>,
    pub export_dir: Option<String>,
    pub ui_language: Option<String>,
    pub default_doc_language: Option<String>,
    pub geo_scope: Option<String>,
}

#[tauri::command]
pub async fn db_get_settings(db: State<'_, Db>) -> Result<Settings, String> {
    sqlx::query_as::<_, Settings>("SELECT * FROM settings WHERE id = 1")
        .fetch_one(&db.pool)
        .await
        .map_err(|e| format!("db_get_settings: {e}"))
}

#[tauri::command]
pub async fn db_update_settings(
    settings: SettingsPatch,
    db: State<'_, Db>,
) -> Result<Settings, String> {
    sqlx::query(
        "UPDATE settings SET
           ai_mode              = COALESCE(?, ai_mode),
           provider             = COALESCE(?, provider),
           default_model        = COALESCE(?, default_model),
           economy_model        = COALESCE(?, economy_model),
           auto_export_on_apply = COALESCE(?, auto_export_on_apply),
           auto_export_format   = COALESCE(?, auto_export_format),
           export_dir           = COALESCE(?, export_dir),
           ui_language          = COALESCE(?, ui_language),
           default_doc_language = COALESCE(?, default_doc_language),
           geo_scope            = COALESCE(?, geo_scope)
         WHERE id = 1",
    )
    .bind(&settings.ai_mode)
    .bind(&settings.provider)
    .bind(&settings.default_model)
    .bind(&settings.economy_model)
    .bind(settings.auto_export_on_apply)
    .bind(&settings.auto_export_format)
    .bind(&settings.export_dir)
    .bind(&settings.ui_language)
    .bind(&settings.default_doc_language)
    .bind(&settings.geo_scope)
    .execute(&db.pool)
    .await
    .map_err(|e| format!("db_update_settings: {e}"))?;

    db_get_settings(db).await
}
