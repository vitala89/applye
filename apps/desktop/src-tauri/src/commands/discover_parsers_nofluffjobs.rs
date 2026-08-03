//! No Fluff Jobs (ROADMAP §11).
//!
//! The one source in the group that needs two requests. Its list endpoint
//! carries no description at all, only structured fields, so a posting is
//! seeded from those and the real body is fetched per job afterwards - which is
//! why the detail reader and the salary formatter live here rather than beside
//! the single-request feeds. Pure: fetched JSON in, text out.

use super::discover_parsers::{html_to_text, json_str, RawJob};

/// nofluffjobs.com/api/joboffers/main - shape read tolerantly (root array or
/// `{ postings: [...] }`, several observed field spellings for company/city)
/// so a feed-side rename degrades to an empty field, not a scan error, same
/// approach as `parse_himalayas`. Poland-market board.
///
/// The list endpoint carries no description, only structured fields
/// (technology, category, seniority) - `jd_text` is seeded from those, same
/// placeholder approach as `parse_arbeitsagentur`.
pub(super) fn parse_nofluffjobs(val: &serde_json::Value) -> Vec<RawJob> {
    let postings = val
        .as_array()
        .cloned()
        .or_else(|| val.get("postings").and_then(|v| v.as_array()).cloned())
        .unwrap_or_default();
    postings
        .iter()
        .map(|j| {
            let company = [json_str(j, "name"), json_str(j, "companyName")]
                .into_iter()
                .find(|s| !s.is_empty())
                .unwrap_or_default();
            let city = j
                .get("location")
                .and_then(|l| l.get("places"))
                .and_then(|p| p.as_array())
                .and_then(|arr| arr.first())
                .map(|p| json_str(p, "city"))
                .unwrap_or_default();
            let remote = j
                .get("location")
                .and_then(|l| l.get("fullyRemote"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let location = if !city.is_empty() {
                format!("{city}, Poland")
            } else if remote {
                "Remote, Poland".to_string()
            } else {
                "Poland".to_string()
            };
            let slug = [json_str(j, "url"), json_str(j, "id")]
                .into_iter()
                .find(|s| !s.is_empty())
                .unwrap_or_default();
            // The list endpoint has no description; a bare slug lets the scan
            // pull the full posting from /api/posting/{slug}. An absolute url or
            // an empty slug does not key that endpoint.
            let detail_ref = if slug.is_empty() || slug.starts_with("http") {
                None
            } else {
                Some(slug.clone())
            };
            let url = if slug.starts_with("http") {
                slug
            } else if slug.is_empty() {
                String::new()
            } else {
                format!("https://nofluffjobs.com/job/{slug}")
            };
            let seniority = j
                .get("seniority")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|x| x.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default();
            let jd_text = [
                json_str(j, "category"),
                json_str(j, "technology"),
                seniority,
            ]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("\n");
            RawJob {
                title: json_str(j, "title"),
                company,
                jd_text,
                location,
                url,
                detail_ref,
            }
        })
        .collect()
}

/// Builds a structured `jd_text` from a No Fluff Jobs posting-detail document
/// (`GET /api/posting/{slug}`). The list endpoint carries no description at
/// all, so without this a posting reaches the feed as a three-word stub.
///
/// Headings end with `:` and use words the Discover block renderer recognises
/// (`looksLikeHeading` in discover.component.ts) so the detail screen shows
/// real sections. Content is left in the posting's own language on purpose;
/// the value is the structure, not a translation.
pub(super) fn parse_nofluffjobs_detail(val: &serde_json::Value) -> String {
    let mut out: Vec<String> = Vec::new();

    let values = |key: &str| -> Vec<String> {
        val.get("requirements")
            .and_then(|r| r.get(key))
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| m.get("value").and_then(|v| v.as_str()))
                    .map(|s| format!("- {s}"))
                    .collect()
            })
            .unwrap_or_default()
    };

    let musts = values("musts");
    if !musts.is_empty() {
        out.push("Requirements:".to_string());
        out.extend(musts);
        out.push(String::new());
    }

    let nices = values("nices");
    if !nices.is_empty() {
        out.push("Nice to have:".to_string());
        out.extend(nices);
        out.push(String::new());
    }

    let desc = val
        .get("requirements")
        .map(|r| html_to_text(&json_str(r, "description")))
        .unwrap_or_default();
    if !desc.trim().is_empty() {
        out.push(desc.trim().to_string());
        out.push(String::new());
    }

    let tasks: Vec<String> = val
        .get("specs")
        .and_then(|s| s.get("dailyTasks"))
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|t| t.as_str())
                .map(|s| format!("- {s}"))
                .collect()
        })
        .unwrap_or_default();
    if !tasks.is_empty() {
        out.push("Responsibilities:".to_string());
        out.extend(tasks);
        out.push(String::new());
    }

    if let Some(line) = nofluffjobs_salary_line(val) {
        out.push(format!("Salary: {line}"));
    }

    out.join("\n").trim().to_string()
}

/// One human line from `essentials.originalSalary`, or None when the pay is
/// not disclosed. Reads the first salary type present (b2b or permanent).
pub(super) fn nofluffjobs_salary_line(val: &serde_json::Value) -> Option<String> {
    let salary = val.get("essentials")?.get("originalSalary")?;
    let currency = salary.get("currency")?.as_str()?;
    let types = salary.get("types")?.as_object()?;
    let (kind, body) = types.iter().next()?;
    let range = body.get("range").and_then(|r| r.as_array())?;
    let from = range.first().and_then(|v| v.as_f64())?;
    let to = range.get(1).and_then(|v| v.as_f64()).unwrap_or(from);
    let period = body
        .get("period")
        .and_then(|p| p.as_str())
        .unwrap_or("month");
    Some(format!(
        "{} - {} {currency} / {period} ({kind})",
        from as i64, to as i64
    ))
}

#[cfg(test)]
#[path = "discover_parsers_nofluffjobs_tests.rs"]
mod tests;
