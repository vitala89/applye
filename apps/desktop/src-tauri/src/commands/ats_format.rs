//! Whether a CV is machine-readable at all.
//!
//! The other half of the ATS check asks whether the CV says what the posting
//! asked for. This half asks a question that comes first and is answered
//! without reading the posting: can a parser find the candidate's email, tell
//! experience from education, and compute a tenure. A CV can carry every term
//! in the requirements block and still be filed as one undifferentiated blob.
//!
//! Everything here is pure and deterministic: same CV, same findings, always.

use super::ats::{tokenize, AtsFinding, Severity};

/// Section headings a parser recognises, per language. A CV whose headings are
/// all creative ("What I've been up to") parses into one undifferentiated blob.
fn is_standard_heading(lower: &str) -> bool {
    const STANDARD: &[&str] = &[
        // English
        "experience",
        "work experience",
        "professional experience",
        "employment",
        "education",
        "skills",
        "technical skills",
        "summary",
        "profile",
        "projects",
        "certifications",
        "languages",
        "publications",
        "contact",
        "references",
        "achievements",
        "volunteer",
        // German
        "berufserfahrung",
        "erfahrung",
        "ausbildung",
        "bildung",
        "kenntnisse",
        "fähigkeiten",
        "faehigkeiten",
        "kompetenzen",
        "profil",
        "projekte",
        "zertifikate",
        "sprachen",
        "kontakt",
        "weiterbildung",
        "praktika",
    ];
    STANDARD.iter().any(|s| lower.contains(s))
}

/// The CV's *section* headings, as (raw, lowercased) pairs.
///
/// Level matters. A generated CV puts the candidate's name at `#` and each job
/// title at `###`; only `##` names a section. Treating every heading level as a
/// section made "Senior Backend Engineer, Acme GmbH (2021 - 2026)" look like an
/// unrecognised section name on a perfectly ordinary CV. Level 1 is used only
/// as a fallback for CVs that have no `##` at all, minus the first one, which
/// is the document title rather than a section.
fn headings(cv_markdown: &str) -> Vec<(String, String)> {
    fn collect(cv_markdown: &str, hashes: &str) -> Vec<(String, String)> {
        cv_markdown
            .lines()
            .filter_map(|line| {
                let trimmed = line.trim();
                let rest = trimmed.strip_prefix(hashes)?;
                // Reject a deeper level: "###" must not match the "##" pass.
                if rest.starts_with('#') {
                    return None;
                }
                let text = rest.trim();
                if text.is_empty() {
                    return None;
                }
                Some((text.to_string(), text.to_lowercase()))
            })
            .collect()
    }

    let level_two = collect(cv_markdown, "##");
    if !level_two.is_empty() {
        return level_two;
    }
    let mut level_one = collect(cv_markdown, "#");
    if !level_one.is_empty() {
        level_one.remove(0);
    }
    level_one
}

/// Regions where a photo on a CV is expected rather than a liability. In the
/// German-speaking market a Bewerbungsfoto is normal; in the US, UK, Canada,
/// Australia and Ireland it invites discrimination-screening problems and some
/// employers' parsers reject the file outright.
fn photo_is_expected(region: Option<&str>) -> bool {
    matches!(
        region.map(str::to_ascii_lowercase).as_deref(),
        Some("de" | "at" | "ch")
    )
}

fn finding(id: &str, severity: Severity, message: &str) -> AtsFinding {
    AtsFinding {
        id: id.to_string(),
        severity,
        message: message.to_string(),
    }
}

