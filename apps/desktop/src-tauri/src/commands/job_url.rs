// From-link paste flow (legal-first - docs/internal/INSTRUCTIONS.md §0, ROADMAP.md §11).
//
// classify_job_url: 0-token deterministic host allowlist check. Only public
// open/ATS/RSS sources (Tier 2/3) are ever fetched. Closed boards (LinkedIn,
// Indeed, StepStone, Glassdoor) and any domain not on the allowlist are
// treated as closed - the app never scrapes them, only opens them in the
// user's browser and waits for a manual copy-paste.
//
// fetch_job_from_url: only ever called for URLs the server itself re-classifies
// as Allowed. Reads each source's known public JSON/XML/RSS shape - never
// parses arbitrary HTML.

use serde::Serialize;

use super::url_parts::{extract_host, path_segments, titleize_slug};
use super::web_text::{strip_html, xml_tag};

#[derive(Debug, Serialize, PartialEq, Eq, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum UrlClassification {
    Allowed {
        source: String,
    },
    Closed {
        #[serde(rename = "boardName")]
        board_name: String,
    },
    Unknown,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchedJob {
    pub title: String,
    pub company: String,
    pub jd_text: String,
}

fn host_matches(host: &str, suffix: &str) -> bool {
    host == suffix || host.ends_with(&format!(".{suffix}"))
}

/// Tier 2 (open API/RSS) + Tier 3 (ATS public JSON API) sources - ROADMAP §11.
/// URLs are pasted as the API endpoint itself (the machine-readable shape),
/// not the closed public HTML board.
const ALLOWED_HOSTS: &[(&str, &str)] = &[
    ("boards-api.greenhouse.io", "greenhouse"),
    ("api.lever.co", "lever"),
    ("api.ashbyhq.com", "ashby"),
    ("jobs.personio.de", "personio"), // matches *.jobs.personio.de
    ("remotive.com", "remotive"),
    ("weworkremotely.com", "weworkremotely"),
];

/// Named explicitly so the UI can show an accurate "we don't connect to X" warning.
const CLOSED_BOARDS: &[(&str, &str)] = &[
    ("linkedin.com", "LinkedIn"),
    ("indeed.com", "Indeed"),
    ("stepstone.de", "StepStone"),
    ("stepstone.com", "StepStone"),
    ("glassdoor.com", "Glassdoor"),
];

#[tauri::command]
pub fn classify_job_url(url: String) -> UrlClassification {
    classify_job_url_core(&url)
}

fn classify_job_url_core(url: &str) -> UrlClassification {
    let Some(host) = extract_host(url) else {
        return UrlClassification::Unknown;
    };

    for (suffix, source) in ALLOWED_HOSTS {
        if host_matches(&host, suffix) {
            return UrlClassification::Allowed {
                source: source.to_string(),
            };
        }
    }

    for (suffix, name) in CLOSED_BOARDS {
        if host_matches(&host, suffix) {
            return UrlClassification::Closed {
                board_name: name.to_string(),
            };
        }
    }

    // Safe default: anything not explicitly recognized as open/legal is
    // treated as closed by the caller - never fetched, never scraped.
    UrlClassification::Unknown
}

/// Fetch a job from an allowed open/ATS source. Re-classifies server-side -
/// never trusts the caller to have checked first.
#[tauri::command]
pub async fn fetch_job_from_url(url: String) -> Result<FetchedJob, String> {
    let source = match classify_job_url_core(&url) {
        UrlClassification::Allowed { source } => source,
        _ => return Err("fetch_job_from_url: URL is not an allowed open/ATS source".to_string()),
    };

    match source.as_str() {
        "greenhouse" => fetch_greenhouse(&url).await,
        "lever" => fetch_lever(&url).await,
        "ashby" => fetch_ashby(&url).await,
        "personio" => fetch_personio(&url).await,
        "remotive" => fetch_remotive(&url).await,
        "weworkremotely" => fetch_weworkremotely(&url).await,
        _ => Err("fetch_job_from_url: unsupported source".to_string()),
    }
}

/// Same reason as `discover.rs`'s client and `ai/api.rs`'s: a bare
/// `reqwest::Client::new()` has no timeout, so a board that accepts the
/// connection and then stalls hangs the paste-from-link flow with no error and
/// no way out. 30s matches the Discover scan's budget - this fetches the same
/// kind of page.
const FETCH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(FETCH_TIMEOUT)
        .build()
        .map_err(|e| format!("fetch_job_from_url: could not create the HTTP client: {e}"))
}

