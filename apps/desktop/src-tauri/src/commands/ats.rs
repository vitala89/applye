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
// Text normalisation
// ---------------------------------------------------------------------------

/// Lowercases and splits into tokens, keeping the characters that carry meaning
/// in technology names: `c++`, `.net`, `node.js`, `ci/cd`, `f#` all survive.
/// Everything else becomes a separator.
fn tokenize(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        if ch.is_alphanumeric() || matches!(ch, '+' | '#' | '.' | '/' | '-') {
            current.push(ch.to_ascii_lowercase());
        } else if !current.is_empty() {
            out.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        out.push(current);
    }
    // Trim separators that ended up on an edge ("node.js," -> "node.js",
    // "-remote" -> "remote") without touching interior ones.
    out.into_iter()
        .map(|t| t.trim_matches(|c| matches!(c, '.' | '/' | '-')).to_string())
        .filter(|t| !t.is_empty())
        .collect()
}

/// Words that carry no matching signal. English and German are covered because
/// those are the markets Applye ships sources for; an unlisted language simply
/// keeps more filler terms, which lowers precision but never breaks the check.
fn is_stopword(word: &str) -> bool {
    const STOP: &[&str] = &[
        // English structural
        "a",
        "an",
        "the",
        "and",
        "or",
        "but",
        "if",
        "then",
        "than",
        "as",
        "at",
        "by",
        "for",
        "from",
        "in",
        "into",
        "of",
        "on",
        "onto",
        "to",
        "with",
        "within",
        "without",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "can",
        "could",
        "should",
        "may",
        "might",
        "must",
        "you",
        "your",
        "yours",
        "we",
        "our",
        "ours",
        "us",
        "they",
        "their",
        "it",
        "its",
        "this",
        "that",
        "these",
        "those",
        "there",
        "here",
        "who",
        "what",
        "which",
        "when",
        "where",
        "how",
        "all",
        "any",
        "both",
        "each",
        "more",
        "most",
        "other",
        "some",
        "such",
        "not",
        "no",
        "nor",
        "only",
        "own",
        "same",
        "so",
        "too",
        "very",
        "up",
        "out",
        "about",
        "over",
        "under",
        "also",
        "well",
        "across",
        // English job-ad filler: present in every posting, so worthless as a
        // discriminator even though it is not a grammatical stopword.
        "job",
        "jobs",
        "role",
        "roles",
        "work",
        "working",
        "team",
        "teams",
        "company",
        "companies",
        "position",
        "candidate",
        "candidates",
        "applicant",
        "experience",
        "experienced",
        "year",
        "years",
        "skill",
        "skills",
        "ability",
        "able",
        "strong",
        "good",
        "excellent",
        "great",
        "new",
        "help",
        "join",
        "looking",
        "seeking",
        "required",
        "require",
        "requirements",
        "responsibilities",
        "qualifications",
        "plus",
        "benefits",
        "offer",
        "us",
        "you'll",
        "we're",
        "please",
        "apply",
        "application",
        "salary",
        "office",
        "remote",
        "hybrid",
        "full",
        "time",
        "part",
        "day",
        "days",
        "week",
        "month",
        "environment",
        "opportunity",
        "opportunities",
        "including",
        "etc",
        // Adjectives requirement bullets are built from. They pass the
        // requirements-zone weight but describe the ask rather than name it:
        // in "Deep Kubernetes knowledge" only "kubernetes" is the requirement.
        "deep",
        "knowledge",
        "solid",
        "proven",
        "hands",
        "on",
        "demonstrable",
        "familiarity",
        "familiar",
        "understanding",
        "expertise",
        "background",
        // German structural
        "der",
        "die",
        "das",
        "den",
        "dem",
        "des",
        "ein",
        "eine",
        "einen",
        "einem",
        "einer",
        "eines",
        "und",
        "oder",
        "aber",
        "wenn",
        "als",
        "an",
        "auf",
        "aus",
        "bei",
        "bis",
        "durch",
        "für",
        "fuer",
        "gegen",
        "im",
        "in",
        "mit",
        "nach",
        "ohne",
        "seit",
        "über",
        "ueber",
        "um",
        "von",
        "vor",
        "zu",
        "zum",
        "zur",
        "ist",
        "sind",
        "war",
        "waren",
        "sein",
        "haben",
        "hat",
        "wird",
        "werden",
        "kann",
        "können",
        "koennen",
        "soll",
        "sollen",
        "du",
        "dich",
        "dir",
        "dein",
        "deine",
        "sie",
        "ihr",
        "ihre",
        "wir",
        "uns",
        "unser",
        "unsere",
        "nicht",
        "auch",
        "sehr",
        "mehr",
        "alle",
        "was",
        "wie",
        "wo",
        "wer",
        // German job-ad filler
        "stelle",
        "stellen",
        "aufgaben",
        "profil",
        "anforderungen",
        "kenntnisse",
        "erfahrung",
        "jahre",
        "jahren",
        "bieten",
        "wir",
        "team",
        "unternehmen",
        "bewerbung",
        "gerne",
        "gute",
        "guten",
        "sowie",
    ];
    STOP.contains(&word)
}

