//! Deterministic ATS check - 0 tokens, no AI, same answer every time.
//!
//! Until now "ATS pass" was a single boolean the scoring model emitted next to
//! a one-sentence note. That reads as a measurement but is an opinion: it is
//! not reproducible across runs on identical input, and it never actually
//! looked at the CV that would be uploaded. This module computes it instead.
//!
//! What a real ATS does, and what this mirrors:
//!
//!  1. **Requisition keyword matching.** The posting's own requirement terms
//!     are extracted and looked for in the CV. Terms inside a requirements
//!     block count double, because that is where a recruiter's search filter
//!     comes from.
//!  2. **Parsability.** A CV that a parser mangles loses information before a
//!     human ever reads it - contact details it cannot find, tables it
//!     flattens, section headings it does not recognise.
//!
//! Deliberately NOT modelled: any claim about a specific vendor's algorithm.
//! Taleo, Workday and Greenhouse are closed and differ from each other. The
//! findings here are the ones every parser shares, and each is reported with
//! the reason attached so the user can judge it rather than trust a number.
//!
//! The input is the tailored CV as markdown, which is what the tailoring
//! wizard produces, so every structural signal (tables, images, links,
//! headings) is read from the text itself and nothing has to be threaded
//! through from the UI.

use super::ats_format::parsability_findings;
use super::ats_tokens::{is_stopword, is_technical_shape, mixed_case_terms, tokenize};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// Points available from keyword coverage. The remainder comes from parsability.
const KEYWORD_POINTS: f32 = 60.0;
const FORMAT_POINTS: f32 = 40.0;

/// How many requisition terms to score against. Real recruiter filters are a
/// handful of terms; scoring against every noun in the posting would drown the
/// signal in boilerplate.
const MAX_TERMS: usize = 25;

const PASS_THRESHOLD: u8 = 75;
const RISKY_THRESHOLD: u8 = 50;

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    High,
    Medium,
    Low,
}

