// Deterministic company and title extraction from a pasted job description.
// 0 tokens, no AI. Conservative by design: a candidate that does not look like a
// real company name or a real job title is rejected rather than guessed, because
// an empty field now renders as a placeholder and can be filled deliberately,
// while a wrong value is presented as fact and (until the caller re-parses) has
// no way back out.

/// Labels that introduce a company name on its own line, e.g. `Company: Acme` or
/// `Company name - Acme`.
const COMPANY_LABELS: &[&str] = &[
    "company name",
    "company",
    "employer",
    "organization",
    "organisation",
    "org",
    "hiring company",
];

/// Labels that introduce a job title on its own line.
const TITLE_LABELS: &[&str] = &["job title", "position", "role", "title", "vacancy"];

/// Characters a JD may put between a label and its value. The two dashes are
/// written as escapes on purpose: the repository forbids en and em dashes in
/// authored output, and real postings contain both constantly, so they have to
/// be matched without being typed.
const LABEL_SEPARATORS: &[char] = &[':', '-', '\u{2013}', '\u{2014}', '|', '='];

/// Words that can never be a company name on their own - used to reject
/// sentence fragments like "We are ..." or "The role is ...".
const COMPANY_STOPWORDS: &[&str] = &[
    "we",
    "our",
    "the",
    "this",
    "that",
    "you",
    "your",
    "they",
    "it",
    "as",
    "at",
    "in",
    "for",
    "with",
    "position",
    "role",
    "job",
    "about",
    "who",
    "what",
    "here",
    "join",
    "description",
    "responsibilities",
    "requirements",
    "overview",
    "summary",
    "a",
    "an",
];

/// Section headings that a JD puts on their own line. Before this list existed
/// the title fallback took the first short line in the document, which is how a
/// posting that opened with "The Purpose:" ended up titled "The Purpose:".
const SECTION_HEADINGS: &[&str] = &[
    "the purpose",
    "purpose",
    "about us",
    "about the company",
    "about the role",
    "about",
    "overview",
    "company overview",
    "job description",
    "description",
    "summary",
    "job summary",
    "responsibilities",
    "key responsibilities",
    "what you will do",
    "what you'll do",
    "requirements",
    "qualifications",
    "who we are",
    "who you are",
    "what we offer",
    "benefits",
    "perks",
    "our mission",
    "the opportunity",
    "the team",
    "why join us",
    "how to apply",
];

/// Words that make a line plausible as a job title. A JD line that carries none
/// of them is almost never the role, and the cost of being wrong here is a bogus
/// title on the card and in every generated document.
const ROLE_WORDS: &[&str] = &[
    "engineer",
    "developer",
    "programmer",
    "architect",
    "manager",
    "designer",
    "analyst",
    "scientist",
    "consultant",
    "specialist",
    "administrator",
    "lead",
    "head",
    "director",
    "officer",
    "president",
    "founder",
    "intern",
    "trainee",
    "apprentice",
    "assistant",
    "associate",
    "coordinator",
    "supervisor",
    "technician",
    "researcher",
    "strategist",
    "marketer",
    "recruiter",
    "accountant",
    "auditor",
    "lawyer",
    "counsel",
    "nurse",
    "teacher",
    "writer",
    "editor",
    "producer",
    "operator",
    "planner",
    "buyer",
    "seller",
    "representative",
    "agent",
    "advisor",
    "adviser",
    "expert",
    "owner",
    "master",
    "chief",
    "vp",
    "cto",
    "ceo",
    "coo",
    "cfo",
    "devops",
    "sre",
    "qa",
    "frontend",
    "front-end",
    "backend",
    "back-end",
    "fullstack",
    "full-stack",
    "mobile",
    "android",
    "ios",
    "web",
    "data",
    "product",
    "project",
    "sales",
    "support",
    "security",
];

/// Connector words allowed inside a multi-word company name ("Ben & Jerry's",
/// "Bank of America") without breaking the proper-noun run.
fn is_company_connector(word: &str) -> bool {
    matches!(
        word.to_ascii_lowercase().as_str(),
        "and" | "of" | "the" | "&" | "for"
    )
}

fn clean_company(raw: &str) -> String {
    raw.trim()
        .trim_matches(|c: char| {
            c == '"'
                || c == '\''
                || c == ','
                || c == '.'
                || c == ':'
                || c == '-'
                || c == '('
                || c == ')'
                || c == '|'
        })
        .trim()
        .to_string()
}