pub(super) fn parsability_findings(cv_markdown: &str, region: Option<&str>) -> Vec<AtsFinding> {
    let mut out = Vec::new();
    let lower = cv_markdown.to_lowercase();

    // Contact details. A parser that cannot find these has nothing to file the
    // candidate under, which is the single most expensive failure here.
    let has_email = cv_markdown.contains('@')
        && cv_markdown
            .split_whitespace()
            .any(|w| w.contains('@') && w.contains('.'));
    if !has_email {
        out.push(finding(
            "ats.no_email",
            Severity::High,
            "No email address found. Parsers key a candidate record on the email; without one the application can be dropped before a human sees it.",
        ));
    }
    let digit_runs = cv_markdown
        .split(|c: char| !(c.is_ascii_digit() || matches!(c, '+' | ' ' | '-' | '(' | ')')))
        .any(|s| s.chars().filter(char::is_ascii_digit).count() >= 9);
    if !digit_runs {
        out.push(finding(
            "ats.no_phone",
            Severity::Medium,
            "No phone number found. Some application forms auto-fill from the CV and will leave the phone field blank, which reads as an incomplete application.",
        ));
    }

    // Tables: parsers flatten them, and a two-column table reads across rather
    // than down, interleaving unrelated cells.
    let has_table = cv_markdown
        .lines()
        .any(|l| l.matches('|').count() >= 2 && l.contains("---"));
    if has_table {
        out.push(finding(
            "ats.table_layout",
            Severity::Medium,
            "The CV uses a table. Parsers flatten tables and often read across rows, interleaving unrelated cells into one line.",
        ));
    }

    // Images. Never parseable content; the question is only whether the market
    // expects one anyway.
    let has_image = cv_markdown.contains("![");
    if has_image && !photo_is_expected(region) {
        out.push(finding(
            "ats.photo_in_anglo_market",
            Severity::High,
            "The CV contains a photo. In the US, UK, Canada, Australia and Ireland a photo is not expected and some employers discard CVs that carry one.",
        ));
    }

    // Headings.
    let heads = headings(cv_markdown);
    if heads.is_empty() {
        out.push(finding(
            "ats.no_headings",
            Severity::High,
            "No section headings found. Without them a parser cannot tell experience from education and files the whole CV as one block of text.",
        ));
    } else {
        let unrecognised: Vec<&str> = heads
            .iter()
            .filter(|(_, l)| !is_standard_heading(l))
            .map(|(raw, _)| raw.as_str())
            .collect();
        if !heads.iter().any(|(_, l)| is_standard_heading(l)) {
            out.push(finding(
                "ats.no_standard_heading",
                Severity::High,
                "None of the section headings use a name parsers recognise (Experience, Education, Skills). Rename at least the main sections.",
            ));
        } else if unrecognised.len() >= 2 {
            out.push(finding(
                "ats.unusual_headings",
                Severity::Medium,
                &format!(
                    "These headings are not ones parsers recognise: {}. Their content may be filed under the previous section.",
                    unrecognised.join(", ")
                ),
            ));
        }
    }

    // Dates. Without a year anywhere, no tenure can be computed and every
    // "minimum N years" filter fails the candidate by default.
    let has_year = tokenize(cv_markdown).iter().any(|t| {
        t.len() == 4
            && t.chars().all(|c| c.is_ascii_digit())
            && (t.starts_with("19") || t.starts_with("20"))
    });
    if !has_year {
        out.push(finding(
            "ats.no_dates",
            Severity::Medium,
            "No four-digit years found. Filters that require a minimum number of years cannot compute tenure and will exclude the candidate.",
        ));
    }

    // Substance. A CV this short usually means the export lost most of it.
    let visible_chars = cv_markdown.chars().filter(|c| !c.is_whitespace()).count();
    if visible_chars < 800 {
        out.push(finding(
            "ats.too_short",
            Severity::High,
            "The CV holds very little text. If it looked complete on screen, the export dropped content that the parser will not see either.",
        ));
    }

    // Decorative bullets. Minor, but some parsers emit them as literal glyphs
    // in the middle of the extracted sentence.
    if lower.contains('▪') || lower.contains('➤') || lower.contains('●') || lower.contains('❖')
    {
        out.push(finding(
            "ats.decorative_bullets",
            Severity::Low,
            "Decorative bullet glyphs are used. Some parsers keep them as literal characters inside the extracted line.",
        ));
    }

    // Links. Fine in themselves; the risk is information that exists only
    // behind one, which the parser never follows.
    let link_count = cv_markdown.matches("](http").count();
    if link_count > 4 {
        out.push(finding(
            "ats.link_heavy",
            Severity::Low,
            "The CV leans on several links. Parsers do not follow them, so anything that exists only behind a link is invisible to the filter.",
        ));
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;
    // The passing CV is shared with the keyword half's tests rather than copied.
    // It is the one fixture both halves need to agree on: a CV that is both
    // well-covered and cleanly parseable, so either half finding fault with it
    // is a real regression.
    use crate::commands::ats::tests::good_cv;

    fn finding_ids(cv: &str, region: Option<&str>) -> Vec<String> {
        parsability_findings(cv, region)
            .into_iter()
            .map(|f| f.id)
            .collect()
    }

    #[test]
    fn missing_contact_details_are_high_severity() {
        let ids = finding_ids(
            "## Experience\n### Engineer (2020 - 2024)\n- Did the work.\n",
            Some("de"),
        );
        assert!(ids.contains(&"ats.no_email".to_string()), "{ids:?}");
        assert!(ids.contains(&"ats.no_phone".to_string()), "{ids:?}");
    }

    #[test]
    fn a_photo_is_flagged_in_anglo_markets_and_accepted_in_german_ones() {
        let cv = good_cv().replace("# Jane Developer", "# Jane Developer\n![photo](me.png)");
        let anglo = finding_ids(&cv, Some("us"));
        assert!(
            anglo.contains(&"ats.photo_in_anglo_market".to_string()),
            "{anglo:?}"
        );
        let german = finding_ids(&cv, Some("de"));
        assert!(
            !german.contains(&"ats.photo_in_anglo_market".to_string()),
            "{german:?}"
        );
    }

    #[test]
    fn a_table_layout_is_flagged() {
        let cv = good_cv() + "\n| Skill | Level |\n| --- | --- |\n| Rust | Expert |\n";
        assert!(
            finding_ids(&cv, Some("de")).contains(&"ats.table_layout".to_string()),
            "{:?}",
            finding_ids(&cv, Some("de"))
        );
    }

    #[test]
    fn creative_headings_are_flagged_but_standard_ones_are_not() {
        let creative = "# Jane\njane@example.com\n+49 170 1234567\n\
             ## What I've been up to\n2020 - 2024 building things\n\
             ## Things I'm good at\nRust\n"
            .to_string()
            + &"Filler text to clear the length floor. ".repeat(25);
        let ids = finding_ids(&creative, Some("de"));
        assert!(
            ids.contains(&"ats.no_standard_heading".to_string()),
            "{ids:?}"
        );
        let standard = finding_ids(&good_cv(), Some("de"));
        assert!(standard.is_empty(), "{standard:?}");
    }

    #[test]
    fn a_cv_with_no_years_cannot_prove_tenure() {
        let cv = "# Jane\njane@example.com\n+49 170 1234567\n## Experience\n- Built things\n## Skills\nRust\n".to_string()
            + &"Filler text to clear the length floor. ".repeat(25);
        assert!(
            finding_ids(&cv, Some("de")).contains(&"ats.no_dates".to_string()),
            "{:?}",
            finding_ids(&cv, Some("de"))
        );
    }

    #[test]
    fn a_truncated_export_is_flagged_as_too_short() {
        let ids = finding_ids("# Jane\njane@example.com\n", Some("de"));
        assert!(ids.contains(&"ats.too_short".to_string()), "{ids:?}");
    }
}
