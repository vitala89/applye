// Discover fetch layer (ROADMAP §11).
//
// The only place in the discover group that touches the network. Every request
// goes out over the shared client, and every URL passes `require_https` first,
// so a source row edited to `http://` is refused rather than fetched in the
// clear. What comes back is handed straight to the known-shape readers in
// `discover_parsers` - never to an HTML scraper - and the module returns
// `RawJob`s, not rows: nothing here reads or writes the database.

use super::discover_parsers::{
    html_to_text, json_str, parse_arbeitnow, parse_arbeitsagentur, parse_himalayas, parse_remotive,
    parse_rss_items, parse_trudvsem, percent_encode_segment, RawJob,
};
use super::discover_parsers_ats::{
    parse_ashby_board, parse_greenhouse_board, parse_lever_postings, parse_personio_xml,
};
use super::discover_parsers_nofluffjobs::{parse_nofluffjobs, parse_nofluffjobs_detail};
use super::job_url::{extract_host, path_segments, titleize_slug};

/// One enabled source, as the scan read it out of `discover_sources`.
pub(super) struct SourceRow {
    pub(super) id: i64,
    pub(super) name: String,
    pub(super) source_type: String,
    pub(super) url: String,
    pub(super) slug: Option<String>,
    pub(super) positive_json: Option<String>,
    pub(super) negative_json: Option<String>,
    pub(super) geo_tags_json: Option<String>,
}

// ---------------------------------------------------------------------------
// Fetch (thin HTTPS layer over the pure parsers)
// ---------------------------------------------------------------------------

pub(super) fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent(concat!("Applye/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("discover_scan: build http client: {e}"))
}

pub(super) fn require_https(url: &str) -> Result<(), String> {
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
pub(super) const ARBEITSAGENTUR_DETAIL_CAP: usize = 60;

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
pub(super) async fn fetch_arbeitsagentur_detail(
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
pub(super) async fn fetch_nofluffjobs_detail(
    client: &reqwest::Client,
    slug: &str,
) -> Result<String, String> {
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

pub(super) async fn fetch_source_jobs(
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

#[cfg(test)]
mod tests {
    use super::*;

    /// `require_https` is the only thing standing between a source row edited to
    /// `http://` and a plaintext request, and every fetch in this module goes
    /// through it. Asserted directly so the guard cannot be weakened silently.
    #[test]
    fn require_https_rejects_everything_that_is_not_https() {
        assert!(require_https("https://example.com/jobs.xml").is_ok());
        assert!(require_https("http://example.com/jobs.xml").is_err());
        // No scheme, a scheme that only looks right, and the file and data
        // schemes a hand-edited row could otherwise smuggle in.
        assert!(require_https("example.com/jobs.xml").is_err());
        assert!(require_https("HTTPS://example.com").is_err());
        assert!(require_https("file:///etc/passwd").is_err());
        assert!(require_https("data:text/xml,<rss/>").is_err());
        assert!(require_https("").is_err());
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
}
