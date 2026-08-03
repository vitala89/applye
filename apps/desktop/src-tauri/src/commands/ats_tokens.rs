// Text normalisation for the ATS keyword check (ROADMAP §9).
//
// Split out of `ats.rs`, which was over its size budget largely because of the
// stopword table below. This is the vocabulary layer: how a posting or a CV is
// cut into terms, which of those terms carry no signal, and which look
// technical enough to be worth weighting. It decides nothing about a score.
//
// Pure and allocation-only - no I/O, no configuration, no AI.

use std::collections::HashSet;

/// Lowercases and splits into tokens, keeping the characters that carry meaning
/// in technology names: `c++`, `.net`, `node.js`, `ci/cd`, `f#` all survive.
/// Everything else becomes a separator.
pub(super) fn tokenize(text: &str) -> Vec<String> {
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
pub(super) fn is_stopword(word: &str) -> bool {
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
pub(super) fn is_technical_shape(term: &str, mixed_case: &HashSet<String>) -> bool {
    term.chars().any(|c| c.is_ascii_digit())
        || term.contains('+')
        || term.contains('#')
        || term.contains('.')
        || term.contains('/')
        || mixed_case.contains(term)
}

/// Terms written with internal capitals somewhere in the source, lowercased.
pub(super) fn mixed_case_terms(text: &str) -> HashSet<String> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokenizer_keeps_technology_names_intact() {
        let tokens = tokenize("We use C++, .NET, Node.js and CI/CD daily.");
        assert!(tokens.contains(&"c++".to_string()), "{tokens:?}");
        assert!(tokens.contains(&"net".to_string()), "{tokens:?}");
        assert!(tokens.contains(&"node.js".to_string()), "{tokens:?}");
        assert!(tokens.contains(&"ci/cd".to_string()), "{tokens:?}");
    }

    /// A term with no digit and no symbol is only technical because the posting
    /// wrote it with internal capitals. Without that signal `postgresql` and
    /// `javascript` read as prose, lose their weight bonus, and can be dropped
    /// from the term list entirely - which is a silent loss of exactly the
    /// keywords a recruiter filter is likeliest to use.
    #[test]
    fn internal_capitals_are_what_make_a_plain_word_technical() {
        let mixed = mixed_case_terms("We run PostgreSQL and JavaScript in production.");
        assert!(mixed.contains("postgresql"), "{mixed:?}");
        assert!(mixed.contains("javascript"), "{mixed:?}");
        assert!(!mixed.contains("production"), "{mixed:?}");

        assert!(is_technical_shape("postgresql", &mixed));
        assert!(!is_technical_shape("production", &mixed));

        // The other two signals stand on their own, with no help from the text.
        let none = mixed_case_terms("");
        assert!(is_technical_shape("c++", &none));
        assert!(is_technical_shape("ci/cd", &none));
        assert!(is_technical_shape("s3", &none));
        assert!(!is_technical_shape("communication", &none));
    }
}
