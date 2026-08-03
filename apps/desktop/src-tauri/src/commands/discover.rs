// Discover scan engine (ROADMAP §11, branch `feat/discover`).
//
// Deterministic Tier-2/Tier-3 collection: every enabled source's public
// JSON/RSS feed is fetched over HTTPS and parsed with the same known-shape
// readers as the paste-from-link flow (never arbitrary HTML). Jobs are then
// filtered locally - title keywords + geo scope, 0 tokens - and deduped into
// `jobs` by `jd_hash` with INSERT OR IGNORE, so a scan can never overwrite
// user data and a dismissed job stays dismissed. AI never touches collection.

use serde::Serialize;
use sqlx::{Row, SqlitePool};
use tauri::State;

use super::discover_fetch::{
    fetch_arbeitsagentur_detail, fetch_nofluffjobs_detail, fetch_source_jobs, http_client,
    SourceRow, ARBEITSAGENTUR_DETAIL_CAP,
};
use super::discover_filter::{
    build_geo_cfg, build_market_cfg, derive_title_keywords, geo_passes, parse_geo_scopes,
    parse_keyword_list, source_serves_markets, title_passes, TitleFilter,
};
use super::discover_geo::parse_local_markets;
use super::discover_parsers::RawJob;
use crate::db::{stable_hash, Db};