fn is_plausible_company(candidate: &str) -> bool {
    let c = candidate.trim();
    if c.len() < 2 || c.len() > 60 {
        return false;
    }
    let words: Vec<&str> = c.split_whitespace().collect();
    if words.is_empty() || words.len() > 6 {
        return false;
    }
    let first = words[0];
    let Some(fc) = first.chars().next() else {
        return false;
    };
    if !fc.is_alphabetic() || !fc.is_uppercase() {
        return false;
    }
    if COMPANY_STOPWORDS.contains(&first.to_lowercase().as_str()) {
        return false;
    }
    true
}

/// Leading run of Capitalized words (with connectors), e.g. from "About Bjak"
/// or "Join Acme Corp today" -> "Bjak" / "Acme Corp".
fn leading_proper_noun(s: &str) -> String {
    let mut out: Vec<&str> = Vec::new();
    for word in s.split_whitespace() {
        let fc = word.chars().next().unwrap_or(' ');
        if fc.is_uppercase() || (is_company_connector(word) && !out.is_empty()) {
            out.push(word);
            if out.len() >= 6 {
                break;
            }
        } else {
            break;
        }
    }
    clean_company(&out.join(" "))
}

/// "<Company> is a/an/the/one of ..." - the most common self-description.
fn company_before_is(sentence: &str) -> Option<String> {
    let words: Vec<&str> = sentence.split_whitespace().collect();
    for i in 1..words.len() {
        if !words[i].eq_ignore_ascii_case("is") {
            continue;
        }
        let next = words.get(i + 1).map(|w| w.to_ascii_lowercase());
        let marker = matches!(next.as_deref(), Some("a") | Some("an") | Some("the"))
            || (next.as_deref() == Some("one")
                && words
                    .get(i + 2)
                    .map(|w| w.eq_ignore_ascii_case("of"))
                    .unwrap_or(false));
        if marker && i <= 6 {
            let cand = leading_proper_noun(&words[..i].join(" "));
            if is_plausible_company(&cand) {
                return Some(cand);
            }
        }
    }
    None
}

/// The value of a `<label><separator><value>` line, when the line opens with one
/// of `labels`. Matching is case-insensitive and the separator may be any of
/// `LABEL_SEPARATORS`, which is what lets `Company name - Elbrus` through where
/// only `Company: Elbrus` used to work.
fn labelled_value(line: &str, labels: &[&str]) -> Option<String> {
    let trimmed = line.trim();
    let lower = trimmed.to_lowercase();
    for label in labels {
        if !lower.starts_with(label) {
            continue;
        }
        let rest = &trimmed[label.len()..];
        let mut chars = rest.chars();
        let Some(sep) = chars.next() else {
            continue;
        };
        // A separator directly after the label, or after the spaces that a
        // "Company name - Acme" style line puts around it.
        let (sep, rest) = if sep.is_whitespace() {
            let rest = rest.trim_start();
            match rest.chars().next() {
                Some(c) => (c, rest),
                None => continue,
            }
        } else {
            (sep, rest)
        };
        if !LABEL_SEPARATORS.contains(&sep) {
            continue;
        }
        let value = rest[sep.len_utf8()..].trim();
        if !value.is_empty() {
            return Some(value.to_string());
        }
    }
    None
}

/// True when a line is a section heading rather than a job title. Trailing
/// colons are the strongest signal and are treated as one on their own: a real
/// title is not written "Senior Engineer:".
fn is_section_heading(line: &str) -> bool {
    let t = line.trim();
    if t.ends_with(':') {
        return true;
    }
    let normalized = t
        .trim_matches(|c: char| !c.is_alphanumeric())
        .to_lowercase();
    SECTION_HEADINGS.contains(&normalized.as_str())
}

/// True when a line contains a word that job titles are made of. Checked against
/// word boundaries, so "leadership" does not qualify on account of "lead".
fn has_role_word(line: &str) -> bool {
    line.split(|c: char| !(c.is_alphanumeric() || c == '-'))
        .filter(|w| !w.is_empty())
        .any(|word| {
            let w = word.to_lowercase();
            ROLE_WORDS.contains(&w.as_str())
        })
}

