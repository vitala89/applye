// Reading a job out of a source's feed format.
//
// Split out of `discover.rs`, which was 2742 lines against an 800 budget after
// its geography came out. This is the other pure half: twelve readers for the
// shapes the built-in sources actually serve - Remotive, Himalayas, RSS,
// Greenhouse, Lever, Ashby, Personio, Arbeitsagentur, Trudvsem, Arbeitnow and
// NoFluffJobs, plus the detail reader for the one source whose list carries no
// description - and the small helpers only they use.
//
// Every reader takes already-fetched text or JSON and returns `RawJob`s. None
// of them touches the network: the HTTPS layer stays in `discover_fetch.rs`,
// which is what makes all of this testable against a fixture instead of a
// server. `RawJob` is defined here because this is where every one of them is
// built.

use super::discover_geo::{location_signal, REMOTE_MARKERS};
use super::job_url::{strip_html, xml_tag};

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

/// Read a string field out of a feed's JSON object, treating a missing key and
/// a non-string value alike as an empty string. Feeds are inconsistent about
/// which optional fields they send at all, and a job is never worth dropping
/// over one.
pub(super) fn json_str(v: &serde_json::Value, key: &str) -> String {
    v.get(key)
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string()
}

/// Feeds disagree about how many times they escape their markup - Greenhouse
/// ships `content` escaped (`&lt;p&gt;`), ArbeitNow escapes the entities inside
/// it as well. `strip_html` handles every layer, so this is now only a name for
/// what the parsers are doing.
pub(super) fn html_to_text(raw: &str) -> String {
    strip_html(raw)
}

/// remotive.com/api/remote-jobs: { jobs: [{ title, company_name, description,
/// candidate_required_location, url }] }
pub(super) fn parse_remotive(val: &serde_json::Value) -> Vec<RawJob> {
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
            detail_ref: None,
        })
        .collect()
}

/// himalayas.app/jobs/api - shape read tolerantly (root array or { jobs: [...] },
/// several observed field spellings) so a feed-side rename degrades to an
/// empty field, not a scan error.
pub(super) fn parse_himalayas(val: &serde_json::Value) -> Vec<RawJob> {
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
                detail_ref: None,
            }
        })
        .collect()
}

/// Reads a "Location: X" / "Standort: X" / "Ort: X" label out of plain-text JD.
pub(super) fn labelled_location(jd: &str) -> Option<String> {
    const LABELS: &[&str] = &["location:", "standort:", "ort:", "based in:", "office:"];
    for line in jd.lines() {
        let low = line.to_lowercase();
        for label in LABELS {
            if let Some(idx) = low.find(label) {
                let value = line[idx + label.len()..].trim();
                // Stop at the next label-like separator on the same line.
                let value = value.split(['|', '·', '•']).next().unwrap_or(value).trim();
                if !value.is_empty() && value.len() <= 60 {
                    return Some(value.to_string());
                }
            }
        }
    }
    None
}

/// All values of a repeated XML tag (RSS feeds emit several <category> tags).
pub(super) fn xml_tags(block: &str, tag: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = block;
    while let Some(v) = xml_tag(rest, tag) {
        out.push(v);
        // Advance past this tag's close so the next iteration finds the following one.
        let close = format!("</{tag}>");
        match rest.find(&close) {
            Some(i) => rest = &rest[i + close.len()..],
            None => break,
        }
    }
    out
}

/// Best-effort location for a generic RSS item. Order: explicit region/location
/// tags -> a <category> that looks like a place -> a "Location:" label in the
/// body -> "Remote" when the item is clearly remote -> empty (rolls into Other).
pub(super) fn extract_rss_location(item: &str, title: &str, jd_text: &str) -> String {
    if let Some(loc) = xml_tag(item, "region").or_else(|| xml_tag(item, "location")) {
        let loc = loc.trim();
        if !loc.is_empty() {
            return loc.to_string();
        }
    }
    for cat in xml_tags(item, "category") {
        let c = cat.trim();
        if !c.is_empty() && location_signal(c) {
            return c.to_string();
        }
    }
    if let Some(l) = labelled_location(jd_text) {
        return l;
    }
    let hay = format!("{title} {jd_text}").to_lowercase();
    if REMOTE_MARKERS.iter().any(|m| hay.contains(m)) {
        return "Remote".to_string();
    }
    String::new()
}

/// Generic RSS <item> reader (We Work Remotely and user-added feeds).
/// WWR titles are "Company: Role" - `split_company_from_title` splits on the
/// first colon; other feeds keep the full title and an empty company.
pub(super) fn parse_rss_items(xml: &str, split_company_from_title: bool) -> Vec<RawJob> {
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
        let jd_text = html_to_text(&xml_tag(item, "description").unwrap_or_default());
        let location = extract_rss_location(item, &title, &jd_text);
        out.push(RawJob {
            title,
            company,
            jd_text,
            location,
            url: xml_tag(item, "link").unwrap_or_default(),
            detail_ref: None,
        });
    }
    out
}

/// Percent-encode everything outside the unreserved set, so a reference number
/// with a slash or a space still yields one path segment.
pub(super) fn percent_encode_segment(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for b in raw.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char)
            }
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}

