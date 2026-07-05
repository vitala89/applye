// Follow-up email drafts: AI-drafted polite follow-up emails for overdue
// applications, cached by (application_id, input_hash). Applye only ever
// drafts and caches text here — nothing in this module ever sends or
// transmits an email anywhere; the frontend opens a `mailto:` link so the
// user's own mail client sends it, if the user chooses to.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FollowupDraft {
    pub id: i64,
    pub application_id: i64,
    pub input_hash: String,
    pub language: String,
    pub subject: String,
    pub body: String,
    pub model_used: Option<String>,
    pub tokens_input: Option<i64>,
    pub tokens_output: Option<i64>,
    pub created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFollowupDraftInput {
    pub application_id: i64,
    pub input_hash: String,
    pub language: String,
    pub subject: String,
    pub body: String,
    pub model_used: String,
    pub tokens_input: i64,
    pub tokens_output: i64,
}

/// Cache lookup by (application_id, input_hash). `input_hash` is computed by
/// the frontend over company + role + applied date + language + model, so
/// re-opening the same overdue application with unchanged inputs is a
/// 0-token read.
#[tauri::command]
pub async fn followup_draft_get(
    application_id: i64,
    input_hash: String,
    db: State<'_, Db>,
) -> Result<Option<FollowupDraft>, String> {
    followup_draft_get_core(application_id, input_hash, &db.pool).await
}

async fn followup_draft_get_core(
    application_id: i64,
    input_hash: String,
    pool: &sqlx::SqlitePool,
) -> Result<Option<FollowupDraft>, String> {
    sqlx::query_as::<_, FollowupDraft>(
        "SELECT * FROM followup_drafts WHERE application_id = ? AND input_hash = ? LIMIT 1",
    )
    .bind(application_id)
    .bind(&input_hash)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("followup_draft_get: {e}"))
}

#[tauri::command]
pub async fn followup_draft_save(
    input: SaveFollowupDraftInput,
    db: State<'_, Db>,
) -> Result<FollowupDraft, String> {
    followup_draft_save_core(input, &db.pool).await
}

async fn followup_draft_save_core(
    input: SaveFollowupDraftInput,
    pool: &sqlx::SqlitePool,
) -> Result<FollowupDraft, String> {
    sqlx::query(
        "INSERT INTO followup_drafts
           (application_id, input_hash, language, subject, body,
            model_used, tokens_input, tokens_output, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(application_id, input_hash) DO UPDATE SET
           language      = excluded.language,
           subject       = excluded.subject,
           body          = excluded.body,
           model_used    = excluded.model_used,
           tokens_input  = excluded.tokens_input,
           tokens_output = excluded.tokens_output,
           created_at    = excluded.created_at",
    )
    .bind(input.application_id)
    .bind(&input.input_hash)
    .bind(&input.language)
    .bind(&input.subject)
    .bind(&input.body)
    .bind(&input.model_used)
    .bind(input.tokens_input)
    .bind(input.tokens_output)
    .execute(pool)
    .await
    .map_err(|e| format!("followup_draft_save: {e}"))?;

    sqlx::query_as::<_, FollowupDraft>(
        "SELECT * FROM followup_drafts WHERE application_id = ? AND input_hash = ? LIMIT 1",
    )
    .bind(input.application_id)
    .bind(&input.input_hash)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("followup_draft_save reload: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::SqlitePool;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .expect("open in-memory sqlite");
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("run migrations");
        pool
    }

    async fn insert_application(pool: &SqlitePool) -> i64 {
        let job_id = sqlx::query_scalar::<_, i64>(
            "INSERT INTO jobs (company, title, jd_text, jd_hash, created_at) VALUES ('Acme', 'Engineer', 'jd', 'hash1', datetime('now')) RETURNING id",
        )
        .fetch_one(pool)
        .await
        .expect("insert job");

        sqlx::query_scalar::<_, i64>(
            "INSERT INTO applications (job_id, status, applied_at, follow_up_at, doc_language, updated_at)
             VALUES (?, 'applied', datetime('now', '-10 days'), datetime('now', '-3 days'), 'en', datetime('now'))
             RETURNING id",
        )
        .bind(job_id)
        .fetch_one(pool)
        .await
        .expect("insert application")
    }

    fn save_input(application_id: i64, input_hash: &str, language: &str) -> SaveFollowupDraftInput {
        SaveFollowupDraftInput {
            application_id,
            input_hash: input_hash.to_string(),
            language: language.to_string(),
            subject: "Following up on my application".to_string(),
            body: "Hi, I wanted to follow up on my application...".to_string(),
            model_used: "claude-sonnet-5".to_string(),
            tokens_input: 200,
            tokens_output: 80,
        }
    }

    /// Re-opening with the same (application_id, input_hash) reads the
    /// cached draft straight from SQLite — 0 tokens, no AI call reachable
    /// from the get path at all.
    #[tokio::test]
    async fn reopen_with_same_input_hash_hits_cache() {
        let pool = test_pool().await;
        let application_id = insert_application(&pool).await;

        followup_draft_save_core(save_input(application_id, "hash-a", "en"), &pool)
            .await
            .expect("save");

        let hit = followup_draft_get_core(application_id, "hash-a".to_string(), &pool)
            .await
            .expect("get")
            .expect("cached row exists");
        assert_eq!(hit.language, "en");
    }

    /// Changing the language changes the input_hash, which is a cache miss —
    /// the old draft is untouched, a new row is inserted alongside it.
    #[tokio::test]
    async fn different_language_input_hash_is_a_cache_miss() {
        let pool = test_pool().await;
        let application_id = insert_application(&pool).await;

        followup_draft_save_core(save_input(application_id, "hash-en", "en"), &pool)
            .await
            .expect("save first");

        let miss = followup_draft_get_core(application_id, "hash-de".to_string(), &pool)
            .await
            .expect("get");
        assert!(miss.is_none());

        followup_draft_save_core(save_input(application_id, "hash-de", "de"), &pool)
            .await
            .expect("save second");

        let both_exist = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM followup_drafts WHERE application_id = ?",
        )
        .bind(application_id)
        .fetch_one(&pool)
        .await
        .expect("count");
        assert_eq!(both_exist, 2);
    }
}
