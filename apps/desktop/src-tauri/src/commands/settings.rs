use serde::{Deserialize, Serialize};
use sqlx::Acquire;
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
    /// ISO 3166-1 alpha-2, lowercase, or NULL for no local market.
    pub market: Option<String>,
    pub followup_days_after_apply: Option<i64>,
    pub followup_days_after_interview: Option<i64>,
    pub min_score_notify: Option<f64>,
    pub health_check_seen: bool,
    pub onboarding_seen: bool,
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
    /// Double-Option: absent (`None`) leaves market untouched; present as
    /// `null` (`Some(None)`) explicitly clears it back to "no local market".
    #[serde(default)]
    pub market: Option<Option<String>>,
    pub followup_days_after_apply: Option<i64>,
    pub followup_days_after_interview: Option<i64>,
    pub health_check_seen: Option<bool>,
    pub onboarding_seen: Option<bool>,
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
           geo_scope            = COALESCE(?, geo_scope),
           followup_days_after_apply     = COALESCE(?, followup_days_after_apply),
           followup_days_after_interview = COALESCE(?, followup_days_after_interview),
           health_check_seen             = COALESCE(?, health_check_seen),
           onboarding_seen               = COALESCE(?, onboarding_seen)
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
    .bind(settings.followup_days_after_apply)
    .bind(settings.followup_days_after_interview)
    .bind(settings.health_check_seen)
    .bind(settings.onboarding_seen)
    .execute(&db.pool)
    .await
    .map_err(|e| format!("db_update_settings: {e}"))?;

    // market is a double-Option: only touch the column when the caller
    // actually sent the key (Some), which may itself carry NULL to clear it.
    if let Some(market) = &settings.market {
        sqlx::query("UPDATE settings SET market = ? WHERE id = 1")
            .bind(market)
            .execute(&db.pool)
            .await
            .map_err(|e| format!("db_update_settings (market): {e}"))?;
    }

    db_get_settings(db).await
}

/// Factory reset — wipe every user-data table and reset settings to defaults.
///
/// Destructive and irreversible: the UI gates this behind an explicit confirm.
/// Table names are read from `sqlite_master` (not hard-coded) so any table a
/// future migration adds is cleared automatically. `_sqlx_migrations` is kept
/// so the schema stays intact — we clear data, never the schema. Foreign keys
/// are disabled for the wipe so delete order doesn't matter, then re-enabled.
///
/// The `settings` row is re-seeded to the same defaults as migration 0002,
/// with `onboarding_seen = 0` so the app re-opens onboarding on next launch.
/// API keys live in the OS keychain, not the DB; the caller clears those.
#[tauri::command]
pub async fn db_reset_all_data(db: State<'_, Db>) -> Result<(), String> {
    let mut conn = db
        .pool
        .acquire()
        .await
        .map_err(|e| format!("db_reset_all_data (acquire): {e}"))?;

    // PRAGMA foreign_keys is a no-op inside a transaction, so toggle it on the
    // bare connection before opening one.
    sqlx::query("PRAGMA foreign_keys = OFF")
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("db_reset_all_data (fk off): {e}"))?;

    let tables: Vec<(String,)> = sqlx::query_as(
        "SELECT name FROM sqlite_master
         WHERE type = 'table'
           AND name NOT LIKE 'sqlite_%'
           AND name != '_sqlx_migrations'",
    )
    .fetch_all(&mut *conn)
    .await
    .map_err(|e| format!("db_reset_all_data (list tables): {e}"))?;

    let mut tx = conn
        .begin()
        .await
        .map_err(|e| format!("db_reset_all_data (begin): {e}"))?;

    for (name,) in &tables {
        // `name` comes from sqlite_master (trusted); quote it defensively.
        sqlx::query(&format!("DELETE FROM \"{name}\""))
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("db_reset_all_data (clear {name}): {e}"))?;
    }

    // Reset AUTOINCREMENT counters so ids start fresh (cosmetic but expected of
    // a factory reset). No-op if the table has no AUTOINCREMENT columns.
    let _ = sqlx::query("DELETE FROM sqlite_sequence")
        .execute(&mut *tx)
        .await;

    // Re-seed the single settings row (mirrors migration 0002 defaults).
    sqlx::query(
        "INSERT INTO settings (
           id, ai_mode, provider, default_model, economy_model,
           auto_export_on_apply, auto_export_format, export_dir,
           ui_language, default_doc_language, geo_scope,
           onboarding_seen, health_check_seen
         ) VALUES (
           1, 'api', 'claude', 'claude-opus-4-8', 'claude-haiku-4-5',
           0, 'pdf', '',
           'en', 'en', 'eu',
           0, 0
         )",
    )
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("db_reset_all_data (reseed settings): {e}"))?;

    tx.commit()
        .await
        .map_err(|e| format!("db_reset_all_data (commit): {e}"))?;

    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("db_reset_all_data (fk on): {e}"))?;

    Ok(())
}