/// The job title, or nothing. Tries a labelled line anywhere in the document,
/// then the opening lines of the body - but only lines that look like a role
/// rather than a heading. Returning `None` is a valid answer: the caller renders
/// a placeholder for it, which is better than a section heading presented as the
/// job title.
///
/// The labelled pass reads every line. A label is an explicit statement of what
/// the value is, and postings routinely put the block carrying it after the
/// body - the reported one had its company on the last line of the document.
/// The positional pass below stays near the top, because there position is the
/// only evidence there is.
pub fn extract_title(text: &str) -> Option<String> {
    for line in text.lines() {
        if let Some(v) = labelled_value(line, TITLE_LABELS) {
            return Some(v);
        }
    }
    text.lines()
        .take(20)
        .map(|l| l.trim())
        .find(|l| !l.is_empty() && l.len() < 80 && !is_section_heading(l) && has_role_word(l))
        .map(|l| l.to_string())
}

/// Deterministic company extraction from the JD body (0 tokens, no AI).
/// Tries, in order: an "About X" / "Join X" heading, then the classic
/// "<Company> is a ..." opening sentence. Conservative: a fragment that does
/// not look like a proper company name is rejected rather than guessed.
fn extract_company_from_body(text: &str) -> Option<String> {
    let head: String = text.chars().take(1500).collect();

    for line in head.lines().take(40) {
        let t = line.trim();
        if t.len() < 2 {
            continue;
        }
        for prefix in ["about ", "join ", "welcome to "] {
            if t.len() > prefix.len()
                && t.get(..prefix.len())
                    .map(|p| p.eq_ignore_ascii_case(prefix))
                    .unwrap_or(false)
            {
                let cand = leading_proper_noun(&t[prefix.len()..]);
                if is_plausible_company(&cand) {
                    return Some(cand);
                }
            }
        }
    }

    for sentence in head.split(['.', '\n', '!']) {
        if let Some(company) = company_before_is(sentence.trim()) {
            return Some(company);
        }
    }
    None
}

