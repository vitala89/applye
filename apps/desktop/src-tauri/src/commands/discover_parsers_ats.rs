//! Company job boards behind a hosted ATS (ROADMAP §11).
//!
//! Greenhouse, Lever, Ashby and Personio each publish one company's openings at
//! a slug-scoped endpoint, which is what separates them from the public feeds in
//! `discover_parsers`: the company is known before the request is made, so these
//! readers take it as an argument and fall back to it when a posting does not
//! name its own employer. Pure - already-fetched text or JSON in, `RawJob`s out.

use super::discover_parsers::{html_to_text, json_str, RawJob};
use super::web_text::xml_tag;

/// boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true:
/// { jobs: [{ title, content, absolute_url, location: { name } }] }
pub(super) fn parse_greenhouse_board(val: &serde_json::Value, company: &str) -> Vec<RawJob> {
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
                detail_ref: None,
            }
        })
        .collect()
}

/// api.lever.co/v0/postings/{slug}?mode=json: [ { text, descriptionPlain |
/// description, categories: { location }, hostedUrl } ]
pub(super) fn parse_lever_postings(val: &serde_json::Value, company: &str) -> Vec<RawJob> {
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
                detail_ref: None,
            }
        })
        .collect()
}

/// api.ashbyhq.com/posting-api/job-board/{slug}: { name, jobs: [{ title,
/// location, descriptionPlain | descriptionHtml, jobUrl | applyUrl }] }
pub(super) fn parse_ashby_board(val: &serde_json::Value) -> Vec<RawJob> {
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
                detail_ref: None,
            }
        })
        .collect()
}

/// {slug}.jobs.personio.de/xml: `<position>` blocks with `<name>`, `<office>`,
/// `<id>` and a `<jobDescriptions>` list of CDATA HTML sections. Personio is
/// the dominant ATS for German small and mid-size employers, and its board
/// feed is public XML built for machine reading.
///
/// Every description section is concatenated, keeping its heading ("Aufgaben",
/// "Dein Profil"), because the split between them is where a German posting
/// puts its actual requirements.
pub(super) fn parse_personio_xml(xml: &str, slug: &str, company_fallback: &str) -> Vec<RawJob> {
    let mut out = Vec::new();
    for block in xml.split("<position>").skip(1) {
        let block = block.split("</position>").next().unwrap_or("");
        // <name> is used both for the position title and for each description
        // section heading, so read the title from the block before the
        // descriptions start.
        let head = block.split("<jobDescriptions>").next().unwrap_or(block);
        let Some(title) = xml_tag(head, "name") else {
            continue;
        };
        let company = xml_tag(head, "subcompany").unwrap_or_else(|| company_fallback.to_string());
        let location = xml_tag(head, "office").unwrap_or_default();
        let id = xml_tag(head, "id").unwrap_or_default();

        let sections = block.split("<jobDescription>").skip(1);
        let mut body = String::new();
        for section in sections {
            let section = section.split("</jobDescription>").next().unwrap_or("");
            if let Some(heading) = xml_tag(section, "name") {
                body.push_str(&heading);
                body.push('\n');
            }
            if let Some(value) = xml_tag(section, "value") {
                body.push_str(&html_to_text(&value));
                body.push_str("\n\n");
            }
        }

        out.push(RawJob {
            title,
            company,
            jd_text: body.trim().to_string(),
            location,
            url: if id.is_empty() {
                format!("https://{slug}.jobs.personio.de")
            } else {
                format!("https://{slug}.jobs.personio.de/job/{id}")
            },
            detail_ref: None,
        });
    }
    out
}

// The readers' tests live in a sibling file, following `discover_parsers`: the
// fixtures are longer than the readers they exercise.
#[cfg(test)]
#[path = "discover_parsers_ats_tests.rs"]
mod tests;
