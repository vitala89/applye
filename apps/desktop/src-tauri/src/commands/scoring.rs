// Hard filter (0 tokens) + scoring cache CRUD.
// job_paste: parse raw JD, compute hash, run hard filter, upsert job row.
// score_cache_get / score_cache_save: cache keyed on (job_id, profile_hash).

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ScoringCache {
    pub id: i64,
    pub job_id: i64,
    pub profile_hash: String,
    pub jd_hash: String,
    pub language: Option<String>,
    pub score: f64,
    pub dimensions_json: Option<String>,
    pub missing_keywords_json: Option<String>,
    pub red_flags_json: Option<String>,
    pub before_you_submit_json: Option<String>,
    pub ats_pass: Option<bool>,
    pub ats_notes: Option<String>,
    pub summary: Option<String>,
    pub model_used: Option<String>,
    pub tokens_input: Option<i64>,
    pub tokens_output: Option<i64>,
    pub error_message: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveScoreInput {
    pub job_id: i64,
    pub profile_hash: String,
    pub language: String,
    pub score: i64,
    pub dimensions_json: String,
    pub missing_keywords_json: String,
    pub red_flags_json: String,
    pub ats_pass: bool,
    pub ats_notes: String,
    pub summary: String,
    pub before_you_submit_json: String,
    pub model_used: String,
    pub tokens_input: i64,
    pub tokens_output: i64,
}

/// Cache lookup by (job_id, profile_hash). Returns None on miss.
#[tauri::command]
pub async fn score_cache_get(
    job_id: i64,
    profile_hash: String,
    db: State<'_, Db>,
) -> Result<Option<ScoringCache>, String> {
    score_cache_get_core(job_id, profile_hash, &db.pool).await
}

async fn score_cache_get_core(
    job_id: i64,
    profile_hash: String,
    pool: &sqlx::SqlitePool,
) -> Result<Option<ScoringCache>, String> {
    // The job's CURRENT text is part of the match, not just its id. Re-parsing
    // an edited description keeps the same row now, so without this a score
    // computed against the previous text would come back as current. Falling
    // through to `score_cache_latest` instead is what puts it on screen marked
    // stale, which is what it is.
    sqlx::query_as::<_, ScoringCache>(
        "SELECT * FROM scoring_cache
          WHERE job_id = ?
            AND profile_hash = ?
            AND jd_hash = (SELECT jd_hash FROM jobs WHERE id = ?)
          LIMIT 1",
    )
    .bind(job_id)
    .bind(&profile_hash)
    .bind(job_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("score_cache_get: {e}"))
}

/// The most recent score for a job, whatever profile it was produced against.
///
/// `score_cache_get` matches the CURRENT profile hash, so editing the profile
/// (e.g. adding a target role) makes every earlier score invisible and the job
/// looks as if it were never scored. The UI falls back to this so the previous
/// result stays on screen, clearly marked stale, instead of silently vanishing.
#[tauri::command]
pub async fn score_cache_latest(
    job_id: i64,
    db: State<'_, Db>,
) -> Result<Option<ScoringCache>, String> {
    score_cache_latest_core(job_id, &db.pool).await
}

async fn score_cache_latest_core(
    job_id: i64,
    pool: &sqlx::SqlitePool,
) -> Result<Option<ScoringCache>, String> {
    sqlx::query_as::<_, ScoringCache>(
        "SELECT * FROM scoring_cache WHERE job_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
    )
    .bind(job_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("score_cache_latest: {e}"))
}

/// Upsert a scoring result into the cache.
#[tauri::command]
pub async fn score_cache_save(
    input: SaveScoreInput,
    db: State<'_, Db>,
) -> Result<ScoringCache, String> {
    score_cache_save_core(input, &db.pool).await
}

async fn score_cache_save_core(
    input: SaveScoreInput,
    pool: &sqlx::SqlitePool,
) -> Result<ScoringCache, String> {
    let jd_hash: String = sqlx::query_scalar("SELECT jd_hash FROM jobs WHERE id = ?")
        .bind(input.job_id)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("score_cache_save get jd_hash: {e}"))?;

    sqlx::query(
        "INSERT INTO scoring_cache
           (job_id, profile_hash, jd_hash, language, score,
            dimensions_json, missing_keywords_json, red_flags_json,
            ats_pass, ats_notes, summary, before_you_submit_json,
            model_used, tokens_input, tokens_output, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(job_id, profile_hash, jd_hash) DO UPDATE SET
           language               = excluded.language,
           score                  = excluded.score,
           dimensions_json        = excluded.dimensions_json,
           missing_keywords_json  = excluded.missing_keywords_json,
           red_flags_json         = excluded.red_flags_json,
           ats_pass               = excluded.ats_pass,
           ats_notes              = excluded.ats_notes,
           summary                = excluded.summary,
           before_you_submit_json = excluded.before_you_submit_json,
           model_used             = excluded.model_used,
           tokens_input           = excluded.tokens_input,
           tokens_output          = excluded.tokens_output,
           created_at             = excluded.created_at",
    )
    .bind(input.job_id)
    .bind(&input.profile_hash)
    .bind(&jd_hash)
    .bind(&input.language)
    .bind(input.score)
    .bind(&input.dimensions_json)
    .bind(&input.missing_keywords_json)
    .bind(&input.red_flags_json)
    .bind(input.ats_pass)
    .bind(&input.ats_notes)
    .bind(&input.summary)
    .bind(&input.before_you_submit_json)
    .bind(&input.model_used)
    .bind(input.tokens_input)
    .bind(input.tokens_output)
    .execute(pool)
    .await
    .map_err(|e| format!("score_cache_save: {e}"))?;

    sqlx::query_as::<_, ScoringCache>(
        "SELECT * FROM scoring_cache WHERE job_id = ? AND profile_hash = ? LIMIT 1",
    )
    .bind(input.job_id)
    .bind(&input.profile_hash)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("score_cache_save reload: {e}"))
}

