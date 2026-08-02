// Where a job's company and title came from, and what a re-parse may do to
// them.
//
// Part A decided whether a value looks real. This decides whose value it is,
// which is a different question and the one that matters on the second parse:
// a company the user typed by hand must survive `is_usable_company`, and a
// company the AI named must not outrank one the posting actually states.
//
// Kept out of `job_identity.rs` (pure text rules, no storage) and out of
// `job_paste.rs` (the paste pipeline), because it is the only piece that needs
// both the stored row and the freshly parsed text.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;

/// Where a stored company or title came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IdentitySource {
    /// Read out of the posting, or handed over by a caller that read a
    /// structured field off a job board.
    Extracted,
    /// Named by the AI step, which reads prose the deterministic rules cannot.
    Inferred,
    /// Typed by the user. The authority; never overwritten.
    User,
}

impl IdentitySource {
    pub fn as_str(self) -> &'static str {
        match self {
            IdentitySource::Extracted => "extracted",
            IdentitySource::Inferred => "inferred",
            IdentitySource::User => "user",
        }
    }

    /// Parses a stored column value. An unrecognised string reads as "unknown"
    /// rather than an error: rows written before this column existed hold NULL,
    /// and a value with no known provenance is treated exactly like one of them.
    pub fn parse(raw: Option<&str>) -> Option<Self> {
        match raw?.trim() {
            "extracted" => Some(IdentitySource::Extracted),
            "inferred" => Some(IdentitySource::Inferred),
            "user" => Some(IdentitySource::User),
            _ => None,
        }
    }
}

/// The identity a job row already holds, as the re-parse needs to see it.
#[derive(Debug, Default, Clone, sqlx::FromRow)]
pub struct StoredIdentity {
    pub company: Option<String>,
    pub title: Option<String>,
    pub company_source: Option<String>,
    pub title_source: Option<String>,
}

impl StoredIdentity {
    pub fn company_source(&self) -> Option<IdentitySource> {
        IdentitySource::parse(self.company_source.as_deref())
    }

    pub fn title_source(&self) -> Option<IdentitySource> {
        IdentitySource::parse(self.title_source.as_deref())
    }
}

/// One resolved field: the value to store and where it came from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedField {
    pub value: Option<String>,
    pub source: Option<IdentitySource>,
}

impl ResolvedField {
    fn empty() -> Self {
        ResolvedField {
            value: None,
            source: None,
        }
    }

    fn of(value: String, source: IdentitySource) -> Self {
        ResolvedField {
            value: Some(value),
            source: Some(source),
        }
    }

    pub fn source_str(&self) -> Option<&'static str> {
        self.source.map(IdentitySource::as_str)
    }
}

fn non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
}

