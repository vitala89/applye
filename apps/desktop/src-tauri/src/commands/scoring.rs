// Hard filter (0 tokens) + scoring cache CRUD.
// job_paste: parse raw JD, compute hash, run hard filter, upsert job row.
// score_cache_get / score_cache_save: cache keyed on (job_id, profile_hash).

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::{stable_hash, Db};

fn hard_filter(text: &str) -> bool {
    let t = text.to_lowercase();
    let disqualifiers = [
        "no visa sponsorship",
        "no sponsorship available",
        "no relocation assistance",
        "right to work in",
        "must be authorized to work",
        "us citizens only",
        "must be a us citizen",
        "must have us work authorization",
        "security clearance required",
        "applicants must reside in",
        "must be currently located in",
    ];
    !disqualifiers.iter().any(|d| t.contains(d))
}

fn extract_title(text: &str) -> Option<String> {
    for line in text.lines().take(20) {
        let lower = line.to_lowercase();
        if lower.starts_with("position:")
            || lower.starts_with("job title:")
            || lower.starts_with("role:")
            || lower.starts_with("title:")
        {
            if let Some(v) = line.splitn(2, ':').nth(1) {
                let v = v.trim().to_string();
                if !v.is_empty() {
                    return Some(v);
                }
            }
        }
    }
    text.lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty() && l.len() < 80)
        .map(|l| l.to_string())
}

fn extract_company(text: &str) -> Option<String> {
    for line in text.lines().take(30) {
        let lower = line.to_lowercase();
        if lower.starts_with("company:")
            || lower.starts_with("employer:")
            || lower.starts_with("organization:")
        {
            if let Some(v) = line.splitn(2, ':').nth(1) {
                let v = v.trim().to_string();
                if !v.is_empty() {
                    return Some(v);
                }
            }
        }
    }
    None
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ScoringCache {
    pub id: i64,
    pub job_id: i64,
    pub profile_hash: String,
    pub jd_hash: String,
    pub language: Option<String>,
    pub score: i64,
    pub dimensions_json: Option<String>,
    pub missing_keywords_json: Option<String>,
    pub red_flags_json: Option<String>,
    pub ats_pass: Option<bool>,
    pub ats_notes: Option<String>,
    pub summary: Option<String>,
    pub model_used: Option<String>,
    pub tokens_input: Option<i64>,
    pub tokens_output: Option<i64>,
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
    pub model_used: String,
    pub tokens_input: i64,
    pub tokens_output: i64,
}

/// Paste raw JD: compute hash, hard-filter, extract metadata, upsert job row.
#[tauri::command]
pub async fn job_paste(
    jd_text: String,
    db: State<'_, Db>,
) -> Result<crate::commands::jobs::Job, String> {
    let jd_hash = stable_hash(&jd_text);
    let hard_pass = hard_filter(&jd_text);
    let title = extract_title(&jd_text);
    let company = extract_company(&jd_text);

    sqlx::query(
        "INSERT INTO jobs (company, title, jd_text, jd_hash, hard_filter_passed, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(jd_hash) DO UPDATE SET hard_filter_passed = excluded.hard_filter_passed",
    )
    .bind(&company)
    .bind(&title)
    .bind(&jd_text)
    .bind(&jd_hash)
    .bind(hard_pass as i64)
    .execute(&db.pool)
    .await
    .map_err(|e| format!("job_paste: {e}"))?;

    sqlx::query_as::<_, crate::commands::jobs::Job>("SELECT * FROM jobs WHERE jd_hash = ?")
        .bind(&jd_hash)
        .fetch_one(&db.pool)
        .await
        .map_err(|e| format!("job_paste reload: {e}"))
}

/// Cache lookup by (job_id, profile_hash). Returns None on miss.
#[tauri::command]
pub async fn score_cache_get(
    job_id: i64,
    profile_hash: String,
    db: State<'_, Db>,
) -> Result<Option<ScoringCache>, String> {
    sqlx::query_as::<_, ScoringCache>(
        "SELECT * FROM scoring_cache WHERE job_id = ? AND profile_hash = ? LIMIT 1",
    )
    .bind(job_id)
    .bind(&profile_hash)
    .fetch_optional(&db.pool)
    .await
    .map_err(|e| format!("score_cache_get: {e}"))
}

/// Upsert a scoring result into the cache.
#[tauri::command]
pub async fn score_cache_save(
    input: SaveScoreInput,
    db: State<'_, Db>,
) -> Result<ScoringCache, String> {
    let jd_hash: String = sqlx::query_scalar("SELECT jd_hash FROM jobs WHERE id = ?")
        .bind(input.job_id)
        .fetch_one(&db.pool)
        .await
        .map_err(|e| format!("score_cache_save get jd_hash: {e}"))?;

    sqlx::query(
        "INSERT INTO scoring_cache
           (job_id, profile_hash, jd_hash, language, score,
            dimensions_json, missing_keywords_json, red_flags_json,
            ats_pass, ats_notes, summary, model_used, tokens_input, tokens_output, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(job_id, profile_hash, jd_hash) DO UPDATE SET
           language              = excluded.language,
           score                 = excluded.score,
           dimensions_json       = excluded.dimensions_json,
           missing_keywords_json = excluded.missing_keywords_json,
           red_flags_json        = excluded.red_flags_json,
           ats_pass              = excluded.ats_pass,
           ats_notes             = excluded.ats_notes,
           summary               = excluded.summary,
           model_used            = excluded.model_used,
           tokens_input          = excluded.tokens_input,
           tokens_output         = excluded.tokens_output,
           created_at            = excluded.created_at",
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
    .bind(&input.model_used)
    .bind(input.tokens_input)
    .bind(input.tokens_output)
    .execute(&db.pool)
    .await
    .map_err(|e| format!("score_cache_save: {e}"))?;

    sqlx::query_as::<_, ScoringCache>(
        "SELECT * FROM scoring_cache WHERE job_id = ? AND profile_hash = ? LIMIT 1",
    )
    .bind(input.job_id)
    .bind(&input.profile_hash)
    .fetch_one(&db.pool)
    .await
    .map_err(|e| format!("score_cache_save reload: {e}"))
}
