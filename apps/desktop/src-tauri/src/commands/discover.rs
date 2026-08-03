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
    require_https, SourceRow, ARBEITSAGENTUR_DETAIL_CAP,
};
use super::discover_filter::{
    build_geo_cfg, build_market_cfg, derive_title_keywords, geo_passes, parse_geo_scopes,
    parse_keyword_list, source_serves_markets, title_passes, TitleFilter,
};
use super::discover_geo::parse_local_markets;
use super::discover_parsers::RawJob;
use super::job_url::extract_host;
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceListItem {
    pub id: i64,
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub source_type: Option<String>,
    pub url: Option<String>,
    pub slug: Option<String>,
    pub is_builtin: bool,
    pub is_enabled: bool,
    pub geo_tags_json: Option<String>,
    pub legality_note: Option<String>,
    pub last_scan_at: Option<String>,
    pub last_scan_json: Option<String>,
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

#[tauri::command]
pub async fn db_list_sources(db: State<'_, Db>) -> Result<Vec<SourceListItem>, String> {
    let rows = sqlx::query(
        "SELECT id, name, type, url, slug, is_builtin, is_enabled,
                geo_tags_json, legality_note, last_scan_at, last_scan_json
         FROM sources
         WHERE type != 'manual'
         ORDER BY is_builtin DESC, id",
    )
    .fetch_all(&db.pool)
    .await
    .map_err(|e| format!("db_list_sources: {e}"))?;

    Ok(rows
        .iter()
        .map(|r| SourceListItem {
            id: r.get("id"),
            name: r.get("name"),
            source_type: r.get("type"),
            url: r.get("url"),
            slug: r.get("slug"),
            is_builtin: r.get::<Option<i64>, _>("is_builtin").unwrap_or(0) == 1,
            is_enabled: r.get::<Option<i64>, _>("is_enabled").unwrap_or(0) == 1,
            geo_tags_json: r.get("geo_tags_json"),
            legality_note: r.get("legality_note"),
            last_scan_at: r.get("last_scan_at"),
            last_scan_json: r.get("last_scan_json"),
        })
        .collect())
}

#[tauri::command]
pub async fn db_set_source_enabled(
    source_id: i64,
    enabled: bool,
    db: State<'_, Db>,
) -> Result<(), String> {
    sqlx::query("UPDATE sources SET is_enabled = ? WHERE id = ?")
        .bind(if enabled { 1 } else { 0 })
        .bind(source_id)
        .execute(&db.pool)
        .await
        .map_err(|e| format!("db_set_source_enabled: {e}"))?;
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketSourceItem {
    pub id: i64,
    pub name: String,
    /// Host only, so the confirmation names exactly what will be contacted.
    pub host: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketSourcePlan {
    pub to_enable: Vec<MarketSourceItem>,
    pub to_disable: Vec<MarketSourceItem>,
}

/// What changing the market would do to the built-in sources. Read-only, and
/// it proposes only rows that would actually change, so the confirmation never
/// lists a source that is already in the right state.
///
/// Enable when the tags intersect the markets; disable when they do not AND the
/// source is not tagged worldwide. The two are disjoint, so a dual-tagged
/// source like Jobicy (`["us","worldwide"]`) is offered for enabling under a US
/// market and left alone under any other. User-added rows are never touched.
async fn market_source_plan(
    pool: &SqlitePool,
    markets: &[String],
) -> Result<MarketSourcePlan, String> {
    let rows = sqlx::query(
        "SELECT id, name, url, is_enabled, geo_tags_json
         FROM sources WHERE is_builtin = 1 ORDER BY id",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("db_market_source_plan: {e}"))?;

    let mut to_enable = Vec::new();
    let mut to_disable = Vec::new();
    for r in rows {
        let id: i64 = r.get("id");
        let name: String = r.get::<Option<String>, _>("name").unwrap_or_default();
        let url: String = r.get::<Option<String>, _>("url").unwrap_or_default();
        let enabled: bool = r.get::<i64, _>("is_enabled") != 0;
        let tags_json: Option<String> = r.get("geo_tags_json");
        let tags: Vec<String> = tags_json
            .as_deref()
            .and_then(|raw| serde_json::from_str::<Vec<String>>(raw).ok())
            .unwrap_or_default()
            .into_iter()
            .map(|t| t.to_lowercase())
            .collect();

        let item = MarketSourceItem {
            id,
            name,
            host: extract_host(&url).unwrap_or_default(),
        };
        let serves = tags.iter().any(|t| markets.contains(t));
        let worldwide = tags.iter().any(|t| t == "worldwide");
        if serves && !enabled {
            to_enable.push(item);
        } else if !serves && !worldwide && enabled {
            to_disable.push(item);
        }
    }
    // A market with no source of its own must not cost the user the sources
    // they already had: if there is nothing to enable, propose nothing at
    // all, disable list included. The Settings UI already renders nothing
    // for an empty plan.
    if to_enable.is_empty() {
        return Ok(MarketSourcePlan {
            to_enable: Vec::new(),
            to_disable: Vec::new(),
        });
    }
    Ok(MarketSourcePlan {
        to_enable,
        to_disable,
    })
}

/// Applies exactly the ids the user confirmed, in one transaction. `is_builtin`
/// is asserted in both statements so a stray id can never flip a user's own
/// source.
async fn apply_market_source_plan(
    pool: &SqlitePool,
    enable_ids: &[i64],
    disable_ids: &[i64],
) -> Result<(), String> {
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("db_apply_market_source_plan (begin): {e}"))?;
    for (ids, value) in [(enable_ids, 1), (disable_ids, 0)] {
        for id in ids {
            sqlx::query("UPDATE sources SET is_enabled = ? WHERE id = ? AND is_builtin = 1")
                .bind(value)
                .bind(id)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("db_apply_market_source_plan: {e}"))?;
        }
    }
    tx.commit()
        .await
        .map_err(|e| format!("db_apply_market_source_plan (commit): {e}"))
}

#[tauri::command]
pub async fn db_market_source_plan(
    markets: Vec<String>,
    db: State<'_, Db>,
) -> Result<MarketSourcePlan, String> {
    let markets: Vec<String> = markets.iter().map(|m| m.trim().to_lowercase()).collect();
    market_source_plan(&db.pool, &markets).await
}

#[tauri::command]
pub async fn db_apply_market_source_plan(
    enable_ids: Vec<i64>,
    disable_ids: Vec<i64>,
    db: State<'_, Db>,
) -> Result<(), String> {
    apply_market_source_plan(&db.pool, &enable_ids, &disable_ids).await
}

/// Add a user source: an RSS feed (url, https-only) or an ATS company board
/// (slug + ats_* type). Created enabled; never builtin.
#[tauri::command]
pub async fn db_add_source(
    name: String,
    source_type: String,
    url: Option<String>,
    slug: Option<String>,
    db: State<'_, Db>,
) -> Result<i64, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("db_add_source: name is required".to_string());
    }
    let (url, slug, note) = match source_type.as_str() {
        "rss" => {
            let url = url.unwrap_or_default().trim().to_string();
            require_https(&url)
                .map_err(|_| "db_add_source: RSS source needs an https:// feed URL".to_string())?;
            (
                url,
                None::<String>,
                "User-added RSS feed - public, machine-readable.",
            )
        }
        "ats_greenhouse" | "ats_lever" | "ats_ashby" | "ats_personio" => {
            let slug = slug.unwrap_or_default().trim().to_lowercase();
            if slug.is_empty() {
                return Err("db_add_source: ATS source needs a company slug".to_string());
            }
            (
                String::new(),
                Some(slug),
                "Tier 3 - public ATS JSON API, built for machine reading.",
            )
        }
        other => return Err(format!("db_add_source: unsupported source type: {other}")),
    };

    let id: i64 = sqlx::query_scalar(
        "INSERT INTO sources
           (name, type, url, slug, is_builtin, is_enabled, geo_tags_json, legality_note, created_at)
         VALUES (?, ?, ?, ?, 0, 1, '[\"worldwide\"]', ?, datetime('now'))
         RETURNING id",
    )
    .bind(&name)
    .bind(&source_type)
    .bind(&url)
    .bind(&slug)
    .bind(note)
    .fetch_one(&db.pool)
    .await
    .map_err(|e| format!("db_add_source: {e}"))?;
    Ok(id)
}

