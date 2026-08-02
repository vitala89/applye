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

use super::discover_geo::{
    country_tokens, loc_matches, parse_local_markets, region_countries, KNOWN_COUNTRY_CODES,
    REMOTE_MARKERS,
};
use super::discover_parsers::{
    html_to_text, parse_arbeitnow, parse_arbeitsagentur, parse_ashby_board, parse_greenhouse_board,
    parse_himalayas, parse_lever_postings, parse_nofluffjobs, parse_nofluffjobs_detail,
    parse_personio_xml, parse_remotive, parse_rss_items, parse_trudvsem, percent_encode_segment,
};
use super::job_url::{extract_host, path_segments, titleize_slug};
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
// Internal types
// ---------------------------------------------------------------------------

/// One job as it comes out of a source feed, before filtering.
#[derive(Debug, Clone)]
pub(super) struct RawJob {
    pub(super) title: String,
    pub(super) company: String,
    pub(super) jd_text: String,
    pub(super) location: String,
    pub(super) url: String,
    /// Set by sources whose list endpoint carries no job description, holding
    /// the id the detail endpoint needs. Resolved after the local filters have
    /// run, so one detail request is spent per job the user could actually
    /// see - never per job in the feed.
    pub(super) detail_ref: Option<String>,
}

struct SourceRow {
    id: i64,
    name: String,
    source_type: String,
    url: String,
    slug: Option<String>,
    positive_json: Option<String>,
    negative_json: Option<String>,
    geo_tags_json: Option<String>,
}

struct TitleFilter {
    positive: Vec<String>,
    negative: Vec<String>,
}

struct GeoCfg {
    /// True when no scope is selected ("worldwide") - every job passes.
    unrestricted: bool,
    /// Tokens of the selected regions or markets - any match lets a job pass.
    tokens: Vec<String>,
    /// Market mode only: tokens naming somewhere that is NOT a selected market.
    /// Non-empty is what marks market mode. A location matching one of these is
    /// somewhere else, and is dropped before the remote marker can wave it
    /// through - which is exactly what "Remote - US only" used to do.
    elsewhere: Vec<String>,
}

// ---------------------------------------------------------------------------
// Title filter (0 tokens, ROADMAP §11 "Title filter")
// ---------------------------------------------------------------------------

/// Parse a keyword list: a JSON array of strings, with a plain
/// comma/newline-separated text fallback. Lowercased, trimmed, empties dropped.
fn parse_keyword_list(raw: Option<&str>) -> Vec<String> {
    let Some(raw) = raw else {
        return Vec::new();
    };
    let items: Vec<String> = serde_json::from_str::<Vec<String>>(raw)
        .unwrap_or_else(|_| raw.split([',', '\n']).map(str::to_string).collect());
    items
        .iter()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect()
}

const ARCHETYPE_STOPWORDS: &[&str] = &["and", "or", "the", "with", "for", "of", "in"];

/// Fallback positive keywords when a source has no title filter configured:
/// the significant words of the profile's Target Archetypes ("Senior Frontend
/// Engineer" -> ["senior", "frontend", "engineer"]). Empty archetypes -> no
/// filter (pass everything).
fn derive_title_keywords(archetypes: Option<&str>) -> Vec<String> {
    let mut words: Vec<String> = Vec::new();
    for phrase in parse_keyword_list(archetypes) {
        for word in phrase.split(|c: char| !c.is_alphanumeric() && c != '+' && c != '#') {
            let word = word.trim().to_lowercase();
            if word.len() >= 3
                && !ARCHETYPE_STOPWORDS.contains(&word.as_str())
                && !words.contains(&word)
            {
                words.push(word);
            }
        }
    }
    words
}

fn title_passes(title: &str, filter: &TitleFilter) -> bool {
    let t = title.to_lowercase();
    if filter.negative.iter().any(|k| t.contains(k)) {
        return false;
    }
    if filter.positive.is_empty() {
        return true;
    }
    filter.positive.iter().any(|k| t.contains(k))
}

/// The GeoScopeKey vocabulary, kept in lockstep with libs/core's
/// `GEO_SCOPE_KEYS` (TypeScript) so Settings and the scan engine agree on
/// what a scope key means.
const KNOWN_GEO_SCOPES: &[&str] = &[
    "europe", "namerica", "samerica", "asia", "oceania", "mena", "africa",
];

/// Parses the `geo_scope` settings column: a JSON array of scope keys
/// (`["europe","asia"]`) going forward, written by the Settings screen. An
/// install saved before multi-select shipped holds a single legacy scalar
/// instead (`worldwide`|`europe`|`eu`|`usa`|`asia`|`custom`) - map that onto
/// the closest key so an existing choice keeps working after the upgrade.
/// Mirrors `parseGeoScopes` in libs/core/src/lib/geo/geo-scope.ts. An empty
/// result means "worldwide": no restriction.
fn parse_geo_scopes(raw: &str) -> Vec<String> {
    let text = raw.trim();
    if text.is_empty() {
        return Vec::new();
    }
    if let Ok(parsed) = serde_json::from_str::<Vec<String>>(text) {
        return parsed
            .into_iter()
            .filter(|k| KNOWN_GEO_SCOPES.contains(&k.as_str()))
            .collect();
    }
    match text {
        "europe" | "eu" => vec!["europe".to_string()],
        "usa" => vec!["namerica".to_string()],
        "asia" => vec!["asia".to_string()],
        // "worldwide" | "custom" | anything unrecognized -> no restriction.
        _ => Vec::new(),
    }
}

/// Builds the geo filter from the selected scope keys (union of every
/// selected region's tokens - any one matching lets a job pass) plus any
/// individually active country codes on top. An empty `scopes` list means
/// "worldwide": every job passes, unconditionally.
fn build_geo_cfg(scopes: &[String], active_codes: &[String]) -> GeoCfg {
    let mut tokens: Vec<String> = Vec::new();
    for scope in scopes {
        let scope = scope.trim().to_lowercase();
        tokens.extend(region_countries(&scope).iter().map(|s| s.to_string()));
    }
    for code in active_codes {
        let code = code.trim().to_lowercase();
        if code == "remote" {
            continue; // remote always passes via REMOTE_MARKERS
        }
        let named = country_tokens(&code);
        if named.is_empty() {
            tokens.push(code);
        } else {
            tokens.extend(named.into_iter().map(str::to_string));
        }
    }
    tokens.sort();
    tokens.dedup();
    GeoCfg {
        // Unrestricted ("worldwide") only when nothing at all narrows the
        // search - no region scope AND no individual country code active.
        unrestricted: scopes.is_empty() && active_codes.is_empty(),
        tokens,
        elsewhere: Vec::new(),
    }
}