/// The company, or nothing. A labelled line anywhere in the document wins over
/// anything inferred from the body, for the reason given on `extract_title`:
/// postings put the "Location - X / Company name - Y" block at the end as often
/// as at the top, and a label states outright what a heuristic can only guess.
pub fn extract_company(text: &str) -> Option<String> {
    for line in text.lines() {
        if let Some(v) = labelled_value(line, COMPANY_LABELS) {
            return Some(clean_company(&v)).filter(|c| !c.is_empty());
        }
    }
    extract_company_from_body(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The posting from the bug report, trimmed to the part that matters.
    const ELBRUS_JD: &str = "Company name - Elbrus\n\
At PPRO, our mission is to simplify access to local payment methods and our \
vision is to enable the sale of goods and services to anyone in the world using \
their preferred way to pay.\n\n\
The Purpose:\n\
You will build payment integrations as a Backend Engineer.";

    /// A real posting, trimmed. Its `Company name - Elbrus` line is the last
    /// one in the document, which is where the first fix's line window - the
    /// first 30 lines - could not see it. Kept as a fixture rather than inline
    /// because its length is the entire point of the test.
    const TRAILING_LABEL_JD: &str = include_str!("fixtures/trailing-label-jd.txt");

    #[test]
    fn finds_a_company_labelled_at_the_very_end_of_a_long_posting() {
        assert!(
            TRAILING_LABEL_JD.lines().count() > 40,
            "fixture must be long enough to defeat a short scan window"
        );
        assert_eq!(
            extract_company(TRAILING_LABEL_JD).as_deref(),
            Some("Elbrus")
        );
    }

    #[test]
    fn finds_a_company_behind_a_hyphen_label() {
        assert_eq!(extract_company(ELBRUS_JD).as_deref(), Some("Elbrus"));
    }

    #[test]
    fn does_not_title_the_job_after_a_section_heading() {
        let title = extract_title(ELBRUS_JD);
        assert_ne!(title.as_deref(), Some("The Purpose:"));
        assert_ne!(title.as_deref(), Some("Company name - Elbrus"));
    }

    #[test]
    fn accepts_every_supported_separator() {
        for sep in [":", "-", "\u{2013}", "\u{2014}", "|", "="] {
            let jd = format!("Company {sep} Acme Corp\nWe build things.");
            assert_eq!(
                extract_company(&jd).as_deref(),
                Some("Acme Corp"),
                "separator {sep} was not accepted"
            );
        }
    }

    #[test]
    fn accepts_every_supported_company_label() {
        for label in ["Company", "Company name", "Employer", "Organization", "Org"] {
            let jd = format!("{label}: Acme Corp\nWe build things.");
            assert_eq!(
                extract_company(&jd).as_deref(),
                Some("Acme Corp"),
                "label {label} was not accepted"
            );
        }
    }

    #[test]
    fn a_labelled_company_beats_the_body() {
        let jd = "Company: Elbrus\nAbout Contoso\nContoso is a large firm.";
        assert_eq!(extract_company(jd).as_deref(), Some("Elbrus"));
    }

    #[test]
    fn still_reads_an_about_heading() {
        let jd = "About Bjak\nWe are hiring.";
        assert_eq!(extract_company(jd).as_deref(), Some("Bjak"));
    }

    #[test]
    fn still_reads_a_self_description_sentence() {
        let jd = "Acme Corp is a payments company based in Berlin.";
        assert_eq!(extract_company(jd).as_deref(), Some("Acme Corp"));
    }

    #[test]
    fn reports_no_company_rather_than_a_fragment() {
        let jd = "We are looking for someone great.\nYou will do many things.";
        assert_eq!(extract_company(jd), None);
    }

    #[test]
    fn reads_a_labelled_title() {
        let jd = "Position: Senior Backend Engineer\nWe are hiring.";
        assert_eq!(
            extract_title(jd).as_deref(),
            Some("Senior Backend Engineer")
        );
    }

    #[test]
    fn reads_a_labelled_title_behind_a_dash() {
        let jd = "Job title \u{2014} Staff Data Scientist\nWe are hiring.";
        assert_eq!(extract_title(jd).as_deref(), Some("Staff Data Scientist"));
    }

    #[test]
    fn takes_a_role_line_from_the_body_when_there_is_no_label() {
        let jd = "The Purpose:\nSenior Frontend Engineer\nYou will build UIs.";
        assert_eq!(
            extract_title(jd).as_deref(),
            Some("Senior Frontend Engineer")
        );
    }

    #[test]
    fn rejects_every_known_section_heading_as_a_title() {
        for heading in [
            "The Purpose:",
            "About us",
            "Responsibilities",
            "What we offer",
            "Who we are",
        ] {
            let jd = format!("{heading}\nYou will do things here.");
            assert_eq!(
                extract_title(&jd),
                None,
                "heading {heading} was accepted as a title"
            );
        }
    }

    #[test]
    fn reports_no_title_rather_than_a_body_line() {
        let jd = "We are hiring.\nYou will do many things.\nApply today.";
        assert_eq!(extract_title(jd), None);
    }

    // Carried over verbatim from `scoring.rs`, where this extraction used to
    // live. They passed before the rules widened and must still pass after.

    #[test]
    fn company_from_is_a_sentence() {
        let jd = "Newfire Global Partners is a leading technology firm that builds software.";
        assert_eq!(
            extract_company(jd).as_deref(),
            Some("Newfire Global Partners")
        );
    }

    #[test]
    fn company_from_about_heading() {
        let jd = "Senior Engineer\n\nAbout Bjak\n\nWe build insurance tech.";
        assert_eq!(extract_company(jd).as_deref(), Some("Bjak"));
    }

    #[test]
    fn company_from_join_heading() {
        let jd = "Join Acme Corp today and help us grow.";
        assert_eq!(extract_company(jd).as_deref(), Some("Acme Corp"));
    }

    #[test]
    fn explicit_company_header_still_wins() {
        let jd = "Company: Contoso GmbH\nRole: Backend Engineer";
        assert_eq!(extract_company(jd).as_deref(), Some("Contoso GmbH"));
    }

    #[test]
    fn sentence_fragment_is_rejected() {
        // "We are a ..." must not be mistaken for a company name.
        let jd = "We are a fully funded company founded by serial entrepreneurs.";
        assert_eq!(extract_company(jd), None);
    }

    #[test]
    fn leadership_does_not_count_as_the_word_lead() {
        let jd = "Strong leadership skills required.\nGreat teamwork too.";
        assert_eq!(extract_title(jd), None);
    }
}
