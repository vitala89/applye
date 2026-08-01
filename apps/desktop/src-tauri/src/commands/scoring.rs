// Hard filter (0 tokens) + scoring cache CRUD.
// job_paste: parse raw JD, compute hash, run hard filter, upsert job row.
// score_cache_get / score_cache_save: cache keyed on (job_id, profile_hash).

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::job_identity::{
    extract_company, extract_title, is_usable_company, is_usable_title,
};
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

/// What the caller's `title`/`company` are worth relative to what the text says.
///
/// The distinction is not cosmetic. Two callers pass these fields and they mean
/// opposite things: the "From link" ATS fetch passes structured metadata lifted
/// off a job board, which is more reliable than any parse of raw text, while the
/// re-parse on the jobs page passes the job's own previously stored values,
/// which may be a bad guess from an earlier parse. Treating both as
/// authoritative is what made a wrong title permanent - re-extraction could
/// never run again.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum IdentityPrecedence {
    /// The passed value wins outright. For callers reading structured fields.
    #[default]
    Authoritative,
    /// Extraction wins; the passed value is used only to fill a gap extraction
    /// left. For callers passing back what was stored earlier.
    Fallback,
}

/// Paste raw JD: compute hash, hard-filter, extract metadata, run the
/// deterministic legitimacy check (0 tokens, after the hard filter, before
/// any AI scoring), upsert job row. `title`/`company` are optional values the
/// caller already holds; `precedence` says whether they outrank what the text
/// says or merely stand in when the text says nothing. Omitted precedence means
/// authoritative, which is what every pre-existing caller relied on.
#[tauri::command]
pub async fn job_paste(
    jd_text: String,
    title: Option<String>,
    company: Option<String>,
    precedence: Option<IdentityPrecedence>,
    db: State<'_, Db>,
) -> Result<crate::commands::jobs::Job, String> {
    job_paste_core(
        jd_text,
        title,
        company,
        precedence.unwrap_or_default(),
        &db.pool,
    )
    .await
}

/// Resolve one field against the text according to `precedence`.
/// `usable` is applied only on the fallback path, where `passed` is a value this
/// job already held. Extraction rejecting a string and storage handing the same
/// string straight back would leave the rules with no effect on any job parsed
/// before them. On the authoritative path the caller's value is not a guess and
/// is not second-guessed.
fn resolve_identity(
    passed: Option<String>,
    extracted: Option<String>,
    precedence: IdentityPrecedence,
    usable: fn(&str) -> bool,
) -> Option<String> {
    let passed = passed.filter(|s| !s.trim().is_empty());
    match precedence {
        IdentityPrecedence::Authoritative => passed.or(extracted),
        IdentityPrecedence::Fallback => extracted.or(passed.filter(|s| usable(s))),
    }
}