/// Human-facing posting page for a Bundesagentur reference number.
pub(super) fn arbeitsagentur_job_url(refnr: &str) -> String {
    format!(
        "https://www.arbeitsagentur.de/jobsuche/jobdetail/{}",
        percent_encode_segment(refnr)
    )
}

/// rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs:
/// `{ stellenangebote: [{ titel, beruf, refnr, arbeitgeber, arbeitsort: { ort,
/// plz, region, land }, externeUrl }] }`.
///
/// The list endpoint carries no description, so `jd_text` is seeded from the
/// structured fields and `detail_ref` holds the reference number the scan uses
/// to pull the real `stellenbeschreibung` for jobs that pass the filters.
pub(super) fn parse_arbeitsagentur(val: &serde_json::Value) -> Vec<RawJob> {
    let Some(jobs) = val.get("stellenangebote").and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    jobs.iter()
        .map(|j| {
            let beruf = json_str(j, "beruf");
            let title = [json_str(j, "titel"), beruf.clone()]
                .into_iter()
                .find(|s| !s.is_empty())
                .unwrap_or_default();
            let ort = j.get("arbeitsort");
            let location = [
                ort.map(|o| json_str(o, "ort")).unwrap_or_default(),
                ort.map(|o| json_str(o, "region")).unwrap_or_default(),
                ort.map(|o| json_str(o, "land")).unwrap_or_default(),
            ]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(", ");
            // A German posting with no country token would be dropped by a
            // "Germany" geo scope, and the feed omits `land` for domestic ads.
            let location = if location.is_empty() {
                "Deutschland".to_string()
            } else if location.to_lowercase().contains("deutschland") {
                location
            } else {
                format!("{location}, Deutschland")
            };
            let company = json_str(j, "arbeitgeber");
            let refnr = json_str(j, "refnr");
            let external = json_str(j, "externeUrl");
            let url = if external.is_empty() {
                if refnr.is_empty() {
                    String::new()
                } else {
                    arbeitsagentur_job_url(&refnr)
                }
            } else {
                external
            };
            // Placeholder body until the detail request runs; keeps the job
            // readable (and its hash stable) if that request fails.
            let jd_text = [
                title.clone(),
                beruf,
                company.clone(),
                location.clone(),
                json_str(j, "eintrittsdatum"),
            ]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("\n");
            RawJob {
                title,
                company,
                jd_text,
                location,
                url,
                detail_ref: if refnr.is_empty() { None } else { Some(refnr) },
            }
        })
        .collect()
}

/// opendata.trudvsem.ru/api/v1/vacancies: `{ results: { vacancies: [{ vacancy: {
/// job-name, company: { name }, region: { name }, vac_url, duty, requirement,
/// employment, schedule, salary_min, salary_max, currency } }] } }`. Official
/// Rostrud open-data portal, no key required. `region.name` comes back in
/// Russian (e.g. "Москва"), so ", Russia" is appended the same way
/// `parse_arbeitsagentur` appends "Deutschland" - a bare geoScope match needs
/// an English country token somewhere in the location string.
pub(super) fn parse_trudvsem(val: &serde_json::Value) -> Vec<RawJob> {
    let Some(vacancies) = val
        .get("results")
        .and_then(|r| r.get("vacancies"))
        .and_then(|v| v.as_array())
    else {
        return Vec::new();
    };
    vacancies
        .iter()
        .filter_map(|entry| entry.get("vacancy"))
        .map(|j| {
            let title = json_str(j, "job-name");
            let company = j
                .get("company")
                .map(|c| json_str(c, "name"))
                .unwrap_or_default();
            let region = j
                .get("region")
                .map(|r| json_str(r, "name"))
                .unwrap_or_default();
            let location = if region.is_empty() {
                "Russia".to_string()
            } else {
                format!("{region}, Russia")
            };
            let jd_text = [
                json_str(j, "duty"),
                json_str(j, "requirement"),
                json_str(j, "employment"),
                json_str(j, "schedule"),
            ]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("\n\n");
            RawJob {
                title,
                company,
                jd_text,
                location,
                url: json_str(j, "vac_url"),
                detail_ref: None,
            }
        })
        .collect()
}

/// arbeitnow.com/api/job-board-api: `{ data: [{ title, company_name,
/// description, location, url, remote }] }`. German-market board - Germany
/// is appended to the location the same way `parse_arbeitsagentur` does, since
/// the feed does not reliably carry a country token of its own.
pub(super) fn parse_arbeitnow(val: &serde_json::Value) -> Vec<RawJob> {
    let Some(jobs) = val.get("data").and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    jobs.iter()
        .map(|j| {
            let location = json_str(j, "location");
            let location = if location.is_empty() {
                "Germany".to_string()
            } else if location.to_lowercase().contains("germany")
                || location.to_lowercase().contains("deutschland")
            {
                location
            } else {
                format!("{location}, Germany")
            };
            RawJob {
                title: json_str(j, "title"),
                company: json_str(j, "company_name"),
                jd_text: html_to_text(&json_str(j, "description")),
                location,
                url: json_str(j, "url"),
                detail_ref: None,
            }
        })
        .collect()
}

// The readers' tests live in a sibling file: together they cross the 800-line
// budget this module is under, and a fixture-heavy test body is exactly the
// kind of bulk that budget exists to keep out of the code being read.
#[cfg(test)]
#[path = "discover_parsers_tests.rs"]
mod tests;
