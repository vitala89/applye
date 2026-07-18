// Discover scan engine (ROADMAP §11, STEP_BY_STEP_PLAN `feat/discover`).
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

use super::job_url::{extract_host, path_segments, strip_html, titleize_slug, xml_tag};
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
struct RawJob {
    title: String,
    company: String,
    jd_text: String,
    location: String,
    url: String,
}

struct SourceRow {
    id: i64,
    name: String,
    source_type: String,
    url: String,
    slug: Option<String>,
    positive_json: Option<String>,
    negative_json: Option<String>,
}

struct TitleFilter {
    positive: Vec<String>,
    negative: Vec<String>,
}

struct GeoCfg {
    scope: String,
    tokens: Vec<String>,
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

// ---------------------------------------------------------------------------
// Geo filter (ROADMAP §11 "Geographic filtering")
// ---------------------------------------------------------------------------

/// Freetext markers meaning "location does not restrict this job".
const REMOTE_MARKERS: &[&str] = &["remote", "anywhere", "worldwide", "global", "distributed"];

/// European country names for the europe/eu scopes. One shared list for both
/// scopes in v1 (includes non-EU Europe: UK, Switzerland, Norway).
const EUROPE_COUNTRIES: &[&str] = &[
    "germany",
    "deutschland",
    "austria",
    "switzerland",
    "france",
    "netherlands",
    "spain",
    "italy",
    "poland",
    "portugal",
    "sweden",
    "denmark",
    "finland",
    "norway",
    "ireland",
    "belgium",
    "czech",
    "slovakia",
    "hungary",
    "romania",
    "bulgaria",
    "greece",
    "croatia",
    "slovenia",
    "estonia",
    "latvia",
    "lithuania",
    "luxembourg",
    "malta",
    "cyprus",
    "united kingdom",
];

/// Names a 2-letter country code also answers to in freetext locations.
fn country_tokens(code: &str) -> Vec<&'static str> {
    match code {
        "de" => vec!["de", "germany", "deutschland"],
        "at" => vec!["at", "austria"],
        "ch" => vec!["ch", "switzerland"],
        "fr" => vec!["fr", "france"],
        "nl" => vec!["nl", "netherlands"],
        "es" => vec!["es", "spain"],
        "it" => vec!["it", "italy"],
        "pl" => vec!["pl", "poland"],
        "pt" => vec!["pt", "portugal"],
        "se" => vec!["se", "sweden"],
        "dk" => vec!["dk", "denmark"],
        "fi" => vec!["fi", "finland"],
        "no" => vec!["no", "norway"],
        "ie" => vec!["ie", "ireland"],
        "be" => vec!["be", "belgium"],
        "cz" => vec!["cz", "czech"],
        "uk" | "gb" => vec!["uk", "gb", "united kingdom", "britain", "england"],
        "us" => vec!["us", "usa", "united states", "america"],
        "ca" => vec!["ca", "canada"],
        _ => vec![],
    }
}