/// Every country and region token that does NOT belong to the selected markets.
///
/// A region whose own country list overlaps the selected markets is skipped
/// entirely, not just the overlapping token: EMEA includes Ukraine, so an
/// EMEA-wide remote job is open to a Ukrainian user, while a Germany-specific
/// job is not. Individual countries stay covered regardless, because
/// `KNOWN_COUNTRY_CODES` contributes each country's own tokens separately -
/// so skipping `EUROPE_COUNTRIES` for a Ukraine market still leaves
/// "germany" in `elsewhere` via `country_tokens("de")`.
fn elsewhere_tokens(selected: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for scope in KNOWN_GEO_SCOPES {
        let region = region_countries(scope);
        if region.iter().any(|t| selected.contains(&t.to_string())) {
            continue;
        }
        out.extend(region.iter().map(|s| s.to_string()));
    }
    for code in KNOWN_COUNTRY_CODES {
        out.extend(country_tokens(code).into_iter().map(str::to_string));
    }
    out.retain(|t| !selected.contains(t));
    out.sort();
    out.dedup();
    out
}

/// Market mode: narrow to the selected countries and treat anywhere else as a
/// reason to drop. Mutually exclusive with the region scope by construction -
/// see libs/core/src/lib/geo/local-market.ts for the whole contract.
fn build_market_cfg(markets: &[String]) -> GeoCfg {
    let mut tokens: Vec<String> = Vec::new();
    for market in markets {
        let market = market.trim().to_lowercase();
        let named = country_tokens(&market);
        if named.is_empty() {
            tokens.push(market);
        } else {
            tokens.extend(named.into_iter().map(str::to_string));
        }
    }
    tokens.sort();
    tokens.dedup();
    let elsewhere = elsewhere_tokens(&tokens);
    GeoCfg {
        unrestricted: markets.is_empty(),
        tokens,
        elsewhere,
    }
}

/// Whether a source's `geo_tags_json` names any of the selected markets. A
/// `worldwide` tag deliberately does not count: worldwide feeds carry jobs from
/// everywhere, so they still have to prove each job belongs to the market.
fn source_serves_markets(tags_json: Option<&str>, markets: &[String]) -> bool {
    if markets.is_empty() {
        return false;
    }
    let Some(raw) = tags_json else {
        return false;
    };
    let Ok(tags) = serde_json::from_str::<Vec<String>>(raw) else {
        return false;
    };
    tags.iter().any(|t| markets.contains(&t.to_lowercase()))
}

/// Conservative inclusion in region mode: an empty or unknown location never
/// drops a job, only a location naming somewhere outside the scope does.
///
/// Market mode is stricter, because a market is a claim about where the user
/// can actually work. `source_serves_market` is the escape hatch: a feed tagged
/// for the selected market is itself the evidence, and many such feeds carry no
/// location field at all.
fn geo_passes(location: &str, cfg: &GeoCfg, source_serves_market: bool) -> bool {
    if cfg.unrestricted {
        return true;
    }
    if source_serves_market {
        return true;
    }
    let loc = location.trim().to_lowercase();
    let market_mode = !cfg.elsewhere.is_empty();
    if loc.is_empty() {
        return !market_mode;
    }
    if cfg.tokens.iter().any(|t| loc_matches(&loc, t)) {
        return true;
    }
    // Order matters: somewhere else beats the remote marker, or "Remote - US
    // only" passes a Ukraine market on the word "Remote".
    if market_mode && cfg.elsewhere.iter().any(|t| loc_matches(&loc, t)) {
        return false;
    }
    REMOTE_MARKERS.iter().any(|m| loc_matches(&loc, m))
}

// ---------------------------------------------------------------------------
// Feed parsers (pure - fetched bytes in, RawJobs out; unit-tested on fixtures)
// ---------------------------------------------------------------------------

pub(super) fn json_str(v: &serde_json::Value, key: &str) -> String {
    v.get(key)
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string()
}

// ---------------------------------------------------------------------------
// Fetch (thin HTTPS layer over the pure parsers)
// ---------------------------------------------------------------------------

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent(concat!("Applye/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("discover_scan: build http client: {e}"))
}

fn require_https(url: &str) -> Result<(), String> {
    if url.starts_with("https://") {
        Ok(())
    } else {
        Err("discover_scan: only https:// sources are fetched".to_string())
    }
}

async fn get_json(client: &reqwest::Client, url: &str) -> Result<serde_json::Value, String> {
    require_https(url)?;
    client
        .get(url)
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("{e}"))?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("invalid JSON response: {e}"))
}

/// Anonymous client key for the Bundesagentur fuer Arbeit job search API,
/// published in its own public API documentation. Not a user secret: it
/// identifies the client, carries no account, and is the same for everyone.
const ARBEITSAGENTUR_API_KEY: &str = "jobboerse-jobsuche";

/// Pages fetched per scan, at 100 postings each. The feed is national and
/// unfiltered server-side, so this bounds one scan rather than trying to
/// mirror the whole index.
const ARBEITSAGENTUR_PAGES: u32 = 3;

/// Detail requests spent per source per scan. Descriptions are pulled only for
/// jobs that already passed the title and geo filters; past this cap the
/// remaining jobs keep their structured-field placeholder body.
const ARBEITSAGENTUR_DETAIL_CAP: usize = 60;

async fn get_json_keyed(client: &reqwest::Client, url: &str) -> Result<serde_json::Value, String> {
    require_https(url)?;
    client
        .get(url)
        .header("accept", "application/json")
        .header("X-API-Key", ARBEITSAGENTUR_API_KEY)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("{e}"))?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("invalid JSON response: {e}"))
}

/// Full posting text for one reference number. The detail endpoint keys on the
/// base64 of the reference number.
async fn fetch_arbeitsagentur_detail(
    client: &reqwest::Client,
    refnr: &str,
) -> Result<String, String> {
    use base64::Engine as _;
    let id = base64::engine::general_purpose::STANDARD.encode(refnr);
    let url = format!(
        "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v2/jobdetails/{}",
        percent_encode_segment(&id)
    );
    let val = get_json_keyed(client, &url).await?;
    Ok(html_to_text(&json_str(&val, "stellenbeschreibung")))
}

/// Full posting text for one No Fluff Jobs slug. The detail endpoint keys on
/// the same slug the list returns in its `url` field.
async fn fetch_nofluffjobs_detail(client: &reqwest::Client, slug: &str) -> Result<String, String> {
    let url = format!(
        "https://nofluffjobs.com/api/posting/{}",
        percent_encode_segment(slug)
    );
    let val = get_json(client, &url).await?;
    Ok(parse_nofluffjobs_detail(&val))
}

