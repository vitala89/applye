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

/// Paste raw JD: compute hash, hard-filter, extract metadata, run the
/// deterministic legitimacy check (0 tokens, after the hard filter, before
/// any AI scoring), upsert job row.
#[tauri::command]
pub async fn job_paste(
    jd_text: String,
    db: State<'_, Db>,
) -> Result<crate::commands::jobs::Job, String> {
    job_paste_core(jd_text, &db.pool).await
}

/// Core of `job_paste`, decoupled from `tauri::State` so it can be exercised
/// directly against a plain pool in tests.
async fn job_paste_core(
    jd_text: String,
    pool: &sqlx::SqlitePool,
) -> Result<crate::commands::jobs::Job, String> {
    let jd_hash = stable_hash(&jd_text);
    let hard_pass = hard_filter(&jd_text);
    let title = extract_title(&jd_text);
    let company = extract_company(&jd_text);

    // Legitimacy is informational only — it never blocks the hard filter or
    // scoring, it just gets recorded alongside the job (augmentation, not a gate).
    let (legitimacy_tier, legitimacy_notes) = if hard_pass {
        let apply_email = crate::commands::legitimacy::extract_apply_email(&jd_text);
        let (mut tier, mut notes) = crate::commands::legitimacy::legitimacy_check(
            &jd_text,
            company.as_deref(),
            apply_email.as_deref(),
        );
        let duplicate = crate::commands::legitimacy::duplicate_jd_other_company(
            pool,
            &jd_text,
            &jd_hash,
            company.as_deref(),
        )
        .await
        .map_err(|e| format!("job_paste: duplicate check: {e}"))?;
        if duplicate {
            notes.push(
                "This exact job description is already saved under a different company."
                    .to_string(),
            );
            tier = tier.max(crate::commands::legitimacy::LegitimacyTier::Red);
        }
        let notes_json = if notes.is_empty() {
            None
        } else {
            Some(serde_json::to_string(&notes).map_err(|e| format!("job_paste: notes: {e}"))?)
        };
        (tier.as_str().to_string(), notes_json)
    } else {
        ("green".to_string(), None)
    };

    sqlx::query(
        "INSERT INTO jobs
           (company, title, jd_text, jd_hash, hard_filter_passed, legitimacy_tier, legitimacy_notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(jd_hash) DO UPDATE SET
           hard_filter_passed = excluded.hard_filter_passed,
           legitimacy_tier    = excluded.legitimacy_tier,
           legitimacy_notes   = excluded.legitimacy_notes",
    )
    .bind(&company)
    .bind(&title)
    .bind(&jd_text)
    .bind(&jd_hash)
    .bind(hard_pass as i64)
    .bind(&legitimacy_tier)
    .bind(&legitimacy_notes)
    .execute(pool)
    .await
    .map_err(|e| format!("job_paste: {e}"))?;

    sqlx::query_as::<_, crate::commands::jobs::Job>("SELECT * FROM jobs WHERE jd_hash = ?")
        .bind(&jd_hash)
        .fetch_one(pool)
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
    score_cache_get_core(job_id, profile_hash, &db.pool).await
}

async fn score_cache_get_core(
    job_id: i64,
    profile_hash: String,
    pool: &sqlx::SqlitePool,
) -> Result<Option<ScoringCache>, String> {
    sqlx::query_as::<_, ScoringCache>(
        "SELECT * FROM scoring_cache WHERE job_id = ? AND profile_hash = ? LIMIT 1",
    )
    .bind(job_id)
    .bind(&profile_hash)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("score_cache_get: {e}"))
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
mod pipeline_tests {
    use super::{job_paste_core, score_cache_get_core, score_cache_save_core, SaveScoreInput};
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
    async fn paste_with_no_salary_is_flagged_yellow() {
        let pool = test_pool().await;
        let jd = "Company: Acme Robotics\nTitle: Backend Engineer\n\
                   We build warehouse robots and need a great engineer.";
        let job = job_paste_core(jd.to_string(), &pool).await.unwrap();
        assert_eq!(job.legitimacy_tier.as_deref(), Some("yellow"));
        let notes = job.legitimacy_notes.expect("notes present");
        assert!(notes.contains("Salary"));
    }

    #[tokio::test]
    async fn paste_with_personal_gmail_apply_is_flagged_red() {
        let pool = test_pool().await;
        let jd = "Company: Acme Robotics\nTitle: Backend Engineer\nSalary: €90,000\n\
                   Apply by sending your CV to recruiter88@gmail.com";
        let job = job_paste_core(jd.to_string(), &pool).await.unwrap();
        assert_eq!(job.legitimacy_tier.as_deref(), Some("red"));
        let notes = job.legitimacy_notes.expect("notes present");
        assert!(notes.contains("personal email"));
    }

    #[tokio::test]
    async fn clean_paste_is_green_with_no_notes() {
        let pool = test_pool().await;
        let jd = "Company: Acme Robotics\nTitle: Backend Engineer\nSalary: €90,000 - €110,000\n\
                   Join our team of 12 engineers building warehouse robots.\n\
                   Apply: jobs@acmerobotics.com";
        let job = job_paste_core(jd.to_string(), &pool).await.unwrap();
        assert_eq!(job.legitimacy_tier.as_deref(), Some("green"));
        assert_eq!(job.legitimacy_notes, None);
    }

    #[tokio::test]
    async fn same_template_under_different_company_is_flagged_red() {
        let pool = test_pool().await;
        let first = "Company: Acme Robotics\nSalary: €90,000\n\
                      Build great products with a passionate team of 10.";
        job_paste_core(first.to_string(), &pool).await.unwrap();

        let second = "Company: Globex Corp\nSalary: €90,000\n\
                       Build great products with a passionate team of 10.";
        let job = job_paste_core(second.to_string(), &pool).await.unwrap();
        assert_eq!(job.legitimacy_tier.as_deref(), Some("red"));
        let notes = job.legitimacy_notes.expect("notes present");
        assert!(notes.contains("already saved under a different company"));
    }

    /// Augmentation guarantee: a red job is informational only — nothing in
    /// the schema or pipeline stops it from being scored/tailored if the user
    /// proceeds anyway.
    #[tokio::test]
    async fn red_job_can_still_be_scored() {
        let pool = test_pool().await;
        let jd = "Title: Backend Engineer\nSalary: €90,000\n\
                   Apply by sending your CV to recruiter88@gmail.com";
        let job = job_paste_core(jd.to_string(), &pool).await.unwrap();
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
    /// before_you_submit — it round-trips through the cache untouched.
    #[tokio::test]
    async fn before_you_submit_round_trips_through_cache() {
        let pool = test_pool().await;
        let jd = "Company: Acme Robotics\nTitle: Backend Engineer";
        let job = job_paste_core(jd.to_string(), &pool).await.unwrap();

        let notes = serde_json::to_string(&vec![
            "Salary not listed — research market rate before applying.",
            "JD requires a portfolio — prepare 2-3 examples before submitting.",
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
    /// straight from SQLite — no AI call in this path at all (0 tokens).
    #[tokio::test]
    async fn reopening_cached_score_returns_notes_with_no_ai_call() {
        let pool = test_pool().await;
        let jd = "Company: Acme Robotics\nTitle: Backend Engineer";
        let job = job_paste_core(jd.to_string(), &pool).await.unwrap();

        let notes =
            serde_json::to_string(&vec!["Posting is 95 days old — verify it's still open."])
                .unwrap();
        score_cache_save_core(save_input(job.id, &notes), &pool)
            .await
            .unwrap();

        // score_cache_get_core only ever issues a SELECT — there is no AI
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
