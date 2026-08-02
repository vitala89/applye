// The paste pipeline: raw job-description text in, a stored job row out.
//
// Kept apart from the scoring cache it used to share a file with, because the
// two answer different questions - "what job is this text" versus "what did we
// score it as" - and the file was at 698 of its 800-line budget.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::job_identity::{
    extract_company, extract_title, is_usable_company, is_usable_title,
};
use crate::commands::job_identity_source::{load_stored, resolve_field, ResolvedField};
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
/// any AI scoring), write the job row. `title`/`company` are optional values the
/// caller already holds; `precedence` says whether they outrank what the text
/// says or merely stand in when the text says nothing. Omitted precedence means
/// authoritative, which is what every pre-existing caller relied on.
///
/// `job_id` names the job being re-parsed. With it, the row is the identity and
/// its text is replaced in place. Without it, the text's hash is the identity,
/// which is what a first paste needs - and what re-parsing an edited description
/// must NOT use, because a changed text hashes differently, matches nothing, and
/// silently forks the job into a second one on every edit.
#[tauri::command]
pub async fn job_paste(
    jd_text: String,
    title: Option<String>,
    company: Option<String>,
    precedence: Option<IdentityPrecedence>,
    job_id: Option<i64>,
    db: State<'_, Db>,
) -> Result<crate::commands::jobs::Job, String> {
    job_paste_core(
        jd_text,
        title,
        company,
        precedence.unwrap_or_default(),
        job_id,
        &db.pool,
    )
    .await
}