// ---------------------------------------------------------------------------
// Public result shapes (serialized to the frontend)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSourceResult {
    pub source_id: i64,
    pub source_name: String,
    pub fetched: i64,
    pub filtered_out: i64,
    pub duplicates: i64,
    pub new_jobs: i64,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSummary {
    pub sources: Vec<ScanSourceResult>,
    pub total_fetched: i64,
    pub total_new: i64,
    pub duration_ms: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverFeedItem {
    pub id: i64,
    pub company: Option<String>,
    pub title: Option<String>,
    pub location: Option<String>,
    pub source: Option<String>,
    pub created_at: Option<String>,
    /// NULL until the feed has been opened once with this job in it - the UI
    /// uses "was NULL when listed" as the NEW marker.
    pub discover_shown_at: Option<String>,
    /// First lines of the JD for the inline row preview.
    pub jd_preview: Option<String>,
    /// Original posting URL ("View original posting").
    pub source_url: Option<String>,
    /// True when an application row exists for this job (Save already done).
    pub saved: bool,
}

// ---------------------------------------------------------------------------
// Insert + dedupe
// ---------------------------------------------------------------------------

/// Insert one scanned job. INSERT OR IGNORE on the jd_hash UNIQUE index is the
/// dedupe: re-scans, cross-source duplicates, and previously dismissed jobs
/// (same hash, still in the table) are all silently skipped, never updated.
/// Returns true when the row is new.
async fn insert_scanned_job(
    pool: &SqlitePool,
    job: &RawJob,
    source_name: &str,
) -> Result<bool, String> {
    // A feed item with no description still needs a stable, distinct hash -
    // fall back to a minimal text body that includes the posting URL.
    let jd_text = if job.jd_text.trim().is_empty() {
        format!(
            "{} at {}\n{}\n(No description provided by the source feed.)",
            job.title, job.company, job.url
        )
    } else {
        job.jd_text.clone()
    };
    let jd_hash = stable_hash(&jd_text);

    let result = sqlx::query(
        "INSERT OR IGNORE INTO jobs
           (company, title, jd_text, jd_hash, source, location, source_url,
            imported_from, discover_dismissed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'discover_scan', 0, datetime('now'))",
    )
    .bind(&job.company)
    .bind(&job.title)
    .bind(&jd_text)
    .bind(&jd_hash)
    .bind(source_name)
    .bind(&job.location)
    .bind(&job.url)
    .execute(pool)
    .await
    .map_err(|e| format!("insert job: {e}"))?;

    Ok(result.rows_affected() == 1)
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn discover_scan(db: State<'_, Db>) -> Result<ScanSummary, String> {
    let started = std::time::Instant::now();

    let source_rows = sqlx::query(
        "SELECT id, name, type, url, slug,
                title_filter_positive_json, title_filter_negative_json,
                geo_tags_json
         FROM sources
         WHERE is_enabled = 1 AND type != 'manual'
         ORDER BY id",
    )
    .fetch_all(&db.pool)
    .await
    .map_err(|e| format!("discover_scan: load sources: {e}"))?;

    let sources: Vec<SourceRow> = source_rows
        .iter()
        .map(|r| SourceRow {
            id: r.get("id"),
            name: r.get::<Option<String>, _>("name").unwrap_or_default(),
            source_type: r.get::<Option<String>, _>("type").unwrap_or_default(),
            url: r.get::<Option<String>, _>("url").unwrap_or_default(),
            slug: r.get("slug"),
            positive_json: r.get("title_filter_positive_json"),
            negative_json: r.get("title_filter_negative_json"),
            geo_tags_json: r.get("geo_tags_json"),
        })
        .collect();

    let geo_scope_raw: String = sqlx::query_scalar("SELECT geo_scope FROM settings WHERE id = 1")
        .fetch_optional(&db.pool)
        .await
        .map_err(|e| format!("discover_scan: load settings: {e}"))?
        .unwrap_or_default();
    let geo_scopes = parse_geo_scopes(&geo_scope_raw);
    let market_raw: Option<String> = sqlx::query_scalar("SELECT market FROM settings WHERE id = 1")
        .fetch_optional(&db.pool)
        .await
        .map_err(|e| format!("discover_scan: load market: {e}"))?
        .flatten();
    let markets = parse_local_markets(market_raw.as_deref().unwrap_or_default());
    // The two geo modes are mutually exclusive (see libs/core local-market.ts):
    // a local market narrows to its countries and the region scope sits out
    // entirely; with no market selected the region scope applies as before.
    let geo_cfg = if markets.is_empty() {
        let active_codes: Vec<String> =
            sqlx::query_scalar("SELECT country_code FROM geo_filters WHERE is_active = 1")
                .fetch_all(&db.pool)
                .await
                .map_err(|e| format!("discover_scan: load geo filters: {e}"))?;
        build_geo_cfg(&geo_scopes, &active_codes)
    } else {
        build_market_cfg(&markets)
    };

    let archetypes: Option<String> =
        sqlx::query_scalar("SELECT target_archetypes FROM profile WHERE id = 1")
            .fetch_optional(&db.pool)
            .await
            .map_err(|e| format!("discover_scan: load profile: {e}"))?
            .flatten();
    let derived_keywords = derive_title_keywords(archetypes.as_deref());

    let client = http_client()?;
    let mut results: Vec<ScanSourceResult> = Vec::new();

    for src in &sources {
        let mut r = ScanSourceResult {
            source_id: src.id,
            source_name: src.name.clone(),
            fetched: 0,
            filtered_out: 0,
            duplicates: 0,
            new_jobs: 0,
            error: None,
        };

        match fetch_source_jobs(&client, src).await {
            Err(e) => r.error = Some(e),
            Ok(raw_jobs) => {
                r.fetched = raw_jobs.len() as i64;

                let serves_market = source_serves_markets(src.geo_tags_json.as_deref(), &markets);

                let positive = {
                    let own = parse_keyword_list(src.positive_json.as_deref());
                    if own.is_empty() {
                        derived_keywords.clone()
                    } else {
                        own
                    }
                };
                let filter = TitleFilter {
                    positive,
                    negative: parse_keyword_list(src.negative_json.as_deref()),
                };

                // Detail requests are spent only on jobs that survived the
                // local filters, and only up to the per-scan cap.
                let mut detail_budget = ARBEITSAGENTUR_DETAIL_CAP;

                for job in &raw_jobs {
                    if job.title.trim().is_empty()
                        || !title_passes(&job.title, &filter)
                        || !geo_passes(&job.location, &geo_cfg, serves_market)
                    {
                        r.filtered_out += 1;
                        continue;
                    }

                    // A failed or skipped detail request is not a scan error:
                    // the job still lands with its placeholder body.
                    let detailed: Option<RawJob> = match job.detail_ref.as_deref() {
                        Some(reference) if detail_budget > 0 => {
                            detail_budget -= 1;
                            let fetched = match src.source_type.as_str() {
                                "api_arbeitsagentur" => {
                                    fetch_arbeitsagentur_detail(&client, reference).await
                                }
                                "api_nofluffjobs" => {
                                    fetch_nofluffjobs_detail(&client, reference).await
                                }
                                _ => Ok(String::new()),
                            };
                            match fetched {
                                Ok(text) if !text.trim().is_empty() => {
                                    let mut j = job.clone();
                                    j.jd_text = text;
                                    Some(j)
                                }
                                _ => None,
                            }
                        }
                        _ => None,
                    };
                    let job = detailed.as_ref().unwrap_or(job);

                    match insert_scanned_job(&db.pool, job, &src.name).await {
                        Ok(true) => r.new_jobs += 1,
                        Ok(false) => r.duplicates += 1,
                        Err(e) => r.error = Some(e),
                    }
                }
            }
        }

        // Best-effort bookkeeping for the Sources UI; a failed update must not
        // fail the scan itself.
        let _ = sqlx::query(
            "UPDATE sources SET last_scan_at = datetime('now'), last_scan_json = ? WHERE id = ?",
        )
        .bind(serde_json::to_string(&r).unwrap_or_default())
        .bind(src.id)
        .execute(&db.pool)
        .await;

        results.push(r);
    }

    // Record the market this scan ran under so the Discover feed can prompt a
    // refresh when the user later changes it. Best-effort: ignore any error.
    let _ = record_scan_market(&db.pool, market_raw.as_deref()).await;

    Ok(ScanSummary {
        total_fetched: results.iter().map(|r| r.fetched).sum(),
        total_new: results.iter().map(|r| r.new_jobs).sum(),
        duration_ms: started.elapsed().as_millis() as i64,
        sources: results,
    })
}

#[tauri::command]
pub async fn db_discover_feed(db: State<'_, Db>) -> Result<Vec<DiscoverFeedItem>, String> {
    let rows = sqlx::query(
        "SELECT j.id, j.company, j.title, j.location, j.source, j.created_at,
                j.discover_shown_at, substr(j.jd_text, 1, 400) AS jd_preview,
                j.source_url,
                EXISTS(SELECT 1 FROM applications a WHERE a.job_id = j.id) AS saved
         FROM jobs j
         WHERE j.imported_from = 'discover_scan' AND j.discover_dismissed = 0
         ORDER BY j.created_at DESC, j.id DESC
         LIMIT 300",
    )
    .fetch_all(&db.pool)
    .await
    .map_err(|e| format!("db_discover_feed: {e}"))?;

    let items: Vec<DiscoverFeedItem> = rows
        .iter()
        .map(|r| DiscoverFeedItem {
            id: r.get("id"),
            company: r.get("company"),
            title: r.get("title"),
            location: r.get("location"),
            source: r.get("source"),
            created_at: r.get("created_at"),
            discover_shown_at: r.get("discover_shown_at"),
            jd_preview: r.get("jd_preview"),
            source_url: r.get("source_url"),
            saved: r.get::<i64, _>("saved") == 1,
        })
        .collect();

    // Everything just listed counts as surfaced; rows returned above keep
    // their pre-update value so the UI can mark them NEW exactly once.
    sqlx::query(
        "UPDATE jobs SET discover_shown_at = datetime('now')
         WHERE imported_from = 'discover_scan' AND discover_dismissed = 0
           AND discover_shown_at IS NULL",
    )
    .execute(&db.pool)
    .await
    .map_err(|e| format!("db_discover_feed: mark shown: {e}"))?;

    Ok(items)
}

/// Records the market a scan ran under, for the Discover feed's refresh prompt.
/// Best-effort by construction: the caller ignores the result so a failed write
/// never fails the scan.
async fn record_scan_market(
    pool: &SqlitePool,
    market_raw: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE settings SET last_scan_market = ? WHERE id = 1")
        .bind(market_raw)
        .execute(pool)
        .await?;
    Ok(())
}

/// Delete every scanned job the user has not saved. Pure over the pool so it is
/// unit-testable; saved jobs own an `applications` row and are left untouched.
async fn discover_clear_core(pool: &SqlitePool) -> Result<u64, sqlx::Error> {
    let res = sqlx::query(
        "DELETE FROM jobs
         WHERE imported_from = 'discover_scan'
           AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.job_id = jobs.id)",
    )
    .execute(pool)
    .await?;
    Ok(res.rows_affected())
}

/// Clear the Discover inbox: delete every scanned job the user has not saved
/// (saved jobs live on in My Jobs / Pipeline). Returns how many rows were
/// removed. A fresh scan repopulates the feed.
#[tauri::command]
pub async fn db_discover_clear(db: State<'_, Db>) -> Result<u64, String> {
    discover_clear_core(&db.pool)
        .await
        .map_err(|e| format!("db_discover_clear: {e}"))
}

/// Dismiss (or un-dismiss, for the inline Undo) a scanned job.
#[tauri::command]
pub async fn db_discover_dismiss(
    job_id: i64,
    dismissed: bool,
    db: State<'_, Db>,
) -> Result<(), String> {
    sqlx::query("UPDATE jobs SET discover_dismissed = ? WHERE id = ?")
        .bind(if dismissed { 1 } else { 0 })
        .bind(job_id)
        .execute(&db.pool)
        .await
        .map_err(|e| format!("db_discover_dismiss: {e}"))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests (fixtures only - no network)
// ---------------------------------------------------------------------------

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    pub(crate) async fn test_pool() -> SqlitePool {
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
    async fn record_scan_market_writes_the_raw_market_value() {
        let pool = test_pool().await;
        // Nothing scanned yet.
        let before: Option<String> =
            sqlx::query_scalar("SELECT last_scan_market FROM settings WHERE id = 1")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(before, None);

        record_scan_market(&pool, Some(r#"["ru"]"#)).await.unwrap();

        let after: Option<String> =
            sqlx::query_scalar("SELECT last_scan_market FROM settings WHERE id = 1")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(after.as_deref(), Some(r#"["ru"]"#));

        // A later scan with no market clears it back to NULL, so the banner logic
        // sees "scanned under worldwide" rather than a stale market.
        record_scan_market(&pool, None).await.unwrap();
        let cleared: Option<String> =
            sqlx::query_scalar("SELECT last_scan_market FROM settings WHERE id = 1")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(cleared, None);
    }

    fn raw(title: &str, jd: &str, url: &str) -> RawJob {
        RawJob {
            title: title.to_string(),
            company: "Acme".to_string(),
            jd_text: jd.to_string(),
            location: "Remote".to_string(),
            url: url.to_string(),
            detail_ref: None,
        }
    }

    // -- parsers -------------------------------------------------------------

    // -- dedupe --------------------------------------------------------------

    #[tokio::test]
    async fn scan_insert_dedupes_by_jd_hash() {
        let pool = test_pool().await;
        let job = raw("Senior Dev", "A long unique description", "https://x/1");
        assert!(insert_scanned_job(&pool, &job, "Remotive").await.unwrap());
        assert!(!insert_scanned_job(&pool, &job, "Remotive").await.unwrap());

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM jobs")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 1);
    }

    #[tokio::test]
    async fn dismissed_job_stays_dismissed_on_rescan() {
        let pool = test_pool().await;
        let job = raw("Senior Dev", "Another unique description", "https://x/2");
        insert_scanned_job(&pool, &job, "Remotive").await.unwrap();
        sqlx::query("UPDATE jobs SET discover_dismissed = 1")
            .execute(&pool)
            .await
            .unwrap();

        // Re-scan finds the same job again - it must stay ignored + dismissed.
        assert!(!insert_scanned_job(&pool, &job, "Remotive").await.unwrap());
        let dismissed: i64 = sqlx::query_scalar("SELECT discover_dismissed FROM jobs LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(dismissed, 1);
    }

    #[tokio::test]
    async fn discover_clear_deletes_only_unsaved_scanned_jobs() {
        let pool = test_pool().await;
        // Two scanned jobs; save the first by giving it an application row.
        insert_scanned_job(
            &pool,
            &raw("Saved Role", "jd one", "https://x/1"),
            "Remotive",
        )
        .await
        .unwrap();
        insert_scanned_job(
            &pool,
            &raw("Unsaved Role", "jd two", "https://x/2"),
            "Remotive",
        )
        .await
        .unwrap();
        let saved_id: i64 = sqlx::query_scalar("SELECT id FROM jobs WHERE title = 'Saved Role'")
            .fetch_one(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO applications (job_id, status, updated_at) VALUES (?, 'saved', datetime('now'))")
            .bind(saved_id)
            .execute(&pool)
            .await
            .unwrap();

        let removed = discover_clear_core(&pool).await.unwrap();
        assert_eq!(removed, 1, "only the unsaved job should be deleted");

        let remaining: Vec<String> = sqlx::query_scalar("SELECT title FROM jobs ORDER BY title")
            .fetch_all(&pool)
            .await
            .unwrap();
        assert_eq!(remaining, vec!["Saved Role".to_string()]);
    }

    // -- live network checks (run manually: cargo test -- --ignored) ---------

    fn live_source(id: i64, name: &str, source_type: &str, url: &str) -> SourceRow {
        SourceRow {
            id,
            name: name.to_string(),
            source_type: source_type.to_string(),
            url: url.to_string(),
            slug: None,
            positive_json: None,
            negative_json: None,
            geo_tags_json: None,
        }
    }

    #[tokio::test]
    #[ignore = "hits real Tier-2 endpoints; run manually"]
    async fn live_tier2_sources_fetch_and_parse() {
        let client = http_client().expect("client");
        let sources = [
            live_source(1, "Remotive", "api", "https://remotive.com/api/remote-jobs"),
            live_source(
                2,
                "WWR",
                "rss",
                "https://weworkremotely.com/remote-jobs.rss",
            ),
            live_source(3, "Himalayas", "api", "https://himalayas.app/jobs/api"),
            live_source(5, "DOU.ua", "rss", "https://jobs.dou.ua/vacancies/feeds/"),
            live_source(6, "Djinni.co", "rss", "https://djinni.co/jobs/rss/"),
            live_source(7, "Habr Career", "rss", "https://career.habr.com/vacancies/rss"),
            live_source(8, "Jobicy", "rss", "https://jobicy.com/?feed=job_feed"),
            live_source(
                9,
                "TrudVsem",
                "api_trudvsem",
                "https://opendata.trudvsem.ru/api/v1/vacancies?limit=100",
            ),
            live_source(
                10,
                "Arbeitnow",
                "api_arbeitnow",
                "https://www.arbeitnow.com/api/job-board-api",
            ),
            live_source(
                11,
                "No Fluff Jobs",
                "api_nofluffjobs",
                "https://nofluffjobs.com/api/joboffers/main?salaryCurrency=PLN&salaryPeriod=month&region=pl",
            ),
        ];
        for src in &sources {
            let jobs = fetch_source_jobs(&client, src)
                .await
                .unwrap_or_else(|e| panic!("{}: {e}", src.name));
            assert!(!jobs.is_empty(), "{}: no jobs parsed", src.name);
            let j = &jobs[0];
            assert!(!j.title.is_empty(), "{}: empty title", src.name);
            assert!(!j.jd_text.is_empty(), "{}: empty jd", src.name);
        }
    }

    #[tokio::test]
    async fn empty_description_falls_back_to_distinct_hashes() {
        let pool = test_pool().await;
        let a = raw("Dev A", "", "https://x/a");
        let b = raw("Dev B", "", "https://x/b");
        assert!(insert_scanned_job(&pool, &a, "WWR").await.unwrap());
        assert!(insert_scanned_job(&pool, &b, "WWR").await.unwrap());
    }
}