/// Remove a user-added source. Builtin sources can only be disabled.
#[tauri::command]
pub async fn db_remove_source(source_id: i64, db: State<'_, Db>) -> Result<(), String> {
    let result = sqlx::query("DELETE FROM sources WHERE id = ? AND is_builtin = 0")
        .bind(source_id)
        .execute(&db.pool)
        .await
        .map_err(|e| format!("db_remove_source: {e}"))?;
    if result.rows_affected() == 0 {
        return Err("db_remove_source: source not found or builtin".to_string());
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests (fixtures only - no network)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

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

    #[tokio::test]
    async fn the_plan_proposes_only_real_changes() {
        let pool = test_pool().await;
        // test_pool runs the migrations, which seed eleven built-in sources - and
        // several are ua-tagged. Clear them so the fixtures below are the whole
        // world for this test.
        sqlx::query("DELETE FROM sources")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO sources (id, name, type, url, is_builtin, is_enabled, geo_tags_json) VALUES
               (100, 'DOU', 'rss', 'https://jobs.dou.ua/x', 1, 0, '[\"ua\"]'),
               (101, 'Djinni', 'rss', 'https://djinni.co/x', 1, 1, '[\"ua\"]'),
               (102, 'Habr', 'rss', 'https://career.habr.com/x', 1, 1, '[\"ru\"]'),
               (103, 'Remotive', 'api', 'https://remotive.com/x', 1, 1, '[\"worldwide\"]'),
               (104, 'Jobicy', 'rss', 'https://jobicy.com/x', 1, 1, '[\"us\",\"worldwide\"]'),
               (105, 'Mine', 'rss', 'https://example.com/x', 0, 1, '[\"de\"]')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let plan = market_source_plan(&pool, &["ua".to_string()])
            .await
            .unwrap();

        // Only the disabled Ukrainian source is worth enabling; Djinni is already on.
        assert_eq!(
            plan.to_enable.iter().map(|s| s.id).collect::<Vec<_>>(),
            vec![100]
        );
        assert_eq!(plan.to_enable[0].host, "jobs.dou.ua");
        // Habr is another market. Remotive and Jobicy carry worldwide, so they are
        // left alone; source 105 is user-added and is never touched.
        assert_eq!(
            plan.to_disable.iter().map(|s| s.id).collect::<Vec<_>>(),
            vec![102]
        );
    }

    #[tokio::test]
    async fn applying_the_plan_touches_only_builtin_rows() {
        let pool = test_pool().await;
        // test_pool runs the migrations, which seed eleven built-in sources - and
        // several are ua-tagged. Clear them so the fixtures below are the whole
        // world for this test.
        sqlx::query("DELETE FROM sources")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO sources (id, name, type, url, is_builtin, is_enabled, geo_tags_json) VALUES
               (200, 'DOU', 'rss', 'https://jobs.dou.ua/x', 1, 0, '[\"ua\"]'),
               (201, 'Habr', 'rss', 'https://career.habr.com/x', 1, 1, '[\"ru\"]'),
               (202, 'Mine', 'rss', 'https://example.com/x', 0, 1, '[\"de\"]')",
        )
        .execute(&pool)
        .await
        .unwrap();

        apply_market_source_plan(&pool, &[200], &[201, 202])
            .await
            .unwrap();

        let enabled: Vec<(i64, i64)> =
            sqlx::query_as("SELECT id, is_enabled FROM sources ORDER BY id")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(enabled, vec![(200, 1), (201, 0), (202, 1)]);
    }

    #[tokio::test]
    async fn a_market_with_no_source_of_its_own_proposes_nothing() {
        let pool = test_pool().await;
        sqlx::query("DELETE FROM sources")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO sources (id, name, type, url, is_builtin, is_enabled, geo_tags_json) VALUES
               (300, 'Habr', 'rss', 'https://career.habr.com/x', 1, 1, '[\"ru\"]'),
               (301, 'Remotive', 'api', 'https://remotive.com/x', 1, 1, '[\"worldwide\"]')",
        )
        .execute(&pool)
        .await
        .unwrap();

        // No source is tagged "gb", so there is nothing to gain and the user must
        // not lose Habr for it.
        let plan = market_source_plan(&pool, &["gb".to_string()])
            .await
            .unwrap();
        assert!(plan.to_enable.is_empty());
        assert!(plan.to_disable.is_empty());
    }
}