/// Core of `job_paste`, decoupled from `tauri::State` so it can be exercised
/// directly against a plain pool in tests.
pub(crate) async fn job_paste_core(
    jd_text: String,
    title_override: Option<String>,
    company_override: Option<String>,
    precedence: IdentityPrecedence,
    job_id: Option<i64>,
    pool: &sqlx::SqlitePool,
) -> Result<crate::commands::jobs::Job, String> {
    let jd_hash = stable_hash(&jd_text);
    let hard_pass = hard_filter(&jd_text);
    // What this job already holds, and where each half of it came from. The
    // sources decide what a re-parse is allowed to overwrite; see
    // `job_identity_source::resolve_field`.
    let stored = load_stored(pool, job_id, &jd_hash).await?;
    let fallback = precedence == IdentityPrecedence::Fallback;
    let title = resolve_field(
        title_override,
        extract_title(&jd_text),
        stored.title.clone(),
        stored.title_source(),
        fallback,
        is_usable_title,
    );
    let company = resolve_field(
        company_override,
        extract_company(&jd_text),
        stored.company.clone(),
        stored.company_source(),
        fallback,
        is_usable_company,
    );

    // Legitimacy is informational only - it never blocks the hard filter or
    // scoring, it just gets recorded alongside the job (augmentation, not a gate).
    let (legitimacy_tier, legitimacy_notes) = if hard_pass {
        let apply_email = crate::commands::legitimacy::extract_apply_email(&jd_text);
        let (mut tier, mut notes) = crate::commands::legitimacy::legitimacy_check(
            &jd_text,
            company.value.as_deref(),
            apply_email.as_deref(),
        );
        let duplicate = crate::commands::legitimacy::duplicate_jd_other_company(
            pool,
            &jd_text,
            &jd_hash,
            company.value.as_deref(),
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

    if let Some(id) = job_id {
        return update_job_in_place(
            id,
            &jd_text,
            &jd_hash,
            company,
            title,
            hard_pass,
            &legitimacy_tier,
            &legitimacy_notes,
            pool,
        )
        .await;
    }

    // The resolved values are already the whole answer for this row - the
    // stored ones were read back and weighed above - so they are written
    // outright, including when they are NULL. Keeping the stored value on NULL
    // here would put back exactly the string the rules just rejected.
    // `identity_prompt_skipped` is deliberately absent: a re-parse is not the
    // user changing their mind about being asked.
    sqlx::query(
        "INSERT INTO jobs
           (company, title, company_source, title_source, jd_text, jd_hash,
            hard_filter_passed, legitimacy_tier, legitimacy_notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(jd_hash) DO UPDATE SET
           company            = excluded.company,
           title              = excluded.title,
           company_source     = excluded.company_source,
           title_source       = excluded.title_source,
           hard_filter_passed = excluded.hard_filter_passed,
           legitimacy_tier    = excluded.legitimacy_tier,
           legitimacy_notes   = excluded.legitimacy_notes",
    )
    .bind(&company.value)
    .bind(&title.value)
    .bind(company.source_str())
    .bind(title.source_str())
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

/// Replace an existing job's description in place.
///
/// The row is the identity here, so its text, hash and everything derived from
/// them are overwritten outright - including with NULL, since a company the new
/// text does not name is not a company this job has.
///
/// A collision is reported rather than resolved. `jd_hash` is UNIQUE, so editing
/// one job's description into a byte-identical copy of another's would violate
/// it. Merging the two silently would discard whichever row the user was not
/// looking at, along with its application and its documents, so the caller is
/// told instead.
#[allow(clippy::too_many_arguments)]
async fn update_job_in_place(
    id: i64,
    jd_text: &str,
    jd_hash: &str,
    company: ResolvedField,
    title: ResolvedField,
    hard_pass: bool,
    legitimacy_tier: &str,
    legitimacy_notes: &Option<String>,
    pool: &sqlx::SqlitePool,
) -> Result<crate::commands::jobs::Job, String> {
    let clash: Option<i64> =
        sqlx::query_scalar("SELECT id FROM jobs WHERE jd_hash = ? AND id <> ?")
            .bind(jd_hash)
            .bind(id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("job_paste: collision check: {e}"))?;
    if clash.is_some() {
        return Err(
            "This exact description is already saved as another job. Open that one, or change this text."
                .to_string(),
        );
    }

    sqlx::query(
        "UPDATE jobs SET
           company = ?, title = ?, company_source = ?, title_source = ?,
           jd_text = ?, jd_hash = ?,
           hard_filter_passed = ?, legitimacy_tier = ?, legitimacy_notes = ?
         WHERE id = ?",
    )
    .bind(&company.value)
    .bind(&title.value)
    .bind(company.source_str())
    .bind(title.source_str())
    .bind(jd_text)
    .bind(jd_hash)
    .bind(hard_pass as i64)
    .bind(legitimacy_tier)
    .bind(legitimacy_notes)
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| format!("job_paste update: {e}"))?;

    sqlx::query_as::<_, crate::commands::jobs::Job>("SELECT * FROM jobs WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("job_paste reload: {e}"))
}

#[cfg(test)]
mod tests {
    use super::{job_paste_core, IdentityPrecedence};

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
            None,
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
            None,
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
            None,
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
            None,
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
            None,
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
            None,
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
            None,
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
            None,
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
            None,
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
            None,
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
            None,
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
            None,
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
            None,
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
            None,
            &pool,
        )
        .await
        .unwrap();

        assert_eq!(job.title.as_deref(), Some("Sourdough Whisperer"));
    }

    #[tokio::test]
    async fn editing_an_existing_jobs_description_updates_it_rather_than_forking_it() {
        let pool = test_pool().await;
        // The reported bug. Identity used to be the text's hash, so an edit
        // hashed differently, matched nothing, and inserted a second job -
        // every time, while the row the user was looking at kept the old text.
        let first = job_paste_core(
            "Company: Acme Corp\nPosition: Backend Engineer\nWe are hiring.".to_string(),
            None,
            None,
            IdentityPrecedence::Authoritative,
            None,
            &pool,
        )
        .await
        .unwrap();

        let edited = job_paste_core(
            "Company: Acme Corp\nPosition: Staff Backend Engineer\nWe are still hiring."
                .to_string(),
            None,
            None,
            IdentityPrecedence::Fallback,
            Some(first.id),
            &pool,
        )
        .await
        .unwrap();

        assert_eq!(edited.id, first.id, "the edit must stay on the same job");
        assert_eq!(edited.title.as_deref(), Some("Staff Backend Engineer"));
        assert!(edited.jd_text.unwrap().contains("still hiring"));

        let rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM jobs")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(
            rows, 1,
            "editing a description must not create a second job"
        );
    }

    #[tokio::test]
    async fn editing_a_description_into_another_saved_job_is_reported_not_merged() {
        let pool = test_pool().await;
        // jd_hash is UNIQUE. Merging the two rows silently would discard
        // whichever one the user was not looking at, along with its application
        // and its documents, so the caller is told instead.
        let other = "Company: Other Corp\nPosition: Data Engineer\nWe are hiring.";
        job_paste_core(
            other.to_string(),
            None,
            None,
            IdentityPrecedence::Authoritative,
            None,
            &pool,
        )
        .await
        .unwrap();

        let mine = job_paste_core(
            "Company: Acme Corp\nPosition: Backend Engineer\nWe are hiring.".to_string(),
            None,
            None,
            IdentityPrecedence::Authoritative,
            None,
            &pool,
        )
        .await
        .unwrap();

        let result = job_paste_core(
            other.to_string(),
            None,
            None,
            IdentityPrecedence::Fallback,
            Some(mine.id),
            &pool,
        )
        .await;

        assert!(result.is_err(), "a collision must not be resolved silently");
        let rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM jobs")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(rows, 2, "both jobs must survive a rejected edit");
    }

    #[tokio::test]
    async fn a_first_paste_still_dedupes_on_identical_text() {
        let pool = test_pool().await;
        // Without a job id the text's hash is still the identity, which is what
        // stops the paste modal from stacking copies of the same posting.
        let jd = "Company: Acme Corp\nPosition: Backend Engineer\nWe are hiring.";
        let a = job_paste_core(
            jd.to_string(),
            None,
            None,
            IdentityPrecedence::Authoritative,
            None,
            &pool,
        )
        .await
        .unwrap();
        let b = job_paste_core(
            jd.to_string(),
            None,
            None,
            IdentityPrecedence::Authoritative,
            None,
            &pool,
        )
        .await
        .unwrap();

        assert_eq!(a.id, b.id);
    }
}