impl Severity {
    /// Penalty in points. High findings are the ones that lose information
    /// outright; low ones are worth knowing but rarely decide anything.
    fn penalty(self) -> f32 {
        match self {
            Severity::High => 12.0,
            Severity::Medium => 6.0,
            Severity::Low => 2.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtsFinding {
    /// Stable id so the UI can translate the message instead of showing the
    /// English fallback, and so tests can assert on findings by name.
    pub id: String,
    pub severity: Severity,
    /// English fallback text, always populated.
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeywordCoverage {
    pub matched: Vec<String>,
    pub missing: Vec<String>,
    /// Weighted, not a plain count: a term repeated through the requirements
    /// block counts for more than one mentioned once in the company blurb.
    pub percent: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AtsVerdict {
    Pass,
    Risky,
    Fail,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtsReport {
    /// 0-100. Keyword coverage is worth 60, parsability 40.
    pub score: u8,
    pub verdict: AtsVerdict,
    pub keywords: KeywordCoverage,
    pub findings: Vec<AtsFinding>,
}

// ---------------------------------------------------------------------------
// Requirement zones
// ---------------------------------------------------------------------------

/// Headings that open a requirements block, in the languages Applye's sources
/// publish in. A line is treated as a heading if it is short and matches one of
/// these; everything until the next heading-ish line is weighted double.
fn opens_requirements(line_lower: &str) -> bool {
    const MARKERS: &[&str] = &[
        // English
        "requirement",
        "qualification",
        "what you bring",
        "what we expect",
        "must have",
        "must-have",
        "nice to have",
        "your profile",
        "who you are",
        "skills",
        "you have",
        "we are looking for",
        "what you'll need",
        // German
        "anforderung",
        "dein profil",
        "ihr profil",
        "das bringst du mit",
        "was du mitbringst",
        "qualifikation",
        "kenntnisse",
        "wir erwarten",
        "das solltest du",
    ];
    MARKERS.iter().any(|m| line_lower.contains(m))
}

/// Splits the posting into (text, weight) spans. Requirement blocks and bullet
/// lines weigh double; company boilerplate weighs one.
fn weighted_spans(job_description: &str) -> Vec<(String, f32)> {
    let mut spans = Vec::new();
    let mut in_requirements = false;
    for line in job_description.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let lower = trimmed.to_lowercase();
        // A short line that names a requirements section opens the zone; a
        // short line that does not, closes it (it is the next section heading).
        let looks_like_heading = trimmed.len() <= 60
            && !trimmed.starts_with(['-', '*', '•', '·'])
            && !trimmed.ends_with(['.', ',', ';']);
        if looks_like_heading {
            in_requirements = opens_requirements(&lower);
        }
        // Only the requirements zone is weighted up. A bullet elsewhere is
        // just as likely to be a perk ("- Free coffee") as a requirement, and
        // weighting all bullets was enough to pull benefits into the terms.
        let weight = if in_requirements { 2.0 } else { 1.0 };
        spans.push((trimmed.to_string(), weight));
    }
    spans
}

// ---------------------------------------------------------------------------
// Term extraction
// ---------------------------------------------------------------------------

/// The requisition terms this check scores against, strongest first.
fn extract_terms(job_description: &str) -> Vec<(String, f32)> {
    let mixed = mixed_case_terms(job_description);
    let mut weights: HashMap<String, f32> = HashMap::new();

    for (line, weight) in weighted_spans(job_description) {
        let tokens = tokenize(&line);
        // Unigrams.
        for token in &tokens {
            if token.len() < 2 || is_stopword(token) || token.chars().all(|c| c.is_ascii_digit()) {
                continue;
            }
            *weights.entry(token.clone()).or_insert(0.0) += weight;
        }
        // Bigrams of two content words ("machine learning", "react native").
        for pair in tokens.windows(2) {
            if pair.iter().any(|t| t.len() < 2 || is_stopword(t)) {
                continue;
            }
            let bigram = format!("{} {}", pair[0], pair[1]);
            *weights.entry(bigram).or_insert(0.0) += weight * 0.75;
        }
    }

    // Keep what the requirements block actually asked for (weight 2.0 or more)
    // plus anything technical-looking wherever it appeared. Prose from the
    // company blurb weighs 1.0 and drops out.
    weights.retain(|term, w| *w >= 2.0 || is_technical_shape(term, &mixed));

    let mut terms: Vec<(String, f32)> = weights
        .into_iter()
        .map(|(term, w)| {
            let boosted = if is_technical_shape(&term, &mixed) {
                w * 1.5
            } else {
                w
            };
            (term, boosted)
        })
        .collect();

    // Deterministic order: weight desc, then alphabetical so equal weights
    // never depend on hash iteration order.
    terms.sort_by(|a, b| {
        b.1.partial_cmp(&a.1)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.0.cmp(&b.0))
    });
    terms.truncate(MAX_TERMS);
    terms
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/// Unigrams and bigrams present in the CV, for whole-term matching. Building
/// sets rather than running substring searches is what stops "java" matching
/// inside "javascript".
fn cv_term_sets(cv_text: &str) -> (HashSet<String>, HashSet<String>) {
    let tokens = tokenize(cv_text);
    let unigrams: HashSet<String> = tokens.iter().cloned().collect();
    let bigrams: HashSet<String> = tokens
        .windows(2)
        .map(|p| format!("{} {}", p[0], p[1]))
        .collect();
    (unigrams, bigrams)
}

fn cv_contains(term: &str, unigrams: &HashSet<String>, bigrams: &HashSet<String>) -> bool {
    if term.contains(' ') {
        bigrams.contains(term)
    } else {
        unigrams.contains(term)
    }
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

/// Runs the full deterministic check. Pure: same inputs, same report, always.
pub fn ats_check(cv_text: &str, job_description: &str, region: Option<&str>) -> AtsReport {
    let terms = extract_terms(job_description);
    let (unigrams, bigrams) = cv_term_sets(cv_text);

    let mut matched = Vec::new();
    let mut missing = Vec::new();
    let mut total_weight = 0.0f32;
    let mut matched_weight = 0.0f32;
    for (term, weight) in &terms {
        total_weight += weight;
        if cv_contains(term, &unigrams, &bigrams) {
            matched_weight += weight;
            matched.push(term.clone());
        } else {
            missing.push(term.clone());
        }
    }

    // A posting with no extractable requirements (an empty or one-line paste)
    // must not read as 0% coverage - there is nothing to cover. Treat the
    // keyword half as neutral and let parsability decide.
    let coverage = if total_weight > 0.0 {
        matched_weight / total_weight
    } else {
        1.0
    };

    let findings = parsability_findings(cv_text, region);
    let penalty: f32 = findings.iter().map(|f| f.severity.penalty()).sum();
    let format_score = (FORMAT_POINTS - penalty).max(0.0);

    let score = (coverage * KEYWORD_POINTS + format_score)
        .round()
        .clamp(0.0, 100.0) as u8;
    let verdict = if score >= PASS_THRESHOLD {
        AtsVerdict::Pass
    } else if score >= RISKY_THRESHOLD {
        AtsVerdict::Risky
    } else {
        AtsVerdict::Fail
    };

    AtsReport {
        score,
        verdict,
        keywords: KeywordCoverage {
            matched,
            missing,
            percent: (coverage * 100.0).round() as u8,
        },
        findings,
    }
}

/// Frontend entry point. Deliberately takes plain text rather than a job id:
/// the check is pure, touches no database, and can be re-run on an edited CV
/// without persisting anything.
#[tauri::command]
pub fn ats_check_run(
    cv_text: String,
    job_description: String,
    region: Option<String>,
) -> AtsReport {
    ats_check(&cv_text, &job_description, region.as_deref())
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// A CV that should do well: standard headings, contact details, dates, and
    /// the posting's own vocabulary.
    pub(crate) fn good_cv() -> String {
        format!(
            "# Jane Developer\n\
             jane.developer@example.com | +49 170 1234567 | Berlin\n\n\
             ## Summary\n\
             Senior backend engineer with deep Kubernetes and PostgreSQL experience.\n\n\
             ## Experience\n\
             ### Senior Backend Engineer, Acme GmbH (2021 - 2026)\n\
             - Built Rust services deployed on Kubernetes across three regions.\n\
             - Owned the PostgreSQL schema and its migrations.\n\
             - Ran the Terraform estate and the CI/CD pipelines.\n\n\
             ### Backend Engineer, Beta AG (2018 - 2021)\n\
             - Wrote Python data pipelines and moved them onto AWS.\n\n\
             ## Education\n\
             BSc Computer Science, TU Berlin (2014 - 2018)\n\n\
             ## Skills\n\
             Rust, Python, Kubernetes, PostgreSQL, Terraform, AWS, CI/CD\n\
             {}",
            "Additional detail to clear the minimum-length check. ".repeat(12)
        )
    }

    fn job_description() -> &'static str {
        "About Acme\n\
         We are a fast growing company and we love what we do.\n\n\
         Requirements\n\
         - Strong Rust experience in production\n\
         - Deep Kubernetes knowledge\n\
         - PostgreSQL and schema design\n\
         - Terraform for infrastructure\n\
         - Experience with CI/CD pipelines\n\n\
         Benefits\n\
         - Free coffee and a nice office"
    }

    #[test]
    fn requirements_terms_outrank_company_boilerplate() {
        let terms = extract_terms(job_description());
        let names: Vec<&str> = terms.iter().map(|(t, _)| t.as_str()).collect();
        assert!(names.contains(&"rust"), "{names:?}");
        assert!(names.contains(&"kubernetes"), "{names:?}");
        assert!(names.contains(&"postgresql"), "{names:?}");
        // "coffee" appears once, outside the requirements block, and is not
        // technical - it must not make the cut.
        assert!(!names.contains(&"coffee"), "{names:?}");
    }

    #[test]
    fn term_order_is_deterministic_across_runs() {
        let first = extract_terms(job_description());
        for _ in 0..5 {
            assert_eq!(first, extract_terms(job_description()));
        }
    }

    #[test]
    fn a_matching_cv_passes_with_high_coverage() {
        let report = ats_check(&good_cv(), job_description(), Some("de"));
        assert_eq!(report.verdict, AtsVerdict::Pass, "{report:?}");
        assert!(report.keywords.percent >= 70, "{:?}", report.keywords);
        assert!(report.findings.is_empty(), "{:?}", report.findings);
    }

    #[test]
    fn an_unrelated_cv_fails_on_coverage_alone() {
        let cv = good_cv()
            .replace("Kubernetes", "Photoshop")
            .replace("PostgreSQL", "Illustrator")
            .replace("Terraform", "InDesign")
            .replace("Rust", "Lightroom")
            .replace("CI/CD", "Colour grading");
        let report = ats_check(&cv, job_description(), Some("de"));
        assert!(report.keywords.percent < 40, "{:?}", report.keywords);
        assert_ne!(report.verdict, AtsVerdict::Pass);
    }

    #[test]
    fn whole_word_matching_does_not_count_java_inside_javascript() {
        let cv = "## Skills\nJavaScript, TypeScript\njane@example.com\n2020";
        let (uni, bi) = cv_term_sets(cv);
        assert!(cv_contains("javascript", &uni, &bi));
        assert!(!cv_contains("java", &uni, &bi));
    }

    #[test]
    fn an_empty_posting_does_not_read_as_zero_coverage() {
        let report = ats_check(&good_cv(), "", Some("de"));
        assert_eq!(report.keywords.percent, 100);
        assert_eq!(report.verdict, AtsVerdict::Pass);
    }

    #[test]
    fn the_score_is_reproducible() {
        let first = ats_check(&good_cv(), job_description(), Some("de"));
        for _ in 0..5 {
            let again = ats_check(&good_cv(), job_description(), Some("de"));
            assert_eq!(first.score, again.score);
            assert_eq!(first.keywords.matched, again.keywords.matched);
        }
    }

    #[test]
    fn german_requirement_headings_are_recognised() {
        let jd = "Über uns\nWir sind ein Unternehmen.\n\n\
                  Dein Profil\n- Fundierte Kenntnisse in Kubernetes\n\
                  - Erfahrung mit PostgreSQL\n- Sehr gute Rust Kenntnisse\n";
        let names: Vec<String> = extract_terms(jd).into_iter().map(|(t, _)| t).collect();
        assert!(names.contains(&"kubernetes".to_string()), "{names:?}");
        assert!(names.contains(&"postgresql".to_string()), "{names:?}");
    }

    #[test]
    fn findings_cost_points_against_the_format_half_only() {
        let clean = ats_check(&good_cv(), job_description(), Some("de"));
        // Same CV, same coverage, but with a photo in an anglo market.
        let with_photo = good_cv().replace("# Jane Developer", "# Jane Developer\n![p](me.png)");
        let flagged = ats_check(&with_photo, job_description(), Some("us"));
        assert_eq!(clean.keywords.percent, flagged.keywords.percent);
        assert_eq!(clean.score - flagged.score, 12);
    }
}