/// What one field of a job's identity becomes after a parse.
///
/// `passed` is what the caller handed in, `extracted` what the text says,
/// `stored`/`stored_source` what the row already holds. `fallback` is part A's
/// `IdentityPrecedence::Fallback`: false means the caller read a structured
/// field and outranks the text, true means the caller is handing this job's own
/// earlier values back.
///
/// The three rules the sources buy, in the order they apply:
///
/// - `user` is never overwritten, by extraction or by anything else. Without
///   this a hand-typed company is fed through `is_usable_company` on the next
///   re-parse and thrown away for not looking like a company name - a validator
///   built to reject stale garbage cannot tell it from an employer with an
///   unusual name.
/// - `inferred` yields to a real extraction and is kept when there is none. It
///   is also exempt from `usable`, which exists to re-judge values of unknown
///   provenance; the AI step's answer is not one of those.
/// - `extracted` and unknown behave exactly as part A left them.
pub fn resolve_field(
    passed: Option<String>,
    extracted: Option<String>,
    stored: Option<String>,
    stored_source: Option<IdentitySource>,
    fallback: bool,
    usable: fn(&str) -> bool,
) -> ResolvedField {
    let passed = non_empty(passed.as_deref());
    let extracted = non_empty(extracted.as_deref());
    let stored = non_empty(stored.as_deref());

    if let (Some(value), Some(IdentitySource::User)) = (stored.clone(), stored_source) {
        return ResolvedField::of(value, IdentitySource::User);
    }

    if !fallback {
        // Authoritative. The stored value still wins when it exists, which is
        // what part A's `COALESCE(NULLIF(jobs.company, ''), excluded.company)`
        // did: a caller with board metadata may backfill a gap but may not
        // rewrite a job the user is already looking at.
        return match stored.or(passed).or(extracted) {
            Some(value) => ResolvedField::of(value, IdentitySource::Extracted),
            None => ResolvedField::empty(),
        };
    }

    if let Some(value) = extracted {
        return ResolvedField::of(value, IdentitySource::Extracted);
    }

    // Nothing in the text. Keep what is held, if today's rules still allow it.
    let (held, held_source) = match stored {
        Some(value) => (Some(value), stored_source),
        None => (passed, None),
    };
    match (held, held_source) {
        (Some(value), Some(IdentitySource::Inferred)) => {
            ResolvedField::of(value, IdentitySource::Inferred)
        }
        (Some(value), _) if usable(&value) => ResolvedField::of(value, IdentitySource::Extracted),
        _ => ResolvedField::empty(),
    }
}

/// The identity a job row already holds. Looked up by row id when one is known,
/// otherwise by the text's hash, which is the identity of a first paste.
pub async fn load_stored(
    pool: &sqlx::SqlitePool,
    job_id: Option<i64>,
    jd_hash: &str,
) -> Result<StoredIdentity, String> {
    let row =
        match job_id {
            Some(id) => {
                sqlx::query_as::<_, StoredIdentity>(
                    "SELECT company, title, company_source, title_source FROM jobs WHERE id = ?",
                )
                .bind(id)
                .fetch_optional(pool)
                .await
            }
            None => sqlx::query_as::<_, StoredIdentity>(
                "SELECT company, title, company_source, title_source FROM jobs WHERE jd_hash = ?",
            )
            .bind(jd_hash)
            .fetch_optional(pool)
            .await,
        };
    row.map(Option::unwrap_or_default)
        .map_err(|e| format!("job identity: load stored: {e}"))
}

/// Write a job's company and title, and where each came from.
///
/// Used by the AI step (source `inferred`) and by the dialog (source `user`).
/// It touches the identity columns only: `jd_text` and `jd_hash` are left
/// exactly as they are, so naming a company cannot fork the job into a second
/// row or invalidate the score cached against its text.
#[tauri::command]
pub async fn job_set_identity(
    job_id: i64,
    title: Option<String>,
    company: Option<String>,
    title_source: Option<IdentitySource>,
    company_source: Option<IdentitySource>,
    db: State<'_, Db>,
) -> Result<crate::commands::jobs::Job, String> {
    job_set_identity_core(
        job_id,
        title,
        company,
        title_source,
        company_source,
        &db.pool,
    )
    .await
}

/// Core of `job_set_identity`, decoupled from `tauri::State` for tests.
pub(crate) async fn job_set_identity_core(
    job_id: i64,
    title: Option<String>,
    company: Option<String>,
    title_source: Option<IdentitySource>,
    company_source: Option<IdentitySource>,
    pool: &sqlx::SqlitePool,
) -> Result<crate::commands::jobs::Job, String> {
    let title = non_empty(title.as_deref());
    let company = non_empty(company.as_deref());
    sqlx::query(
        "UPDATE jobs SET
           title = ?, company = ?, title_source = ?, company_source = ?
         WHERE id = ?",
    )
    .bind(&title)
    .bind(&company)
    .bind(title_source.map(IdentitySource::as_str))
    .bind(company_source.map(IdentitySource::as_str))
    .bind(job_id)
    .execute(pool)
    .await
    .map_err(|e| format!("job_set_identity: {e}"))?;

    sqlx::query_as::<_, crate::commands::jobs::Job>("SELECT * FROM jobs WHERE id = ?")
        .bind(job_id)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("job_set_identity reload: {e}"))
}