async fn get_json(url: &str) -> Result<serde_json::Value, String> {
    http_client()?
        .get(url)
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("fetch_job_from_url: request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("fetch_job_from_url: {e}"))?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("fetch_job_from_url: invalid JSON response: {e}"))
}

async fn get_text(url: &str) -> Result<String, String> {
    http_client()?
        .get(url)
        .send()
        .await
        .map_err(|e| format!("fetch_job_from_url: request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("fetch_job_from_url: {e}"))?
        .text()
        .await
        .map_err(|e| format!("fetch_job_from_url: invalid response body: {e}"))
}

/// boards-api.greenhouse.io/v1/boards/{slug}/jobs/{id} - the pasted URL IS
/// the API endpoint. Response: { title, content (HTML), location{name} }.
/// Company display name needs a second call to /v1/boards/{slug}.
async fn fetch_greenhouse(url: &str) -> Result<FetchedJob, String> {
    let val = get_json(url).await?;
    let title = val
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or("fetch_job_from_url: greenhouse response missing title")?
        .to_string();
    let content = val.get("content").and_then(|v| v.as_str()).unwrap_or("");

    let segments = path_segments(url);
    let slug = segments
        .iter()
        .position(|s| s == "boards")
        .and_then(|i| segments.get(i + 1))
        .cloned();

    let mut company = slug.as_deref().map(titleize_slug).unwrap_or_default();
    if let Some(slug) = &slug {
        let board_url = format!("https://boards-api.greenhouse.io/v1/boards/{slug}");
        if let Ok(board) = get_json(&board_url).await {
            if let Some(name) = board.get("name").and_then(|v| v.as_str()) {
                company = name.to_string();
            }
        }
    }

    Ok(FetchedJob {
        title,
        company,
        jd_text: strip_html(content),
    })
}

/// api.lever.co/v0/postings/{slug}/{id} - pasted URL is the API endpoint.
/// Response: { text (title), descriptionPlain | description, categories{...} }.
/// No company display name field - falls back to the slug.
async fn fetch_lever(url: &str) -> Result<FetchedJob, String> {
    let val = get_json(url).await?;
    let title = val
        .get("text")
        .and_then(|v| v.as_str())
        .ok_or("fetch_job_from_url: lever response missing text/title")?
        .to_string();
    let body = val
        .get("descriptionPlain")
        .and_then(|v| v.as_str())
        .or_else(|| val.get("description").and_then(|v| v.as_str()))
        .unwrap_or("");

    let segments = path_segments(url);
    let slug = segments.first().cloned().unwrap_or_default();

    Ok(FetchedJob {
        title,
        company: titleize_slug(&slug),
        jd_text: strip_html(body),
    })
}

/// api.ashbyhq.com/posting-api/job-board/{slug} returns the WHOLE board
/// ({ name, jobs: [...] }), not a single job - Ashby's public posting API has
/// no per-job URL. Matches a specific job by id/jobId if the pasted URL
/// carries one (trailing path segment or `?jobId=`); otherwise falls back to
/// the single job on the board when there's exactly one, and errors with a
/// clear message when the board has multiple jobs and none matched.
async fn fetch_ashby(url: &str) -> Result<FetchedJob, String> {
    let segments = path_segments(url);
    let board_idx = segments
        .iter()
        .position(|s| s == "job-board")
        .ok_or("fetch_job_from_url: could not read Ashby board slug from URL")?;
    let slug = segments
        .get(board_idx + 1)
        .cloned()
        .ok_or("fetch_job_from_url: could not read Ashby board slug from URL")?;
    let job_id = segments.get(board_idx + 2).cloned().or_else(|| {
        url.split("jobId=")
            .nth(1)
            .map(|s| s.split('&').next().unwrap_or(s).to_string())
    });

    let board_url = format!("https://api.ashbyhq.com/posting-api/job-board/{slug}");
    let val = get_json(&board_url).await?;
    let company = val
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or(&slug)
        .to_string();
    let jobs = val
        .get("jobs")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let job = match &job_id {
        Some(id) => jobs.iter().find(|j| {
            [j.get("id"), j.get("jobId")]
                .into_iter()
                .flatten()
                .any(|v| v.as_str() == Some(id.as_str()))
        }),
        None => None,
    }
    .or_else(|| if jobs.len() == 1 { jobs.first() } else { None })
    .ok_or(
        "fetch_job_from_url: could not identify a single job on this Ashby board - \
         paste the description text instead",
    )?;

    let title = job
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or("fetch_job_from_url: ashby job missing title")?
        .to_string();
    let body = job
        .get("descriptionPlain")
        .and_then(|v| v.as_str())
        .or_else(|| job.get("descriptionHtml").and_then(|v| v.as_str()))
        .unwrap_or("");

    Ok(FetchedJob {
        title,
        company,
        jd_text: strip_html(body),
    })
}

/// {company}.jobs.personio.de/xml - the public XML feed listing every
/// posting for that company. Verified real shape (fetched live):
///   <position>
///     <id>...</id> <subcompany>...</subcompany> <name>Title</name>
///     <jobDescriptions>
///       <jobDescription><name>Section</name><value><![CDATA[html]]></value></jobDescription>
///       ...
///     </jobDescriptions>
///     ...
///   </position>
/// Minimal manual tag scan (no XML crate) - matches the <position> whose
/// <id> equals the job id in the pasted URL, then concatenates every
/// jobDescription section's <value>.
async fn fetch_personio(url: &str) -> Result<FetchedJob, String> {
    let host = extract_host(url).ok_or("fetch_job_from_url: invalid Personio URL")?;
    let job_id = path_segments(url)
        .last()
        .cloned()
        .ok_or("fetch_job_from_url: could not read Personio job id from URL")?;

    let xml_url = format!("https://{host}/xml");
    let xml = get_text(&xml_url).await?;

    let block = xml
        .split("<position>")
        .skip(1)
        .map(|s| s.split("</position>").next().unwrap_or(""))
        .find(|block| xml_tag(block, "id").as_deref() == Some(job_id.as_str()))
        .ok_or("fetch_job_from_url: job id not found in Personio feed")?;

    let title =
        xml_tag(block, "name").ok_or("fetch_job_from_url: personio posting missing name/title")?;
    let company = xml_tag(block, "subcompany").unwrap_or_else(|| titleize_slug(&host));

    // Personio splits the JD into multiple named sections (tasks,
    // qualifications, benefits, ...) each wrapped in its own <jobDescription>.
    let mut jd_parts = Vec::new();
    for section in block.split("<jobDescription>").skip(1) {
        let section = section.split("</jobDescription>").next().unwrap_or("");
        if let Some(value) = xml_tag(section, "value") {
            jd_parts.push(value);
        }
    }
    let jd_text = if jd_parts.is_empty() {
        strip_html(block)
    } else {
        strip_html(&jd_parts.join("\n\n"))
    };

    Ok(FetchedJob {
        title,
        company,
        jd_text,
    })
}

/// remotive.com/api/remote-jobs - public JSON list of all remote jobs.
/// No single-job-by-id endpoint; matches the pasted URL against each job's
/// `url` field (or trailing numeric id) in the list.
async fn fetch_remotive(url: &str) -> Result<FetchedJob, String> {
    let val = get_json("https://remotive.com/api/remote-jobs").await?;
    let jobs = val
        .get("jobs")
        .and_then(|v| v.as_array())
        .ok_or("fetch_job_from_url: unexpected Remotive response shape")?;

    let normalize = |u: &str| u.trim_end_matches('/').to_string();
    let target = normalize(url);
    let target_id = path_segments(url)
        .last()
        .and_then(|s| s.rsplit('-').next())
        .map(|s| s.to_string());

    let job = jobs
        .iter()
        .find(|j| {
            j.get("url")
                .and_then(|v| v.as_str())
                .map(|u| normalize(u) == target)
                .unwrap_or(false)
        })
        .or_else(|| {
            target_id.as_ref().and_then(|id| {
                jobs.iter().find(|j| {
                    j.get("id")
                        .map(|v| v.to_string().trim_matches('"') == id.as_str())
                        .unwrap_or(false)
                })
            })
        })
        .ok_or("fetch_job_from_url: job not found in Remotive listing")?;

    let title = job
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or("fetch_job_from_url: remotive job missing title")?
        .to_string();
    let company = job
        .get("company_name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let body = job
        .get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    Ok(FetchedJob {
        title,
        company,
        jd_text: strip_html(body),
    })
}

/// weworkremotely.com - no public JSON API, only category-scoped RSS feeds.
/// Tries the common category feeds and matches the pasted URL against each
/// item's <link>. RSS titles are "Company: Role" - split on the first colon.
async fn fetch_weworkremotely(url: &str) -> Result<FetchedJob, String> {
    const FEEDS: &[&str] = &[
        "https://weworkremotely.com/categories/remote-programming-jobs.rss",
        "https://weworkremotely.com/categories/remote-design-jobs.rss",
        "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss",
        "https://weworkremotely.com/categories/remote-product-jobs.rss",
        "https://weworkremotely.com/categories/remote-customer-support-jobs.rss",
        "https://weworkremotely.com/categories/remote-sales-and-marketing-jobs.rss",
        "https://weworkremotely.com/categories/all-other-remote-jobs.rss",
    ];
    let normalize = |u: &str| u.trim_end_matches('/').to_string();
    let target = normalize(url);

    for feed_url in FEEDS {
        let Ok(xml) = get_text(feed_url).await else {
            continue;
        };
        for item in xml.split("<item>").skip(1) {
            let item = item.split("</item>").next().unwrap_or("");
            let Some(link) = xml_tag(item, "link") else {
                continue;
            };
            if normalize(&link) != target {
                continue;
            }
            let raw_title = xml_tag(item, "title").unwrap_or_default();
            let (company, title) = match raw_title.split_once(':') {
                Some((c, t)) => (c.trim().to_string(), t.trim().to_string()),
                None => (String::new(), raw_title.clone()),
            };
            let body = xml_tag(item, "description").unwrap_or_default();
            return Ok(FetchedJob {
                title,
                company,
                jd_text: strip_html(&body),
            });
        }
    }

    Err("fetch_job_from_url: job not found in WeWorkRemotely feeds - paste the description text instead".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_known_ats_and_open_hosts() {
        assert_eq!(
            classify_job_url_core("https://boards-api.greenhouse.io/v1/boards/acme/jobs/123"),
            UrlClassification::Allowed {
                source: "greenhouse".to_string()
            }
        );
        assert_eq!(
            classify_job_url_core("https://api.lever.co/v0/postings/acme/abc-123"),
            UrlClassification::Allowed {
                source: "lever".to_string()
            }
        );
        assert_eq!(
            classify_job_url_core("https://api.ashbyhq.com/posting-api/job-board/acme"),
            UrlClassification::Allowed {
                source: "ashby".to_string()
            }
        );
        assert_eq!(
            classify_job_url_core("https://acme.jobs.personio.de/job/12345"),
            UrlClassification::Allowed {
                source: "personio".to_string()
            }
        );
        assert_eq!(
            classify_job_url_core("https://remotive.com/remote-jobs/software-dev/acme-1234"),
            UrlClassification::Allowed {
                source: "remotive".to_string()
            }
        );
        assert_eq!(
            classify_job_url_core("https://weworkremotely.com/remote-jobs/acme-role"),
            UrlClassification::Allowed {
                source: "weworkremotely".to_string()
            }
        );
    }

    #[test]
    fn closes_known_closed_boards() {
        assert_eq!(
            classify_job_url_core("https://www.linkedin.com/jobs/view/1234"),
            UrlClassification::Closed {
                board_name: "LinkedIn".to_string()
            }
        );
        assert_eq!(
            classify_job_url_core("https://de.indeed.com/viewjob?jk=abc"),
            UrlClassification::Closed {
                board_name: "Indeed".to_string()
            }
        );
        assert_eq!(
            classify_job_url_core("https://www.stepstone.de/stellenangebote--x"),
            UrlClassification::Closed {
                board_name: "StepStone".to_string()
            }
        );
        assert_eq!(
            classify_job_url_core("https://www.glassdoor.com/job-listing/x"),
            UrlClassification::Closed {
                board_name: "Glassdoor".to_string()
            }
        );
    }

    #[test]
    fn unknown_domains_default_closed() {
        assert_eq!(
            classify_job_url_core("https://some-random-blog.example/jobs/1"),
            UrlClassification::Unknown
        );
        assert_eq!(
            classify_job_url_core("not a url"),
            UrlClassification::Unknown
        );
    }
}