/// Terms that look technical rather than prosaic get a weight bonus, because a
/// recruiter's filter is far likelier to be "kubernetes" than "communication".
/// Signals: a digit, a symbol that only appears in tech names, or the term
/// having internal capitals in the source text (PostgreSQL, JavaScript).
fn is_technical_shape(term: &str, mixed_case: &HashSet<String>) -> bool {
    term.chars().any(|c| c.is_ascii_digit())
        || term.contains('+')
        || term.contains('#')
        || term.contains('.')
        || term.contains('/')
        || mixed_case.contains(term)
}

/// Terms written with internal capitals somewhere in the source, lowercased.
fn mixed_case_terms(text: &str) -> HashSet<String> {
    let mut out = HashSet::new();
    for raw in text.split(|c: char| !(c.is_alphanumeric() || matches!(c, '+' | '#' | '.' | '/'))) {
        let trimmed = raw.trim_matches(|c| matches!(c, '.' | '/'));
        if trimmed.len() < 2 {
            continue;
        }
        let has_upper_inside = trimmed.chars().skip(1).any(|c| c.is_uppercase());
        if has_upper_inside {
            out.insert(trimmed.to_ascii_lowercase());
        }
    }
    out
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
// Parsability findings
// ---------------------------------------------------------------------------

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

fn parsability_findings(cv_markdown: &str, region: Option<&str>) -> Vec<AtsFinding> {
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
mod tests {
    use super::*;

    /// A CV that should do well: standard headings, contact details, dates, and
    /// the posting's own vocabulary.
    fn good_cv() -> String {
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
    fn tokenizer_keeps_technology_names_intact() {
        let tokens = tokenize("We use C++, .NET, Node.js and CI/CD daily.");
        assert!(tokens.contains(&"c++".to_string()), "{tokens:?}");
        assert!(tokens.contains(&"net".to_string()), "{tokens:?}");
        assert!(tokens.contains(&"node.js".to_string()), "{tokens:?}");
        assert!(tokens.contains(&"ci/cd".to_string()), "{tokens:?}");
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
    fn missing_contact_details_are_high_severity() {
        let cv = "## Experience\n### Engineer (2020 - 2024)\n- Did the work.\n";
        let ids: Vec<String> = parsability_findings(cv, Some("de"))
            .into_iter()
            .map(|f| f.id)
            .collect();
        assert!(ids.contains(&"ats.no_email".to_string()), "{ids:?}");
        assert!(ids.contains(&"ats.no_phone".to_string()), "{ids:?}");
    }

    #[test]
    fn a_photo_is_flagged_in_anglo_markets_and_accepted_in_german_ones() {
        let cv = good_cv().replace("# Jane Developer", "# Jane Developer\n![photo](me.png)");
        let anglo: Vec<String> = parsability_findings(&cv, Some("us"))
            .into_iter()
            .map(|f| f.id)
            .collect();
        assert!(
            anglo.contains(&"ats.photo_in_anglo_market".to_string()),
            "{anglo:?}"
        );
        let german: Vec<String> = parsability_findings(&cv, Some("de"))
            .into_iter()
            .map(|f| f.id)
            .collect();
        assert!(
            !german.contains(&"ats.photo_in_anglo_market".to_string()),
            "{german:?}"
        );
    }

    #[test]
    fn a_table_layout_is_flagged() {
        let cv = good_cv() + "\n| Skill | Level |\n| --- | --- |\n| Rust | Expert |\n";
        let ids: Vec<String> = parsability_findings(&cv, Some("de"))
            .into_iter()
            .map(|f| f.id)
            .collect();
        assert!(ids.contains(&"ats.table_layout".to_string()), "{ids:?}");
    }

    #[test]
    fn creative_headings_are_flagged_but_standard_ones_are_not() {
        let creative = "# Jane\njane@example.com\n+49 170 1234567\n\
             ## What I've been up to\n2020 - 2024 building things\n\
             ## Things I'm good at\nRust\n"
            .to_string()
            + &"Filler text to clear the length floor. ".repeat(25);
        let ids: Vec<String> = parsability_findings(&creative, Some("de"))
            .into_iter()
            .map(|f| f.id)
            .collect();
        assert!(
            ids.contains(&"ats.no_standard_heading".to_string()),
            "{ids:?}"
        );
        let standard: Vec<String> = parsability_findings(&good_cv(), Some("de"))
            .into_iter()
            .map(|f| f.id)
            .collect();
        assert!(standard.is_empty(), "{standard:?}");
    }

    #[test]
    fn a_cv_with_no_years_cannot_prove_tenure() {
        let cv = "# Jane\njane@example.com\n+49 170 1234567\n## Experience\n- Built things\n## Skills\nRust\n".to_string()
            + &"Filler text to clear the length floor. ".repeat(25);
        let ids: Vec<String> = parsability_findings(&cv, Some("de"))
            .into_iter()
            .map(|f| f.id)
            .collect();
        assert!(ids.contains(&"ats.no_dates".to_string()), "{ids:?}");
    }

    #[test]
    fn a_truncated_export_is_flagged_as_too_short() {
        let ids: Vec<String> = parsability_findings("# Jane\njane@example.com\n", Some("de"))
            .into_iter()
            .map(|f| f.id)
            .collect();
        assert!(ids.contains(&"ats.too_short".to_string()), "{ids:?}");
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