#[cfg(test)]
mod cache_tests {
    use super::{score_cache_get_core, score_cache_save_core, SaveScoreInput};
    use crate::commands::job_paste::{job_paste_core, IdentityPrecedence};

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

    #[tokio::test]
    async fn red_job_can_still_be_scored() {
        let pool = test_pool().await;
        let jd = "Title: Backend Engineer\nSalary: €90,000\n\
                   Apply by sending your CV to recruiter88@gmail.com";
        let job = job_paste_core(
            jd.to_string(),
            None,
            None,
            IdentityPrecedence::Authoritative,
            None,
            &pool,
        )
        .await
        .unwrap();
        assert_eq!(job.legitimacy_tier.as_deref(), Some("red"));

        sqlx::query(
            "INSERT INTO scoring_cache (job_id, profile_hash, jd_hash, score, created_at)
             VALUES (?, 'hash', 'hash', 8.5, datetime('now'))",
        )
        .bind(job.id)
        .execute(&pool)
        .await
        .expect("scoring a red-tier job must not be blocked");
    }

    fn save_input(job_id: i64, before_you_submit_json: &str) -> SaveScoreInput {
        SaveScoreInput {
            job_id,
            profile_hash: "phash".to_string(),
            language: "en".to_string(),
            score: 72,
            dimensions_json: "[]".to_string(),
            missing_keywords_json: "[]".to_string(),
            red_flags_json: "[]".to_string(),
            ats_pass: true,
            ats_notes: "".to_string(),
            summary: "Solid fit.".to_string(),
            before_you_submit_json: before_you_submit_json.to_string(),
            model_used: "claude-haiku-4-5".to_string(),
            tokens_input: 500,
            tokens_output: 200,
        }
    }

    /// Same scoring call that produces score/dimensions/etc. also produces
    /// before_you_submit - it round-trips through the cache untouched.
    #[tokio::test]
    async fn before_you_submit_round_trips_through_cache() {
        let pool = test_pool().await;
        let jd = "Company: Acme Robotics\nTitle: Backend Engineer";
        let job = job_paste_core(
            jd.to_string(),
            None,
            None,
            IdentityPrecedence::Authoritative,
            None,
            &pool,
        )
        .await
        .unwrap();

        let notes = serde_json::to_string(&vec![
            "Salary not listed - research market rate before applying.",
            "JD requires a portfolio - prepare 2-3 examples before submitting.",
        ])
        .unwrap();
        let saved = score_cache_save_core(save_input(job.id, &notes), &pool)
            .await
            .unwrap();
        assert_eq!(
            saved.before_you_submit_json.as_deref(),
            Some(notes.as_str())
        );
    }

    /// Re-opening a scored job reads the cached before_you_submit notes
    /// straight from SQLite - no AI call in this path at all (0 tokens).
    #[tokio::test]
    async fn reopening_cached_score_returns_notes_with_no_ai_call() {
        let pool = test_pool().await;
        let jd = "Company: Acme Robotics\nTitle: Backend Engineer";
        let job = job_paste_core(
            jd.to_string(),
            None,
            None,
            IdentityPrecedence::Authoritative,
            None,
            &pool,
        )
        .await
        .unwrap();

        let notes =
            serde_json::to_string(&vec!["Posting is 95 days old - verify it's still open."])
                .unwrap();
        score_cache_save_core(save_input(job.id, &notes), &pool)
            .await
            .unwrap();

        // score_cache_get_core only ever issues a SELECT - there is no AI
        // dispatch reachable from this function, so reading it back is
        // structurally 0 tokens, not just 0 tokens "this time".
        let reopened = score_cache_get_core(job.id, "phash".to_string(), &pool)
            .await
            .unwrap()
            .expect("cached row exists");
        assert_eq!(
            reopened.before_you_submit_json.as_deref(),
            Some(notes.as_str())
        );
    }
}