/// Core of `job_paste`, decoupled from `tauri::State` so it can be exercised
/// directly against a plain pool in tests.
async fn job_paste_core(
    jd_text: String,
    title_override: Option<String>,
    company_override: Option<String>,
    precedence: IdentityPrecedence,
    pool: &sqlx::SqlitePool,
) -> Result<crate::commands::jobs::Job, String> {
    let jd_hash = stable_hash(&jd_text);
    let hard_pass = hard_filter(&jd_text);
    let title = resolve_identity(
        title_override,
        extract_title(&jd_text),
        precedence,
        is_usable_title,
    );
    let company = resolve_identity(
        company_override,
        extract_company(&jd_text),
        precedence,
        is_usable_company,
    );
    let prefer_fresh = i64::from(precedence == IdentityPrecedence::Fallback);

    // Legitimacy is informational only - it never blocks the hard filter or
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
           -- Authoritative: backfill a missing company/title without clobbering
           -- an existing one. Fallback: the resolved value is already the whole
           -- answer for this row - fresh extraction, or a stored value that
           -- still passes today's rules, or nothing - so it wins outright,
           -- including when it is NULL. Keeping the stored value on NULL here
           -- would put back exactly the string the rules just rejected.
           company            = CASE WHEN ? = 1 THEN excluded.company
                                     ELSE COALESCE(NULLIF(jobs.company, ''), excluded.company) END,
           title              = CASE WHEN ? = 1 THEN excluded.title
                                     ELSE COALESCE(NULLIF(jobs.title, ''), excluded.title) END,
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
    .bind(prefer_fresh)
    .bind(prefer_fresh)
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
mod pipeline_tests {
    use super::{
        job_paste_core, score_cache_get_core, score_cache_save_core, IdentityPrecedence,
        SaveScoreInput,
    };
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
        let job = job_paste_core(
            jd.to_string(),
            None,
            None,
            IdentityPrecedence::Authoritative,
            &pool,
        )
        .await
        .unwrap();
        assert_eq!(job.legitimacy_tier.as_deref(), Some("yellow"));
        let notes = job.legitimacy_notes.expect("notes present");
        assert!(notes.contains("Salary"));
    }

    #[tokio::test]
    async fn paste_with_personal_gmail_apply_is_flagged_red() {
        let pool = test_pool().await;
        let jd = "Company: Acme Robotics\nTitle: Backend Engineer\nSalary: €90,000\n\
                   Apply by sending your CV to recruiter88@gmail.com";
        let job = job_paste_core(
            jd.to_string(),
            None,
            None,
            IdentityPrecedence::Authoritative,
            &pool,
        )
        .await
        .unwrap();
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
        let job = job_paste_core(
            jd.to_string(),
            None,
            None,
            IdentityPrecedence::Authoritative,
            &pool,
        )
        .await
        .unwrap();
        assert_eq!(job.legitimacy_tier.as_deref(), Some("green"));
        assert_eq!(job.legitimacy_notes, None);
    }

    #[tokio::test]
    async fn same_template_under_different_company_is_flagged_red() {
        let pool = test_pool().await;
        let first = "Company: Acme Robotics\nSalary: €90,000\n\
                      Build great products with a passionate team of 10.";
        job_paste_core(
            first.to_string(),
            None,
            None,
            IdentityPrecedence::Authoritative,
            &pool,
        )
        .await
        .unwrap();

        let second = "Company: Globex Corp\nSalary: €90,000\n\
                       Build great products with a passionate team of 10.";
        let job = job_paste_core(
            second.to_string(),
            None,
            None,
            IdentityPrecedence::Authoritative,
            &pool,
        )
        .await
        .unwrap();
        assert_eq!(job.legitimacy_tier.as_deref(), Some("red"));
        let notes = job.legitimacy_notes.expect("notes present");
        assert!(notes.contains("already saved under a different company"));
    }

    /// Augmentation guarantee: a red job is informational only - nothing in
    /// the schema or pipeline stops it from being scored/tailored if the user
    /// proceeds anyway.
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

    #[tokio::test]
    async fn authoritative_values_beat_what_the_text_says() {
        let pool = test_pool().await;
        // The text names a different company and title. A caller reading
        // structured fields off a job board is more reliable than any parse, so
        // its values must survive.
        let jd = "Company: Text Corp\nPosition: Text Engineer\nWe are hiring.";
        let job = job_paste_core(
            jd.to_string(),
            Some("Board Engineer".to_string()),
            Some("Board Corp".to_string()),
            IdentityPrecedence::Authoritative,
            &pool,
        )
        .await
        .unwrap();

        assert_eq!(job.company.as_deref(), Some("Board Corp"));
        assert_eq!(job.title.as_deref(), Some("Board Engineer"));
    }

    #[tokio::test]
    async fn fallback_values_lose_to_what_the_text_says() {
        let pool = test_pool().await;
        // The page passes back what it already stored. Fresh extraction wins, so
        // a title captured wrongly by an earlier parse is correctable.
        let jd = "Company: Text Corp\nPosition: Text Engineer\nWe are hiring.";
        let job = job_paste_core(
            jd.to_string(),
            Some("The Purpose:".to_string()),
            Some("Stale Corp".to_string()),
            IdentityPrecedence::Fallback,
            &pool,
        )
        .await
        .unwrap();

        assert_eq!(job.company.as_deref(), Some("Text Corp"));
        assert_eq!(job.title.as_deref(), Some("Text Engineer"));
    }

    #[tokio::test]
    async fn fallback_values_fill_a_gap_extraction_left() {
        let pool = test_pool().await;
        // A JD trimmed to its body names neither. Losing a title that was once
        // correct because the user deleted the header would be worse than
        // keeping it, so the passed value stands in.
        let jd = "We are hiring.\nYou will do many things.";
        let job = job_paste_core(
            jd.to_string(),
            Some("Senior Engineer".to_string()),
            Some("Known Corp".to_string()),
            IdentityPrecedence::Fallback,
            &pool,
        )
        .await
        .unwrap();

        assert_eq!(job.company.as_deref(), Some("Known Corp"));
        assert_eq!(job.title.as_deref(), Some("Senior Engineer"));
    }

    #[tokio::test]
    async fn reparsing_identical_text_in_fallback_mode_replaces_a_bad_title() {
        let pool = test_pool().await;
        // Same text, so the same jd_hash and the same row. The upsert used to
        // keep whatever was stored, which made a wrong title permanent even
        // after the extraction rules learned to reject it.
        let jd = "Company: Acme Corp\nPosition: Backend Engineer\nWe are hiring.";
        let first = job_paste_core(
            jd.to_string(),
            Some("The Purpose:".to_string()),
            None,
            IdentityPrecedence::Authoritative,
            &pool,
        )
        .await
        .unwrap();
        assert_eq!(first.title.as_deref(), Some("The Purpose:"));

        let second = job_paste_core(
            jd.to_string(),
            Some("The Purpose:".to_string()),
            None,
            IdentityPrecedence::Fallback,
            &pool,
        )
        .await
        .unwrap();

        assert_eq!(second.id, first.id, "same text must reuse the same row");
        assert_eq!(second.title.as_deref(), Some("Backend Engineer"));
    }

    #[tokio::test]
    async fn a_reparse_drops_a_stored_title_todays_rules_would_reject() {
        let pool = test_pool().await;
        // The reported case, end to end. "The Purpose:" was captured before the
        // section-heading rule existed. Extraction now returns nothing for this
        // text, and the page hands the stored value back on every re-parse - so
        // without validating it on the way in, the string the rules were written
        // to reject would survive them forever.
        let jd = "We are hiring.\nYou will do many things here.";
        let first = job_paste_core(
            jd.to_string(),
            Some("The Purpose:".to_string()),
            None,
            IdentityPrecedence::Authoritative,
            &pool,
        )
        .await
        .unwrap();
        assert_eq!(first.title.as_deref(), Some("The Purpose:"));

        let second = job_paste_core(
            jd.to_string(),
            Some("The Purpose:".to_string()),
            None,
            IdentityPrecedence::Fallback,
            &pool,
        )
        .await
        .unwrap();

        assert_eq!(second.id, first.id);
        assert_eq!(
            second.title, None,
            "a rejected title must clear, so the UI shows its placeholder"
        );
    }

    #[tokio::test]
    async fn a_reparse_keeps_a_stored_title_that_still_looks_like_a_role() {
        let pool = test_pool().await;
        // The other half of the same rule. A header-less JD still extracts
        // nothing, but "Senior Backend Engineer" is a real title, so dropping it
        // would lose good data to a stricter parser.
        let jd = "We are hiring.\nYou will do many things here.";
        let job = job_paste_core(
            jd.to_string(),
            Some("Senior Backend Engineer".to_string()),
            Some("Known Corp".to_string()),
            IdentityPrecedence::Fallback,
            &pool,
        )
        .await
        .unwrap();

        assert_eq!(job.title.as_deref(), Some("Senior Backend Engineer"));
        assert_eq!(job.company.as_deref(), Some("Known Corp"));
    }

    #[tokio::test]
    async fn the_authoritative_path_does_not_second_guess_its_caller() {
        let pool = test_pool().await;
        // A board can legitimately return a title our role-word list has never
        // heard of. It read a structured field; we did not, so we defer.
        let jd = "We are hiring.\nYou will do many things here.";
        let job = job_paste_core(
            jd.to_string(),
            Some("Sourdough Whisperer".to_string()),
            None,
            IdentityPrecedence::Authoritative,
            &pool,
        )
        .await
        .unwrap();

        assert_eq!(job.title.as_deref(), Some("Sourdough Whisperer"));
    }
}
