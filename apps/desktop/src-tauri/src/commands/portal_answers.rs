// Portal answer drafts: AI-drafted answers to a job portal's open-ended
// questions, cached by (job_id, profile_hash, input_hash). Applye only ever
// drafts and caches text here — nothing in this module ever submits or
// transmits an answer anywhere; the frontend copies it to the clipboard.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PortalAnswer {
    pub id: i64,
    pub job_id: i64,
    pub profile_hash: String,
    pub questions_json: String,
    pub answers_json: String,
    pub input_hash: String,
    pub model_used: Option<String>,
    pub tokens_input: Option<i64>,
    pub tokens_output: Option<i64>,
    pub created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePortalAnswersInput {
    pub job_id: i64,
    pub profile_hash: String,
    pub questions_json: String,
    pub answers_json: String,
    pub input_hash: String,
    pub model_used: String,
    pub tokens_input: i64,
    pub tokens_output: i64,
}

/// Cache lookup by (job_id, profile_hash, input_hash). `input_hash` is
/// computed by the frontend over the question set + language + model, so a
/// re-opened job with the same questions/language/model is a 0-token read.
#[tauri::command]
pub async fn portal_answers_get(
    job_id: i64,
    profile_hash: String,
    input_hash: String,
    db: State<'_, Db>,
) -> Result<Option<PortalAnswer>, String> {
    portal_answers_get_core(job_id, profile_hash, input_hash, &db.pool).await
}

async fn portal_answers_get_core(
    job_id: i64,
    profile_hash: String,
    input_hash: String,
    pool: &sqlx::SqlitePool,
) -> Result<Option<PortalAnswer>, String> {
    sqlx::query_as::<_, PortalAnswer>(
        "SELECT * FROM portal_answers WHERE job_id = ? AND profile_hash = ? AND input_hash = ? LIMIT 1",
    )
    .bind(job_id)
    .bind(&profile_hash)
    .bind(&input_hash)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("portal_answers_get: {e}"))
}

#[tauri::command]
pub async fn portal_answers_save(
    input: SavePortalAnswersInput,
    db: State<'_, Db>,
) -> Result<PortalAnswer, String> {
    portal_answers_save_core(input, &db.pool).await
}

async fn portal_answers_save_core(
    input: SavePortalAnswersInput,
    pool: &sqlx::SqlitePool,
) -> Result<PortalAnswer, String> {
    sqlx::query(
        "INSERT INTO portal_answers
           (job_id, profile_hash, questions_json, answers_json, input_hash,
            model_used, tokens_input, tokens_output, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(job_id, profile_hash, input_hash) DO UPDATE SET
           questions_json = excluded.questions_json,
           answers_json   = excluded.answers_json,
           model_used     = excluded.model_used,
           tokens_input   = excluded.tokens_input,
           tokens_output  = excluded.tokens_output,
           created_at     = excluded.created_at",
    )
    .bind(input.job_id)
    .bind(&input.profile_hash)
    .bind(&input.questions_json)
    .bind(&input.answers_json)
    .bind(&input.input_hash)
    .bind(&input.model_used)
    .bind(input.tokens_input)
    .bind(input.tokens_output)
    .execute(pool)
    .await
    .map_err(|e| format!("portal_answers_save: {e}"))?;

    sqlx::query_as::<_, PortalAnswer>(
        "SELECT * FROM portal_answers WHERE job_id = ? AND profile_hash = ? AND input_hash = ? LIMIT 1",
    )
    .bind(input.job_id)
    .bind(&input.profile_hash)
    .bind(&input.input_hash)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("portal_answers_save reload: {e}"))
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

    async fn insert_job(pool: &SqlitePool) -> i64 {
        sqlx::query_scalar::<_, i64>(
            "INSERT INTO jobs (jd_text, jd_hash, created_at) VALUES ('jd', 'hash1', datetime('now')) RETURNING id",
        )
        .fetch_one(pool)
        .await
        .expect("insert job")
    }

    fn save_input(job_id: i64, input_hash: &str, answers_json: &str) -> SavePortalAnswersInput {
        SavePortalAnswersInput {
            job_id,
            profile_hash: "phash".to_string(),
            questions_json: r#"["Why this role?"]"#.to_string(),
            answers_json: answers_json.to_string(),
            input_hash: input_hash.to_string(),
            model_used: "claude-sonnet-5".to_string(),
            tokens_input: 400,
            tokens_output: 150,
        }
    }

    /// Re-opening with the same (job_id, profile_hash, input_hash) reads the
    /// cached draft straight from SQLite — 0 tokens, no AI call reachable
    /// from the get path at all.
    #[tokio::test]
    async fn reopen_with_same_input_hash_hits_cache() {
        let pool = test_pool().await;
        let job_id = insert_job(&pool).await;
        let answers = r#"[{"question":"Why this role?","answer":"Because..."}]"#;

        portal_answers_save_core(save_input(job_id, "hash-a", answers), &pool)
            .await
            .expect("save");

        let hit = portal_answers_get_core(job_id, "phash".to_string(), "hash-a".to_string(), &pool)
            .await
            .expect("get")
            .expect("cached row exists");
        assert_eq!(hit.answers_json, answers);
    }

    /// Changing the question set changes the input_hash, which is a cache
    /// miss — the old draft is untouched, a new row is inserted alongside it.
    #[tokio::test]
    async fn different_input_hash_is_a_cache_miss() {
        let pool = test_pool().await;
        let job_id = insert_job(&pool).await;

        portal_answers_save_core(
            save_input(
                job_id,
                "hash-a",
                r#"[{"question":"Why this role?","answer":"A"}]"#,
            ),
            &pool,
        )
        .await
        .expect("save first");

        let miss =
            portal_answers_get_core(job_id, "phash".to_string(), "hash-b".to_string(), &pool)
                .await
                .expect("get");
        assert!(miss.is_none());
    }
}
