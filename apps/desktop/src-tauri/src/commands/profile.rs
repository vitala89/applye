use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;

/// Single profile row (id is always 1 — there is one profile).
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: i64,
    pub full_md: Option<String>,
    pub scoring_json: Option<String>,
    pub scoring_hash: Option<String>,
    pub pitch_md: Option<String>,
    pub pitch_hash: Option<String>,
    pub target_archetypes: Option<String>,
    pub updated_at: Option<String>,
}

/// Payload sent from the frontend on save (camelCase via serde).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileInput {
    pub full_md: Option<String>,
    pub scoring_json: Option<String>,
    pub scoring_hash: Option<String>,
    pub pitch_md: Option<String>,
    pub pitch_hash: Option<String>,
    pub target_archetypes: Option<String>,
}

#[tauri::command]
pub async fn db_get_profile(db: State<'_, Db>) -> Result<Option<Profile>, String> {
    sqlx::query_as::<_, Profile>(
        "SELECT id, full_md, scoring_json, scoring_hash, pitch_md, pitch_hash, target_archetypes, updated_at FROM profile WHERE id = 1",
    )
    .fetch_optional(&db.pool)
    .await
    .map_err(|e| format!("db_get_profile: {e}"))
}

#[tauri::command]
pub async fn db_upsert_profile(
    profile: ProfileInput,
    db: State<'_, Db>,
) -> Result<Profile, String> {
    sqlx::query(
        "INSERT INTO profile (id, full_md, scoring_json, scoring_hash, pitch_md, pitch_hash, target_archetypes, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           full_md            = excluded.full_md,
           scoring_json       = excluded.scoring_json,
           scoring_hash       = excluded.scoring_hash,
           pitch_md           = excluded.pitch_md,
           pitch_hash         = excluded.pitch_hash,
           target_archetypes  = excluded.target_archetypes,
           updated_at         = excluded.updated_at",
    )
    .bind(&profile.full_md)
    .bind(&profile.scoring_json)
    .bind(&profile.scoring_hash)
    .bind(&profile.pitch_md)
    .bind(&profile.pitch_hash)
    .bind(&profile.target_archetypes)
    .execute(&db.pool)
    .await
    .map_err(|e| format!("db_upsert_profile: {e}"))?;

    db_get_profile(db)
        .await?
        .ok_or_else(|| "db_upsert_profile: row missing after upsert".to_string())
}

/// Compute the stable FNV-1a hash used for cache keys — same algorithm as db::stable_hash.
/// Exposed so the frontend can check if a cached result is still valid without an extra DB round-trip.
#[tauri::command]
pub fn hash_text(text: String) -> String {
    crate::db::stable_hash(&text)
}