async fn get_text(client: &reqwest::Client, url: &str) -> Result<String, String> {
    require_https(url)?;
    client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("{e}"))?
        .text()
        .await
        .map_err(|e| format!("invalid response body: {e}"))
}

/// ATS sources store the company slug in `sources.slug`; fall back to reading
/// it out of the stored URL so user-added rows with only a URL still work.
fn ats_slug(src: &SourceRow, path_marker: &str) -> Result<String, String> {
    if let Some(slug) = src.slug.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        return Ok(slug.to_string());
    }
    let segments = path_segments(&src.url);
    segments
        .iter()
        .position(|s| s == path_marker)
        .and_then(|i| segments.get(i + 1))
        .cloned()
        .or_else(|| segments.first().cloned())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "missing company slug".to_string())
}

async fn fetch_source_jobs(
    client: &reqwest::Client,
    src: &SourceRow,
) -> Result<Vec<RawJob>, String> {
    match src.source_type.as_str() {
        "api" => {
            let host = extract_host(&src.url).unwrap_or_default();
            let val = get_json(client, &src.url).await?;
            if host.contains("remotive") {
                Ok(parse_remotive(&val))
            } else if host.contains("himalayas") {
                Ok(parse_himalayas(&val))
            } else {
                Err(format!("unsupported API source host: {host}"))
            }
        }
        "rss" => {
            let host = extract_host(&src.url).unwrap_or_default();
            let xml = get_text(client, &src.url).await?;
            Ok(parse_rss_items(&xml, host.contains("weworkremotely")))
        }
        "api_arbeitsagentur" => {
            let base = src.url.trim_end_matches('/');
            let mut out: Vec<RawJob> = Vec::new();
            for page in 1..=ARBEITSAGENTUR_PAGES {
                let url = format!("{base}?angebotsart=1&size=100&page={page}");
                let val = get_json_keyed(client, &url).await?;
                let batch = parse_arbeitsagentur(&val);
                let done = batch.len() < 100;
                out.extend(batch);
                if done {
                    break;
                }
            }
            Ok(out)
        }
        "api_trudvsem" => {
            let val = get_json(client, &src.url).await?;
            Ok(parse_trudvsem(&val))
        }
        "api_arbeitnow" => {
            let val = get_json(client, &src.url).await?;
            Ok(parse_arbeitnow(&val))
        }
        "api_nofluffjobs" => {
            let val = get_json(client, &src.url).await?;
            Ok(parse_nofluffjobs(&val))
        }
        "ats_personio" => {
            // Personio boards key on the subdomain, not a path segment, so the
            // stored slug is the source of truth and the host is the fallback.
            let slug = src
                .slug
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .or_else(|| {
                    extract_host(&src.url)
                        .and_then(|h| h.split('.').next().map(str::to_string))
                        .filter(|s| !s.is_empty())
                })
                .ok_or_else(|| "missing company slug".to_string())?;
            let url = format!("https://{slug}.jobs.personio.de/xml");
            let xml = get_text(client, &url).await?;
            Ok(parse_personio_xml(&xml, &slug, &titleize_slug(&slug)))
        }
        "ats_greenhouse" => {
            let slug = ats_slug(src, "boards")?;
            let url =
                format!("https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true");
            let val = get_json(client, &url).await?;
            Ok(parse_greenhouse_board(&val, &titleize_slug(&slug)))
        }
        "ats_lever" => {
            let slug = ats_slug(src, "postings")?;
            let url = format!("https://api.lever.co/v0/postings/{slug}?mode=json");
            let val = get_json(client, &url).await?;
            Ok(parse_lever_postings(&val, &titleize_slug(&slug)))
        }
        "ats_ashby" => {
            let slug = ats_slug(src, "job-board")?;
            let url = format!("https://api.ashbyhq.com/posting-api/job-board/{slug}");
            let val = get_json(client, &url).await?;
            Ok(parse_ashby_board(&val))
        }
        other => Err(format!("unsupported source type: {other}")),
    }
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
    // Only the tests read this one; importing it at module scope would be dead
    // in a non-test build and fail clippy -D warnings.
    use crate::commands::discover_geo::KNOWN_LOCAL_MARKETS;
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

    /// Every market must recognise its own largest tech city, and must not
    /// recognise another market's. This is the guard against a market being added
    /// later with a country-name-only token list, which the strict filter in the
    /// scan would turn into silently dropped jobs.
    #[test]
    fn every_market_recognises_its_own_city_and_no_other() {
        let cases: &[(&str, &str)] = &[
            ("de", "Berlin"),
            ("us", "San Francisco, CA"),
            ("ru", "Москва"),
            ("ua", "Київ"),
            ("pl", "Warsaw"),
        ];

        for market in KNOWN_LOCAL_MARKETS {
            assert!(
                cases.iter().any(|(code, _)| code == market),
                "market {market} has no parity case - add one"
            );
        }

        for (market, city) in cases {
            let cfg = build_market_cfg(&[market.to_string()]);
            assert!(geo_passes(city, &cfg, false), "{market} must accept {city}");

            for (other, _) in cases {
                if other == market {
                    continue;
                }
                let other_cfg = build_market_cfg(&[other.to_string()]);
                assert!(
                    !geo_passes(city, &other_cfg, false),
                    "{other} must not accept {city}"
                );
            }
        }
    }

    /// The token table must not read another country's ISO code as a US state.
    /// `loc_matches` is case-insensitive, so a two-letter state code that is also
    /// a country code silently annexes that country into the US market.
    #[test]
    fn a_us_market_does_not_swallow_countries_sharing_a_state_code() {
        let us = build_market_cfg(&["us".to_string()]);
        for elsewhere in [
            "Tel Aviv, IL",
            "Casablanca, MA",
            "Bogota, CO",
            "Chisinau, MD",
            "Panama City, PA",
            "Baku, AZ",
            "Ulaanbaatar, MN",
            "Tunis, TN",
        ] {
            assert!(
                !geo_passes(elsewhere, &us, false),
                "{elsewhere} is not in the US"
            );
        }
        // The states themselves are still reachable by name.
        for state in [
            "Chicago, Illinois",
            "Boston, Massachusetts",
            "Denver, Colorado",
            "Phoenix, Arizona",
            "Nashville, Tennessee",
        ] {
            assert!(geo_passes(state, &us, false), "{state} is in the US");
        }
    }

    /// Georgia is both a US state and a country, and the state's code "ga" is
    /// unavailable because it collides with Gabon. The state therefore keeps the
    /// ambiguous full name plus its own cities, and the known cost is recorded
    /// here rather than left for someone to rediscover: a US market can surface a
    /// posting from Georgia the country. A visible wrong result can be dismissed;
    /// a dropped job cannot.
    #[test]
    fn georgia_the_state_stays_reachable_and_its_ambiguity_is_known() {
        let us = build_market_cfg(&["us".to_string()]);
        assert!(geo_passes("Atlanta, Georgia", &us, false));
        assert!(geo_passes("Savannah, Georgia", &us, false));
        // The accepted cost, asserted so a future change to it is a decision and
        // not an accident.
        assert!(geo_passes("Tbilisi, Georgia", &us, false));
    }

    /// A PL scope must not annex New South Wales. gb is no longer a pickable
    /// market (see KNOWN_LOCAL_MARKETS), so this uses pl to keep the "a
    /// market must not swallow an unrelated place" case exercised through a
    /// market that remains selectable.
    #[test]
    fn a_pl_market_does_not_swallow_new_south_wales() {
        let pl = build_market_cfg(&["pl".to_string()]);
        assert!(!geo_passes("Sydney, New South Wales", &pl, false));
        assert!(geo_passes("Krakow", &pl, false));
        assert!(geo_passes("Warsaw, Poland", &pl, false));
    }

    // -- Bundesagentur fuer Arbeit -------------------------------------------

    #[test]
    fn arbeitsagentur_maps_list_fields() {
        let val: serde_json::Value = serde_json::from_str(
            r#"{"stellenangebote":[{
                 "titel":"Frontend Entwickler (m/w/d)",
                 "beruf":"Softwareentwickler",
                 "refnr":"10000-1198013731-S",
                 "arbeitgeber":"Muster GmbH",
                 "arbeitsort":{"ort":"Berlin","plz":"10115","region":"Berlin"}
               }]}"#,
        )
        .unwrap();
        let jobs = parse_arbeitsagentur(&val);
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].title, "Frontend Entwickler (m/w/d)");
        assert_eq!(jobs[0].company, "Muster GmbH");
        assert_eq!(jobs[0].location, "Berlin, Berlin, Deutschland");
        assert_eq!(
            jobs[0].url,
            "https://www.arbeitsagentur.de/jobsuche/jobdetail/10000-1198013731-S"
        );
        assert_eq!(jobs[0].detail_ref.as_deref(), Some("10000-1198013731-S"));
        // Placeholder body until the detail request runs.
        assert!(jobs[0].jd_text.contains("Softwareentwickler"));
    }

    #[test]
    fn arbeitsagentur_falls_back_to_beruf_and_external_url() {
        let val: serde_json::Value = serde_json::from_str(
            r#"{"stellenangebote":[{
                 "beruf":"Pflegefachkraft",
                 "refnr":"abc",
                 "externeUrl":"https://karriere.example.de/stelle/1",
                 "arbeitsort":{"land":"Deutschland"}
               }]}"#,
        )
        .unwrap();
        let jobs = parse_arbeitsagentur(&val);
        assert_eq!(jobs[0].title, "Pflegefachkraft");
        assert_eq!(jobs[0].location, "Deutschland");
        assert_eq!(jobs[0].url, "https://karriere.example.de/stelle/1");
    }

    #[test]
    fn arbeitsagentur_geo_passes_a_germany_scope() {
        let cfg = build_geo_cfg(&["europe".to_string()], &["de".to_string()]);
        let val: serde_json::Value = serde_json::from_str(
            r#"{"stellenangebote":[{"titel":"X","refnr":"r","arbeitsort":{"ort":"Muenchen"}}]}"#,
        )
        .unwrap();
        let jobs = parse_arbeitsagentur(&val);
        assert!(geo_passes(&jobs[0].location, &cfg, false));
    }

    #[test]
    fn arbeitsagentur_empty_or_foreign_shape_yields_nothing() {
        assert!(parse_arbeitsagentur(&serde_json::json!({})).is_empty());
        assert!(parse_arbeitsagentur(&serde_json::json!({"stellenangebote":[]})).is_empty());
    }

    // -- TrudVsem (Russia) ----------------------------------------------------

    #[test]
    fn trudvsem_reads_vacancy_fields_and_appends_russia() {
        let val: serde_json::Value = serde_json::from_str(
            r#"{"results":{"vacancies":[{"vacancy":{
                 "job-name":"Backend Developer",
                 "company":{"name":"Acme LLC"},
                 "region":{"name":"Москва"},
                 "vac_url":"https://trudvsem.ru/vacancy/1",
                 "duty":"Write code",
                 "requirement":"Rust experience"
               }}]}}"#,
        )
        .unwrap();
        let jobs = parse_trudvsem(&val);
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].title, "Backend Developer");
        assert_eq!(jobs[0].company, "Acme LLC");
        assert_eq!(jobs[0].location, "Москва, Russia");
        assert_eq!(jobs[0].url, "https://trudvsem.ru/vacancy/1");
        assert!(jobs[0].jd_text.contains("Write code"));
        assert!(jobs[0].jd_text.contains("Rust experience"));
    }

    #[test]
    fn trudvsem_missing_region_falls_back_to_bare_russia() {
        let val: serde_json::Value =
            serde_json::from_str(r#"{"results":{"vacancies":[{"vacancy":{"job-name":"QA"}}]}}"#)
                .unwrap();
        assert_eq!(parse_trudvsem(&val)[0].location, "Russia");
    }

    #[test]
    fn trudvsem_empty_or_foreign_shape_yields_nothing() {
        assert!(parse_trudvsem(&serde_json::json!({})).is_empty());
        assert!(parse_trudvsem(&serde_json::json!({"results":{"vacancies":[]}})).is_empty());
    }

    // -- Arbeitnow (Germany) ---------------------------------------------------

    #[test]
    fn arbeitnow_reads_job_fields_and_appends_germany() {
        let val: serde_json::Value = serde_json::from_str(
            r#"{"data":[{
                 "title":"Frontend Engineer",
                 "company_name":"Muster GmbH",
                 "description":"<p>Build things.</p>",
                 "location":"Berlin",
                 "url":"https://arbeitnow.com/jobs/1"
               }]}"#,
        )
        .unwrap();
        let jobs = parse_arbeitnow(&val);
        assert_eq!(jobs[0].title, "Frontend Engineer");
        assert_eq!(jobs[0].company, "Muster GmbH");
        assert_eq!(jobs[0].location, "Berlin, Germany");
        assert!(jobs[0].jd_text.contains("Build things."));
    }

    #[test]
    fn arbeitnow_missing_location_falls_back_to_bare_germany() {
        let val: serde_json::Value = serde_json::from_str(r#"{"data":[{"title":"QA"}]}"#).unwrap();
        assert_eq!(parse_arbeitnow(&val)[0].location, "Germany");
    }

    #[test]
    fn arbeitnow_empty_or_foreign_shape_yields_nothing() {
        assert!(parse_arbeitnow(&serde_json::json!({})).is_empty());
        assert!(parse_arbeitnow(&serde_json::json!({"data":[]})).is_empty());
    }

    // -- No Fluff Jobs (Poland) -------------------------------------------------

    #[test]
    fn nofluffjobs_reads_root_array_shape() {
        let val: serde_json::Value = serde_json::from_str(
            r#"[{
                 "title":"Java Developer",
                 "name":"Acme Sp. z o.o.",
                 "url":"java-developer-acme",
                 "category":"backend",
                 "technology":"java",
                 "seniority":["Mid"],
                 "location":{"places":[{"city":"Warsaw"}],"fullyRemote":false}
               }]"#,
        )
        .unwrap();
        let jobs = parse_nofluffjobs(&val);
        assert_eq!(jobs[0].title, "Java Developer");
        assert_eq!(jobs[0].company, "Acme Sp. z o.o.");
        assert_eq!(jobs[0].location, "Warsaw, Poland");
        assert_eq!(
            jobs[0].url,
            "https://nofluffjobs.com/job/java-developer-acme"
        );
        assert!(jobs[0].jd_text.contains("backend"));
        assert!(jobs[0].jd_text.contains("java"));
        assert!(jobs[0].jd_text.contains("Mid"));
        assert_eq!(jobs[0].detail_ref.as_deref(), Some("java-developer-acme"));
    }

    #[test]
    fn nofluffjobs_reads_postings_wrapper_shape_and_remote() {
        let val: serde_json::Value = serde_json::from_str(
            r#"{"postings":[{
                 "title":"DevOps",
                 "companyName":"Acme",
                 "url":"https://nofluffjobs.com/job/devops-acme",
                 "location":{"places":[],"fullyRemote":true}
               }]}"#,
        )
        .unwrap();
        let jobs = parse_nofluffjobs(&val);
        assert_eq!(jobs[0].company, "Acme");
        assert_eq!(jobs[0].location, "Remote, Poland");
        assert_eq!(jobs[0].url, "https://nofluffjobs.com/job/devops-acme");
        assert_eq!(jobs[0].detail_ref, None);
    }

    #[test]
    fn nofluffjobs_empty_or_foreign_shape_yields_nothing() {
        assert!(parse_nofluffjobs(&serde_json::json!({})).is_empty());
        assert!(parse_nofluffjobs(&serde_json::json!([])).is_empty());
    }

    #[test]
    fn nofluffjobs_detail_builds_structured_text() {
        let val: serde_json::Value = serde_json::from_str(
            r#"{
              "requirements": {
                "musts": [{"value":"React"},{"value":"Next.js"},{"value":"TypeScript"}],
                "nices": [{"value":"AWS"},{"value":"Nest.js"}],
                "description": "<p>You have 5 years of commercial experience.</p>"
              },
              "specs": {
                "dailyTasks": [
                  "Design and build complete product features.",
                  "Monitoring and tracing."
                ]
              },
              "essentials": {
                "originalSalary": {
                  "currency": "PLN",
                  "types": { "b2b": { "period": "Hour", "range": [200.0, 220.0] } }
                }
              }
            }"#,
        )
        .unwrap();

        let text = parse_nofluffjobs_detail(&val);
        // Headings the block renderer recognises, each on its own line.
        assert!(text.contains("Requirements:"));
        assert!(text.contains("- React"));
        assert!(text.contains("- TypeScript"));
        assert!(text.contains("Nice to have:"));
        assert!(text.contains("- AWS"));
        assert!(text.contains("Responsibilities:"));
        assert!(text.contains("- Design and build complete product features."));
        assert!(text.contains("You have 5 years of commercial experience."));
        // Salary line carries the currency and range so the extractor can read it.
        assert!(text.contains("Salary:"));
        assert!(text.contains("PLN"));
        assert!(text.contains("200"));
        assert!(text.contains("220"));
    }

    #[test]
    fn nofluffjobs_detail_tolerates_missing_sections() {
        // A posting with no nices, no tasks, no salary must still yield its musts,
        // and never panic on the absent keys.
        let val: serde_json::Value =
            serde_json::from_str(r#"{"requirements":{"musts":[{"value":"Java"}]}}"#).unwrap();
        let text = parse_nofluffjobs_detail(&val);
        assert!(text.contains("- Java"));
        assert!(!text.contains("Nice to have:"));
        assert!(!text.contains("Salary:"));
    }

    // -- Personio company boards ---------------------------------------------

    #[test]
    fn personio_reads_title_office_and_all_description_sections() {
        let xml = r#"<workzag-jobs>
          <position>
            <id>1234</id>
            <subcompany>Muster GmbH</subcompany>
            <office>Berlin</office>
            <name>Frontend Entwickler (m/w/d)</name>
            <jobDescriptions>
              <jobDescription><name>Aufgaben</name><value><![CDATA[<p>Du baust das Web-Frontend.</p>]]></value></jobDescription>
              <jobDescription><name>Dein Profil</name><value><![CDATA[<ul><li>Angular</li></ul>]]></value></jobDescription>
            </jobDescriptions>
          </position>
        </workzag-jobs>"#;
        let jobs = parse_personio_xml(xml, "muster", "Muster");
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].title, "Frontend Entwickler (m/w/d)");
        assert_eq!(jobs[0].company, "Muster GmbH");
        assert_eq!(jobs[0].location, "Berlin");
        assert_eq!(jobs[0].url, "https://muster.jobs.personio.de/job/1234");
        // Both sections land, headings included.
        assert!(jobs[0].jd_text.contains("Aufgaben"));
        assert!(jobs[0].jd_text.contains("Du baust das Web-Frontend."));
        assert!(jobs[0].jd_text.contains("Dein Profil"));
        assert!(jobs[0].jd_text.contains("Angular"));
    }

    #[test]
    fn personio_title_is_not_taken_from_a_description_heading() {
        let xml = r#"<workzag-jobs><position>
            <name>Werkstudent Data</name>
            <jobDescriptions><jobDescription><name>Aufgaben</name><value>x</value></jobDescription></jobDescriptions>
          </position></workzag-jobs>"#;
        let jobs = parse_personio_xml(xml, "acme", "Acme");
        assert_eq!(jobs[0].title, "Werkstudent Data");
    }

    #[test]
    fn personio_falls_back_to_the_slug_company_and_board_url() {
        let xml = r#"<workzag-jobs><position><name>QA</name></position></workzag-jobs>"#;
        let jobs = parse_personio_xml(xml, "acme", "Acme");
        assert_eq!(jobs[0].company, "Acme");
        assert_eq!(jobs[0].url, "https://acme.jobs.personio.de");
    }

    #[test]
    fn personio_empty_or_unrelated_xml_yields_nothing() {
        assert!(parse_personio_xml("<workzag-jobs></workzag-jobs>", "a", "A").is_empty());
        assert!(parse_personio_xml("<rss><item></item></rss>", "a", "A").is_empty());
    }

    #[test]
    fn german_city_alone_passes_a_germany_scope() {
        let cfg = build_geo_cfg(&[], &["de".to_string()]);
        for city in ["Berlin", "München", "Koeln", "Frankfurt am Main"] {
            assert!(
                geo_passes(city, &cfg, false),
                "{city} should pass a DE scope"
            );
        }
        assert!(!geo_passes("Warsaw", &cfg, false));
    }

    #[test]
    fn percent_encoding_keeps_one_path_segment() {
        assert_eq!(percent_encode_segment("10000-119-S"), "10000-119-S");
        assert_eq!(percent_encode_segment("a/b c"), "a%2Fb%20c");
        assert_eq!(percent_encode_segment("x+y="), "x%2By%3D");
    }

    // -- title filter --------------------------------------------------------

    #[test]
    fn keyword_list_parses_json_and_plain_text() {
        assert_eq!(
            parse_keyword_list(Some(r#"["Angular", " Senior "]"#)),
            vec!["angular", "senior"]
        );
        assert_eq!(
            parse_keyword_list(Some("angular, senior\nfrontend")),
            vec!["angular", "senior", "frontend"]
        );
        assert!(parse_keyword_list(None).is_empty());
        assert!(parse_keyword_list(Some("")).is_empty());
    }

    #[test]
    fn title_filter_positive_negative() {
        let f = TitleFilter {
            positive: vec!["frontend".into(), "angular".into()],
            negative: vec!["intern".into()],
        };
        assert!(title_passes("Senior Frontend Engineer", &f));
        assert!(title_passes("Angular Developer", &f));
        assert!(!title_passes("Backend Engineer", &f));
        assert!(!title_passes("Frontend Intern", &f)); // negative wins
        let open = TitleFilter {
            positive: vec![],
            negative: vec![],
        };
        assert!(title_passes("Anything At All", &open));
    }

    #[test]
    fn archetype_keywords_derived_from_phrases() {
        let kw = derive_title_keywords(Some(r#"["Senior Frontend Engineer", "Tech Lead"]"#));
        assert_eq!(kw, vec!["senior", "frontend", "engineer", "tech", "lead"]);
        assert!(derive_title_keywords(None).is_empty());
    }

    // -- geo filter ----------------------------------------------------------

    #[test]
    fn geo_worldwide_passes_everything() {
        let cfg = build_geo_cfg(&[], &[]);
        assert!(geo_passes("Tokyo, Japan", &cfg, false));
        assert!(geo_passes("", &cfg, false));
    }

    #[test]
    fn geo_europe_scope() {
        let cfg = build_geo_cfg(&["europe".to_string()], &[]);
        assert!(geo_passes("Berlin, Germany", &cfg, false));
        assert!(geo_passes("Remote - EMEA", &cfg, false));
        assert!(geo_passes("Remote", &cfg, false)); // remote marker always passes
        assert!(geo_passes("", &cfg, false)); // unknown location never drops
        assert!(!geo_passes("New York, USA", &cfg, false));
    }

    #[test]
    fn geo_country_codes_match_names_not_substrings() {
        let cfg = build_geo_cfg(&[], &["de".to_string()]);
        assert!(geo_passes("Munich, Germany", &cfg, false));
        assert!(geo_passes("DE", &cfg, false));
        // "de" must not light up inside unrelated words
        assert!(!geo_passes("Designer Hub, Tokyo", &cfg, false));
    }

    #[test]
    fn geo_multi_scope_unions_every_selected_region() {
        // Europe + Asia selected together -> a job from either passes, one
        // from neither (e.g. Brazil) does not.
        let cfg = build_geo_cfg(&["europe".to_string(), "asia".to_string()], &[]);
        assert!(geo_passes("Berlin, Germany", &cfg, false));
        assert!(geo_passes("Tokyo, Japan", &cfg, false));
        assert!(!geo_passes("Sao Paulo, Brazil", &cfg, false));
    }

    #[test]
    fn geo_namerica_scope_covers_us_canada_and_mexico() {
        let cfg = build_geo_cfg(&["namerica".to_string()], &[]);
        assert!(geo_passes("Austin, USA", &cfg, false));
        assert!(geo_passes("Toronto, Canada", &cfg, false));
        assert!(geo_passes("Mexico City, Mexico", &cfg, false));
        assert!(!geo_passes("Berlin, Germany", &cfg, false));
    }

    #[test]
    fn geo_samerica_oceania_mena_africa_scopes() {
        let samerica = build_geo_cfg(&["samerica".to_string()], &[]);
        assert!(geo_passes("Montevideo, Uruguay", &samerica, false));
        assert!(!geo_passes("Berlin, Germany", &samerica, false));

        let oceania = build_geo_cfg(&["oceania".to_string()], &[]);
        assert!(geo_passes("Sydney, Australia", &oceania, false));

        let mena = build_geo_cfg(&["mena".to_string()], &[]);
        assert!(geo_passes("Dubai, UAE", &mena, false));

        let africa = build_geo_cfg(&["africa".to_string()], &[]);
        assert!(geo_passes("Cape Town, South Africa", &africa, false));
    }

    #[test]
    fn parse_geo_scopes_reads_json_array_and_drops_unknown_keys() {
        assert_eq!(
            parse_geo_scopes(r#"["europe","asia"]"#),
            vec!["europe".to_string(), "asia".to_string()]
        );
        assert_eq!(
            parse_geo_scopes(r#"["europe","bogus"]"#),
            vec!["europe".to_string()]
        );
        assert!(parse_geo_scopes("").is_empty());
        assert!(parse_geo_scopes("[]").is_empty());
    }

    #[test]
    fn parse_local_markets_reads_json_array_and_drops_unknown_codes() {
        assert_eq!(
            parse_local_markets(r#"["de","ua"]"#),
            vec!["de".to_string(), "ua".to_string()]
        );
        assert_eq!(
            parse_local_markets(r#"["de","atlantis"]"#),
            vec!["de".to_string()]
        );
        assert!(parse_local_markets("").is_empty());
        assert!(parse_local_markets("[]").is_empty());
    }

    /// fr is not a pickable market - no built-in source serves it - so it is
    /// dropped the same as any other unknown code, even though its location
    /// tokens still exist for the "somewhere else" filter.
    #[test]
    fn parse_local_markets_drops_fr_as_not_yet_a_pickable_market() {
        assert_eq!(
            parse_local_markets(r#"["de","fr"]"#),
            vec!["de".to_string()]
        );
    }

    #[test]
    fn parse_local_markets_reads_the_legacy_single_scalar() {
        // Written by the first cut of the picker, before multi-select.
        assert_eq!(parse_local_markets("de"), vec!["de".to_string()]);
        assert!(parse_local_markets("atlantis").is_empty());
    }

    #[test]
    fn source_market_tags_are_read_tolerantly() {
        let markets = vec!["ua".to_string()];
        assert!(source_serves_markets(Some(r#"["ua"]"#), &markets));
        assert!(source_serves_markets(Some(r#"["ua","pl"]"#), &markets));
        assert!(!source_serves_markets(Some(r#"["worldwide"]"#), &markets));
        assert!(!source_serves_markets(Some(r#"["de"]"#), &markets));
        assert!(!source_serves_markets(None, &markets));
        assert!(!source_serves_markets(Some("not json"), &markets));
        // No market selected: nothing is market-tagged, so region rules apply.
        assert!(!source_serves_markets(Some(r#"["ua"]"#), &[]));
    }

    #[test]
    fn a_local_market_narrows_to_its_own_country() {
        let cfg = build_geo_cfg(&[], &["pl".to_string()]);
        assert!(geo_passes("Warsaw, Poland", &cfg, false));
        assert!(!geo_passes("Berlin, Germany", &cfg, false));
        // Conservative inclusion still holds: remote and unknown never drop.
        assert!(geo_passes("Remote", &cfg, false));
        assert!(geo_passes("", &cfg, false));
    }

    #[test]
    fn several_local_markets_union_their_countries() {
        let cfg = build_geo_cfg(&[], &["de".to_string(), "ua".to_string()]);
        assert!(geo_passes("Berlin", &cfg, false));
        assert!(geo_passes("Kyiv, Ukraine", &cfg, false));
        assert!(!geo_passes("Warsaw, Poland", &cfg, false));
    }

    #[test]
    fn russian_and_ukrainian_places_pass_in_either_script() {
        let ru = build_geo_cfg(&[], &["ru".to_string()]);
        // What TrudVsem actually emits once parse_trudvsem appends the country.
        assert!(geo_passes("Москва, Russia", &ru, false));
        assert!(geo_passes("Санкт-Петербург", &ru, false));
        assert!(geo_passes("Moscow", &ru, false));
        assert!(!geo_passes("Kyiv, Ukraine", &ru, false));

        let ua = build_geo_cfg(&[], &["ua".to_string()]);
        assert!(geo_passes("Київ", &ua, false));
        assert!(geo_passes("Lviv, Ukraine", &ua, false));
        assert!(!geo_passes("Москва, Russia", &ua, false));
    }

    #[test]
    fn a_local_market_ignores_the_region_scope_entirely() {
        // The mutual-exclusion contract: Settings clears geo_scope when a
        // market is picked, and the scan runs the strict market path
        // (build_market_cfg) instead. A Europe scope must not smuggle Berlin
        // into a Poland-only search.
        let cfg = build_market_cfg(&["pl".to_string()]);
        assert!(!geo_passes("Berlin, Germany", &cfg, false));
        assert!(!geo_passes("Munich", &cfg, false));

        // Poland is itself in Europe, so a region-wide remote posting still
        // reaches it: EMEA is not "somewhere else" for a market inside EMEA.
        assert!(geo_passes("Remote - EMEA", &cfg, false));
    }

    #[test]
    fn market_mode_drops_somewhere_else_before_the_remote_marker() {
        // The whole point: "Remote" used to wave this through untouched.
        let cfg = build_market_cfg(&["ua".to_string()]);
        assert!(!geo_passes("Remote - US only", &cfg, false));
        assert!(!geo_passes("Berlin, Germany", &cfg, false));
    }

    #[test]
    fn market_mode_keeps_the_market_and_globally_open_remote() {
        let cfg = build_market_cfg(&["ua".to_string()]);
        assert!(geo_passes("Kyiv", &cfg, false));
        assert!(geo_passes("Ukraine", &cfg, false));
        assert!(geo_passes("Львів", &cfg, false));
        assert!(geo_passes("Anywhere", &cfg, false));
        assert!(geo_passes("Worldwide", &cfg, false));
        assert!(geo_passes("Remote", &cfg, false));
    }

    #[test]
    fn a_region_wide_remote_job_reaches_a_market_inside_that_region() {
        let ua = build_market_cfg(&["ua".to_string()]);
        assert!(geo_passes("Remote - EMEA", &ua, false));
        assert!(geo_passes("Remote, Europe", &ua, false));
        // A country inside the same region is still somewhere else.
        assert!(!geo_passes("Berlin, Germany", &ua, false));
        // A region that does not contain the market still counts as elsewhere.
        let us = build_market_cfg(&["us".to_string()]);
        assert!(!geo_passes("Remote - EMEA", &us, false));
    }

    #[test]
    fn market_mode_drops_an_empty_or_unreadable_location() {
        let cfg = build_market_cfg(&["ua".to_string()]);
        assert!(!geo_passes("", &cfg, false));
        assert!(!geo_passes("(m/w/d) Full-Time", &cfg, false));
    }

    #[test]
    fn a_source_tagged_for_the_market_passes_everything() {
        // DOU and Djinni RSS items frequently carry no location at all; the source
        // itself is the geographic evidence.
        let cfg = build_market_cfg(&["ua".to_string()]);
        assert!(geo_passes("", &cfg, true));
        assert!(geo_passes("(m/w/d) Full-Time", &cfg, true));
        assert!(geo_passes("Berlin, Germany", &cfg, true));
    }

    #[test]
    fn several_markets_accept_each_other_and_reject_the_rest() {
        let cfg = build_market_cfg(&["de".to_string(), "pl".to_string()]);
        assert!(geo_passes("Berlin", &cfg, false));
        assert!(geo_passes("Warsaw", &cfg, false));
        assert!(!geo_passes("Kyiv", &cfg, false));
    }

    #[test]
    fn region_mode_is_untouched_by_the_market_rules() {
        // No market selected: conservative inclusion still applies, unchanged.
        let cfg = build_geo_cfg(&["europe".to_string()], &[]);
        assert!(geo_passes("Berlin, Germany", &cfg, false));
        assert!(geo_passes("Remote", &cfg, false));
        assert!(
            geo_passes("", &cfg, false),
            "unknown location must not drop"
        );
        assert!(!geo_passes("New York, USA", &cfg, false));
    }

    #[test]
    fn parse_geo_scopes_maps_legacy_scalars() {
        assert_eq!(parse_geo_scopes("europe"), vec!["europe".to_string()]);
        assert_eq!(parse_geo_scopes("eu"), vec!["europe".to_string()]);
        assert_eq!(parse_geo_scopes("usa"), vec!["namerica".to_string()]);
        assert_eq!(parse_geo_scopes("asia"), vec!["asia".to_string()]);
        assert!(parse_geo_scopes("worldwide").is_empty());
        assert!(parse_geo_scopes("custom").is_empty());
    }

    // -- parsers -------------------------------------------------------------

    #[test]
    fn remotive_fixture_parses() {
        let val: serde_json::Value = serde_json::from_str(
            r#"{"jobs":[{"title":"Frontend Dev","company_name":"Acme",
                 "description":"<p>Build &amp; ship</p>",
                 "candidate_required_location":"Europe",
                 "url":"https://remotive.com/jobs/1"}]}"#,
        )
        .unwrap();
        let jobs = parse_remotive(&val);
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].title, "Frontend Dev");
        assert_eq!(jobs[0].company, "Acme");
        assert_eq!(jobs[0].jd_text, "Build & ship");
        assert_eq!(jobs[0].location, "Europe");
    }

    #[test]
    fn himalayas_tolerates_root_array_and_field_spellings() {
        let val: serde_json::Value = serde_json::from_str(
            r#"[{"title":"Rust Dev","companyName":"Ferrous",
                 "description":"Systems work",
                 "locationRestrictions":["Germany","Austria"],
                 "applicationLink":"https://himalayas.app/jobs/2"}]"#,
        )
        .unwrap();
        let jobs = parse_himalayas(&val);
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].company, "Ferrous");
        assert_eq!(jobs[0].location, "Germany, Austria");
    }

    #[test]
    fn rss_wwr_splits_company_from_title() {
        let xml = r#"<rss><channel>
            <item><title>Acme: Senior Dev</title>
              <region>Anywhere in the World</region>
              <link>https://weworkremotely.com/jobs/3</link>
              <description><![CDATA[<p>Great job</p>]]></description></item>
        </channel></rss>"#;
        let jobs = parse_rss_items(xml, true);
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].company, "Acme");
        assert_eq!(jobs[0].title, "Senior Dev");
        assert_eq!(jobs[0].jd_text, "Great job");
        assert_eq!(jobs[0].location, "Anywhere in the World");

        let generic = parse_rss_items(xml, false);
        assert_eq!(generic[0].title, "Acme: Senior Dev");
        assert_eq!(generic[0].company, "");
    }

    #[test]
    fn rss_location_falls_back_to_place_like_category() {
        // No <region>/<location>; a <category> naming a place is used, while the
        // job-type category is ignored.
        let xml = r#"<rss><channel>
            <item><title>Backend Engineer</title>
              <category>Full-Time</category>
              <category>Berlin, Germany</category>
              <link>https://example.com/jobs/1</link>
              <description><![CDATA[<p>Build things</p>]]></description></item>
        </channel></rss>"#;
        let jobs = parse_rss_items(xml, false);
        assert_eq!(jobs[0].location, "Berlin, Germany");
    }

    #[test]
    fn rss_location_reads_body_label() {
        let xml = r#"<rss><channel>
            <item><title>Data Engineer (m/w/d)</title>
              <link>https://example.com/jobs/2</link>
              <description><![CDATA[<p>About us</p><p>Standort: Munich</p>]]></description></item>
        </channel></rss>"#;
        let jobs = parse_rss_items(xml, false);
        assert_eq!(jobs[0].location, "Munich");
    }

    #[test]
    fn rss_location_marks_remote_when_only_signal() {
        let xml = r#"<rss><channel>
            <item><title>Frontend Engineer</title>
              <link>https://example.com/jobs/3</link>
              <description><![CDATA[<p>Fully remote, work from anywhere.</p>]]></description></item>
        </channel></rss>"#;
        let jobs = parse_rss_items(xml, false);
        assert_eq!(jobs[0].location, "Remote");
    }

    #[test]
    fn rss_location_stays_empty_without_any_signal() {
        // "(m/w/d)" and a plain JD must not be mistaken for a location.
        let xml = r#"<rss><channel>
            <item><title>Software Engineer (m/w/d)</title>
              <category>Engineering</category>
              <link>https://example.com/jobs/4</link>
              <description><![CDATA[<p>Join our team building products.</p>]]></description></item>
        </channel></rss>"#;
        let jobs = parse_rss_items(xml, false);
        assert_eq!(jobs[0].location, "");
    }

    #[test]
    fn greenhouse_fixture_parses_escaped_content() {
        let val: serde_json::Value = serde_json::from_str(
            r#"{"jobs":[{"title":"Platform Eng","content":"&lt;p&gt;Do platform things&lt;/p&gt;",
                 "absolute_url":"https://boards.greenhouse.io/acme/jobs/4",
                 "location":{"name":"Berlin"}}]}"#,
        )
        .unwrap();
        let jobs = parse_greenhouse_board(&val, "Acme");
        assert_eq!(jobs[0].jd_text, "Do platform things");
        assert_eq!(jobs[0].location, "Berlin");
        assert_eq!(jobs[0].company, "Acme");
    }

    #[test]
    fn lever_and_ashby_fixtures_parse() {
        let lever: serde_json::Value = serde_json::from_str(
            r#"[{"text":"Data Eng","descriptionPlain":"Pipelines",
                 "categories":{"location":"Remote - Europe"},
                 "hostedUrl":"https://jobs.lever.co/acme/5"}]"#,
        )
        .unwrap();
        let jobs = parse_lever_postings(&lever, "Acme");
        assert_eq!(jobs[0].title, "Data Eng");
        assert_eq!(jobs[0].location, "Remote - Europe");

        let ashby: serde_json::Value = serde_json::from_str(
            r#"{"name":"Acme","jobs":[{"title":"ML Eng","location":"Remote",
                 "descriptionPlain":"Models","jobUrl":"https://jobs.ashbyhq.com/acme/6"}]}"#,
        )
        .unwrap();
        let jobs = parse_ashby_board(&ashby);
        assert_eq!(jobs[0].company, "Acme");
        assert_eq!(jobs[0].title, "ML Eng");
    }

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