fn build_geo_cfg(scope: &str, active_codes: &[String]) -> GeoCfg {
    let scope = scope.trim().to_lowercase();
    let mut tokens: Vec<String> = Vec::new();
    match scope.as_str() {
        "europe" | "eu" => {
            tokens.push("europe".to_string());
            tokens.push("eu".to_string());
            tokens.push("emea".to_string());
            tokens.extend(EUROPE_COUNTRIES.iter().map(|s| s.to_string()));
        }
        "usa" => {
            tokens.extend(country_tokens("us").into_iter().map(str::to_string));
        }
        _ => {}
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
    GeoCfg { scope, tokens }
}

/// Short tokens (<= 3 chars, e.g. "de", "eu", "us") only match as whole words -
/// substring matching would light up inside unrelated words ("DEsigner",
/// "dEUtschland"). Longer tokens match as substrings.
fn loc_matches(loc: &str, token: &str) -> bool {
    if token.len() <= 3 {
        loc.split(|c: char| !c.is_alphanumeric())
            .any(|w| w == token)
    } else {
        loc.contains(token)
    }
}

/// Conservative inclusion: an empty/unknown location never drops a job -
/// only a location that names somewhere outside the scope does.
fn geo_passes(location: &str, cfg: &GeoCfg) -> bool {
    if cfg.scope == "worldwide" || cfg.scope.is_empty() {
        return true;
    }
    let loc = location.trim().to_lowercase();
    if loc.is_empty() {
        return true;
    }
    if REMOTE_MARKERS.iter().any(|m| loc_matches(&loc, m)) {
        return true;
    }
    cfg.tokens.iter().any(|t| loc_matches(&loc, t))
}

// ---------------------------------------------------------------------------
// Feed parsers (pure - fetched bytes in, RawJobs out; unit-tested on fixtures)
// ---------------------------------------------------------------------------

fn json_str(v: &serde_json::Value, key: &str) -> String {
    v.get(key)
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string()
}

/// Greenhouse ships `content` HTML-escaped (`&lt;p&gt;`); decode the shell of
/// escaping first when there are no real tags, then strip to plain text.
fn html_to_text(raw: &str) -> String {
    if raw.contains('<') {
        strip_html(raw)
    } else {
        let decoded = raw
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&amp;", "&");
        strip_html(&decoded)
    }
}

/// remotive.com/api/remote-jobs: { jobs: [{ title, company_name, description,
/// candidate_required_location, url }] }
fn parse_remotive(val: &serde_json::Value) -> Vec<RawJob> {
    let Some(jobs) = val.get("jobs").and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    jobs.iter()
        .map(|j| RawJob {
            title: json_str(j, "title"),
            company: json_str(j, "company_name"),
            jd_text: html_to_text(&json_str(j, "description")),
            location: json_str(j, "candidate_required_location"),
            url: json_str(j, "url"),
        })
        .collect()
}

/// himalayas.app/jobs/api - shape read tolerantly (root array or { jobs: [...] },
/// several observed field spellings) so a feed-side rename degrades to an
/// empty field, not a scan error.
fn parse_himalayas(val: &serde_json::Value) -> Vec<RawJob> {
    let jobs = val
        .as_array()
        .cloned()
        .or_else(|| val.get("jobs").and_then(|v| v.as_array()).cloned())
        .unwrap_or_default();
    jobs.iter()
        .map(|j| {
            let location = j
                .get("locationRestrictions")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|x| x.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_else(|| json_str(j, "location"));
            let company = [
                json_str(j, "companyName"),
                json_str(j, "company_name"),
                j.get("company")
                    .map(|c| json_str(c, "name"))
                    .unwrap_or_default(),
            ]
            .into_iter()
            .find(|s| !s.is_empty())
            .unwrap_or_default();
            let url = [
                json_str(j, "applicationLink"),
                json_str(j, "url"),
                json_str(j, "guid"),
            ]
            .into_iter()
            .find(|s| !s.is_empty())
            .unwrap_or_default();
            let body = [json_str(j, "description"), json_str(j, "excerpt")]
                .into_iter()
                .find(|s| !s.is_empty())
                .unwrap_or_default();
            RawJob {
                title: json_str(j, "title"),
                company,
                jd_text: html_to_text(&body),
                location,
                url,
            }
        })
        .collect()
}

/// Generic RSS <item> reader (We Work Remotely and user-added feeds).
/// WWR titles are "Company: Role" - `split_company_from_title` splits on the
/// first colon; other feeds keep the full title and an empty company.
fn parse_rss_items(xml: &str, split_company_from_title: bool) -> Vec<RawJob> {
    let mut out = Vec::new();
    for item in xml.split("<item>").skip(1) {
        let item = item.split("</item>").next().unwrap_or("");
        let raw_title = xml_tag(item, "title").unwrap_or_default();
        let (company, title) = if split_company_from_title {
            match raw_title.split_once(':') {
                Some((c, t)) => (c.trim().to_string(), t.trim().to_string()),
                None => (String::new(), raw_title),
            }
        } else {
            (String::new(), raw_title)
        };
        out.push(RawJob {
            title,
            company,
            jd_text: html_to_text(&xml_tag(item, "description").unwrap_or_default()),
            location: xml_tag(item, "region")
                .or_else(|| xml_tag(item, "location"))
                .unwrap_or_default(),
            url: xml_tag(item, "link").unwrap_or_default(),
        });
    }
    out
}

/// boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true:
/// { jobs: [{ title, content, absolute_url, location: { name } }] }
fn parse_greenhouse_board(val: &serde_json::Value, company: &str) -> Vec<RawJob> {
    let Some(jobs) = val.get("jobs").and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    jobs.iter()
        .map(|j| {
            // Greenhouse now ships company_name per job; the slug-derived
            // name is only the fallback.
            let own_company = json_str(j, "company_name");
            RawJob {
                title: json_str(j, "title"),
                company: if own_company.is_empty() {
                    company.to_string()
                } else {
                    own_company
                },
                jd_text: html_to_text(&json_str(j, "content")),
                location: j
                    .get("location")
                    .map(|l| json_str(l, "name"))
                    .unwrap_or_default(),
                url: json_str(j, "absolute_url"),
            }
        })
        .collect()
}

/// api.lever.co/v0/postings/{slug}?mode=json: [ { text, descriptionPlain |
/// description, categories: { location }, hostedUrl } ]
fn parse_lever_postings(val: &serde_json::Value, company: &str) -> Vec<RawJob> {
    let Some(jobs) = val.as_array() else {
        return Vec::new();
    };
    jobs.iter()
        .map(|j| {
            let body = [json_str(j, "descriptionPlain"), json_str(j, "description")]
                .into_iter()
                .find(|s| !s.is_empty())
                .unwrap_or_default();
            RawJob {
                title: json_str(j, "text"),
                company: company.to_string(),
                jd_text: html_to_text(&body),
                location: j
                    .get("categories")
                    .map(|c| json_str(c, "location"))
                    .unwrap_or_default(),
                url: json_str(j, "hostedUrl"),
            }
        })
        .collect()
}

/// api.ashbyhq.com/posting-api/job-board/{slug}: { name, jobs: [{ title,
/// location, descriptionPlain | descriptionHtml, jobUrl | applyUrl }] }
fn parse_ashby_board(val: &serde_json::Value) -> Vec<RawJob> {
    let company = json_str(val, "name");
    let Some(jobs) = val.get("jobs").and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    jobs.iter()
        .map(|j| {
            let body = [
                json_str(j, "descriptionPlain"),
                json_str(j, "descriptionHtml"),
            ]
            .into_iter()
            .find(|s| !s.is_empty())
            .unwrap_or_default();
            let url = [json_str(j, "jobUrl"), json_str(j, "applyUrl")]
                .into_iter()
                .find(|s| !s.is_empty())
                .unwrap_or_default();
            RawJob {
                title: json_str(j, "title"),
                company: company.clone(),
                jd_text: html_to_text(&body),
                location: json_str(j, "location"),
                url,
            }
        })
        .collect()
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
           (company, title, jd_text, jd_hash, source, location,
            imported_from, discover_dismissed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'discover_scan', 0, datetime('now'))",
    )
    .bind(&job.company)
    .bind(&job.title)
    .bind(&jd_text)
    .bind(&jd_hash)
    .bind(source_name)
    .bind(&job.location)
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
                title_filter_positive_json, title_filter_negative_json
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
        })
        .collect();

    let geo_scope: String = sqlx::query_scalar("SELECT geo_scope FROM settings WHERE id = 1")
        .fetch_optional(&db.pool)
        .await
        .map_err(|e| format!("discover_scan: load settings: {e}"))?
        .unwrap_or_else(|| "worldwide".to_string());
    let active_codes: Vec<String> =
        sqlx::query_scalar("SELECT country_code FROM geo_filters WHERE is_active = 1")
            .fetch_all(&db.pool)
            .await
            .map_err(|e| format!("discover_scan: load geo filters: {e}"))?;
    let geo_cfg = build_geo_cfg(&geo_scope, &active_codes);

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

                for job in &raw_jobs {
                    if job.title.trim().is_empty()
                        || !title_passes(&job.title, &filter)
                        || !geo_passes(&job.location, &geo_cfg)
                    {
                        r.filtered_out += 1;
                        continue;
                    }
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
        "SELECT id, company, title, location, source, created_at, discover_shown_at
         FROM jobs
         WHERE imported_from = 'discover_scan' AND discover_dismissed = 0
         ORDER BY created_at DESC, id DESC",
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

#[tauri::command]
pub async fn db_discover_dismiss(job_id: i64, db: State<'_, Db>) -> Result<(), String> {
    sqlx::query("UPDATE jobs SET discover_dismissed = 1 WHERE id = ?")
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

    fn raw(title: &str, jd: &str, url: &str) -> RawJob {
        RawJob {
            title: title.to_string(),
            company: "Acme".to_string(),
            jd_text: jd.to_string(),
            location: "Remote".to_string(),
            url: url.to_string(),
        }
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
        let cfg = build_geo_cfg("worldwide", &[]);
        assert!(geo_passes("Tokyo, Japan", &cfg));
        assert!(geo_passes("", &cfg));
    }

    #[test]
    fn geo_europe_scope() {
        let cfg = build_geo_cfg("europe", &[]);
        assert!(geo_passes("Berlin, Germany", &cfg));
        assert!(geo_passes("Remote - EMEA", &cfg));
        assert!(geo_passes("Remote", &cfg)); // remote marker always passes
        assert!(geo_passes("", &cfg)); // unknown location never drops
        assert!(!geo_passes("New York, USA", &cfg));
    }

    #[test]
    fn geo_country_codes_match_names_not_substrings() {
        let cfg = build_geo_cfg("custom", &["de".to_string()]);
        assert!(geo_passes("Munich, Germany", &cfg));
        assert!(geo_passes("DE", &cfg));
        // "de" must not light up inside unrelated words
        assert!(!geo_passes("Designer Hub, Tokyo", &cfg));
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