/// Record that the user was asked to name this job and chose Skip, so the
/// dialog does not return on every re-parse.
#[tauri::command]
pub async fn job_skip_identity_prompt(job_id: i64, db: State<'_, Db>) -> Result<(), String> {
    job_skip_identity_prompt_core(job_id, &db.pool).await
}

pub(crate) async fn job_skip_identity_prompt_core(
    job_id: i64,
    pool: &sqlx::SqlitePool,
) -> Result<(), String> {
    sqlx::query("UPDATE jobs SET identity_prompt_skipped = 1 WHERE id = ?")
        .bind(job_id)
        .execute(pool)
        .await
        .map(|_| ())
        .map_err(|e| format!("job_skip_identity_prompt: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::job_identity::{is_usable_company, is_usable_title};
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

    fn s(v: &str) -> Option<String> {
        Some(v.to_string())
    }

    #[test]
    fn a_user_value_survives_a_validator_that_would_reject_it() {
        // "Jobgether" style: a real employer whose name carries none of the
        // signals `is_usable_company` looks for. The user typed it; the parser
        // does not get a vote.
        let r = resolve_field(
            s("we ARE hiring gmbh"),
            s("Text Corp"),
            s("we ARE hiring gmbh"),
            Some(IdentitySource::User),
            true,
            is_usable_company,
        );
        assert_eq!(r.value.as_deref(), Some("we ARE hiring gmbh"));
        assert_eq!(r.source, Some(IdentitySource::User));
    }

    #[test]
    fn a_user_value_is_not_overwritten_on_the_authoritative_path_either() {
        let r = resolve_field(
            s("Board Corp"),
            s("Text Corp"),
            s("Typed Corp"),
            Some(IdentitySource::User),
            false,
            is_usable_company,
        );
        assert_eq!(r.value.as_deref(), Some("Typed Corp"));
        assert_eq!(r.source, Some(IdentitySource::User));
    }

    #[test]
    fn a_real_extraction_replaces_an_inferred_value() {
        let r = resolve_field(
            s("Guessed Corp"),
            s("Text Corp"),
            s("Guessed Corp"),
            Some(IdentitySource::Inferred),
            true,
            is_usable_company,
        );
        assert_eq!(r.value.as_deref(), Some("Text Corp"));
        assert_eq!(r.source, Some(IdentitySource::Extracted));
    }

    #[test]
    fn an_inferred_value_is_kept_when_extraction_finds_nothing() {
        // And kept without being re-judged: the AI reads prose the rules
        // cannot, so a title they would reject is exactly what this stores.
        let r = resolve_field(
            s("Sourdough Whisperer"),
            None,
            s("Sourdough Whisperer"),
            Some(IdentitySource::Inferred),
            true,
            is_usable_title,
        );
        assert_eq!(r.value.as_deref(), Some("Sourdough Whisperer"));
        assert_eq!(r.source, Some(IdentitySource::Inferred));
    }

    #[test]
    fn an_extracted_value_of_unknown_provenance_is_still_re_judged() {
        // Part A's rule, unchanged: a value stored before today's rules existed
        // has to face them, or "The Purpose:" outlives every parse.
        let r = resolve_field(
            s("The Purpose:"),
            None,
            s("The Purpose:"),
            Some(IdentitySource::Extracted),
            true,
            is_usable_title,
        );
        assert_eq!(r.value, None);
        assert_eq!(r.source, None);
    }

    #[test]
    fn a_held_value_that_still_looks_real_survives_with_no_stored_source() {
        let r = resolve_field(
            s("Senior Backend Engineer"),
            None,
            None,
            None,
            true,
            is_usable_title,
        );
        assert_eq!(r.value.as_deref(), Some("Senior Backend Engineer"));
        assert_eq!(r.source, Some(IdentitySource::Extracted));
    }

    #[test]
    fn an_unrecognised_stored_source_reads_as_unknown() {
        assert_eq!(IdentitySource::parse(None), None);
        assert_eq!(IdentitySource::parse(Some("guessed")), None);
        assert_eq!(
            IdentitySource::parse(Some("user")),
            Some(IdentitySource::User)
        );
    }

    /// The reason the sources exist. A company typed by hand carries none of
    /// the signals `is_usable_company` looks for, so before part B the next
    /// re-parse fed it through that validator and threw it away for not looking
    /// like a company name.
    #[tokio::test]
    async fn a_reparse_never_overwrites_a_company_the_user_typed() {
        let pool = test_pool().await;
        let jd = "We are hiring.\nYou will do many things here.";
        let first = job_paste_core(
            jd.to_string(),
            None,
            None,
            IdentityPrecedence::Authoritative,
            None,
            &pool,
        )
        .await
        .unwrap();
        assert_eq!(
            first.company, None,
            "the fixture must leave the company unnamed, or this proves nothing"
        );

        let named = job_set_identity_core(
            first.id,
            Some("we ARE hiring gmbh".to_string()),
            Some("on behalf of nobody".to_string()),
            Some(IdentitySource::User),
            Some(IdentitySource::User),
            &pool,
        )
        .await
        .unwrap();
        assert_eq!(named.company.as_deref(), Some("on behalf of nobody"));

        let reparsed = job_paste_core(
            jd.to_string(),
            named.title.clone(),
            named.company.clone(),
            IdentityPrecedence::Fallback,
            Some(first.id),
            &pool,
        )
        .await
        .unwrap();

        assert_eq!(reparsed.company.as_deref(), Some("on behalf of nobody"));
        assert_eq!(reparsed.title.as_deref(), Some("we ARE hiring gmbh"));
        assert_eq!(reparsed.company_source.as_deref(), Some("user"));
        assert_eq!(reparsed.title_source.as_deref(), Some("user"));
    }

    /// Even a posting that names a company outright loses to the user.
    #[tokio::test]
    async fn a_user_value_outranks_a_freshly_extracted_one() {
        let pool = test_pool().await;
        let jd = "Company: Text Corp\nPosition: Text Engineer\nWe are hiring.";
        let first = job_paste_core(
            jd.to_string(),
            None,
            None,
            IdentityPrecedence::Authoritative,
            None,
            &pool,
        )
        .await
        .unwrap();
        job_set_identity_core(
            first.id,
            Some("Typed Engineer".to_string()),
            Some("Typed Corp".to_string()),
            Some(IdentitySource::User),
            Some(IdentitySource::User),
            &pool,
        )
        .await
        .unwrap();

        let reparsed = job_paste_core(
            jd.to_string(),
            None,
            None,
            IdentityPrecedence::Fallback,
            Some(first.id),
            &pool,
        )
        .await
        .unwrap();

        assert_eq!(reparsed.company.as_deref(), Some("Typed Corp"));
        assert_eq!(reparsed.title.as_deref(), Some("Typed Engineer"));
    }

    #[tokio::test]
    async fn a_reparse_replaces_an_inferred_value_with_a_real_extraction() {
        let pool = test_pool().await;
        let bare = "We are hiring.\nYou will do many things here.";
        let first = job_paste_core(
            bare.to_string(),
            None,
            None,
            IdentityPrecedence::Authoritative,
            None,
            &pool,
        )
        .await
        .unwrap();
        job_set_identity_core(
            first.id,
            Some("Guessed Engineer".to_string()),
            Some("Guessed Corp".to_string()),
            Some(IdentitySource::Inferred),
            Some(IdentitySource::Inferred),
            &pool,
        )
        .await
        .unwrap();

        // The user pastes a fuller copy of the same posting over it.
        let full = "Company: Text Corp\nPosition: Text Engineer\nWe are hiring.";
        let reparsed = job_paste_core(
            full.to_string(),
            Some("Guessed Engineer".to_string()),
            Some("Guessed Corp".to_string()),
            IdentityPrecedence::Fallback,
            Some(first.id),
            &pool,
        )
        .await
        .unwrap();

        assert_eq!(reparsed.company.as_deref(), Some("Text Corp"));
        assert_eq!(reparsed.title.as_deref(), Some("Text Engineer"));
        assert_eq!(reparsed.company_source.as_deref(), Some("extracted"));
    }

    /// An inferred title is kept when the text still says nothing - and kept
    /// without being re-judged, because the AI read prose the rules cannot.
    /// `is_usable_title` would reject this one outright.
    #[tokio::test]
    async fn a_reparse_keeps_an_inferred_value_when_extraction_finds_nothing() {
        let pool = test_pool().await;
        let jd = "We are hiring.\nYou will do many things here.";
        let first = job_paste_core(
            jd.to_string(),
            None,
            None,
            IdentityPrecedence::Authoritative,
            None,
            &pool,
        )
        .await
        .unwrap();
        assert!(
            crate::commands::job_identity::extract_title(jd).is_none(),
            "the fixture must extract no title, or this proves nothing"
        );
        job_set_identity_core(
            first.id,
            Some("Sourdough Whisperer".to_string()),
            None,
            Some(IdentitySource::Inferred),
            None,
            &pool,
        )
        .await
        .unwrap();

        let reparsed = job_paste_core(
            jd.to_string(),
            Some("Sourdough Whisperer".to_string()),
            None,
            IdentityPrecedence::Fallback,
            Some(first.id),
            &pool,
        )
        .await
        .unwrap();

        assert_eq!(reparsed.title.as_deref(), Some("Sourdough Whisperer"));
        assert_eq!(reparsed.title_source.as_deref(), Some("inferred"));
    }

    #[tokio::test]
    async fn the_skip_flag_survives_a_reparse() {
        let pool = test_pool().await;
        let jd = "We are hiring.\nYou will do many things here.";
        let first = job_paste_core(
            jd.to_string(),
            None,
            None,
            IdentityPrecedence::Authoritative,
            None,
            &pool,
        )
        .await
        .unwrap();
        job_skip_identity_prompt_core(first.id, &pool)
            .await
            .unwrap();

        let reparsed = job_paste_core(
            jd.to_string(),
            None,
            None,
            IdentityPrecedence::Fallback,
            Some(first.id),
            &pool,
        )
        .await
        .unwrap();

        assert_eq!(reparsed.identity_prompt_skipped, Some(true));
    }

    /// `job_set_identity` owns the job row's identity and nothing else: the
    /// description and its hash are what the score is cached against, and a
    /// changed hash forks the job.
    #[tokio::test]
    async fn setting_an_identity_touches_neither_the_text_nor_its_hash() {
        let pool = test_pool().await;
        let jd = "Company: Acme Corp\nPosition: Backend Engineer\nWe are hiring.";
        let first = job_paste_core(
            jd.to_string(),
            None,
            None,
            IdentityPrecedence::Authoritative,
            None,
            &pool,
        )
        .await
        .unwrap();

        let updated = job_set_identity_core(
            first.id,
            Some("Staff Backend Engineer".to_string()),
            Some("Contoso GmbH".to_string()),
            Some(IdentitySource::User),
            Some(IdentitySource::User),
            &pool,
        )
        .await
        .unwrap();

        assert_eq!(updated.id, first.id);
        assert_eq!(updated.jd_hash, first.jd_hash);
        assert_eq!(updated.jd_text, first.jd_text);
        assert_eq!(updated.legitimacy_tier, first.legitimacy_tier);

        let rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM jobs")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(rows, 1, "naming a job must not create a second one");
    }
}
