// Layer-1 archetype awareness (0 tokens). Deterministic keyword overlap between
// a job's title/JD and the user's target archetype sentences — no AI involved.

const STOPWORDS: &[&str] = &[
    "and", "or", "the", "in", "on", "at", "for", "with", "to", "of", "is", "are", "this", "that",
    "remote", "hybrid", "onsite", "series", "company", "product", "role", "team", "eu", "us",
    "usa", "uk", "de", "year", "years", "month", "months", "salary", "comp",
];

const SENIORITY_TERMS: &[&str] = &[
    "intern",
    "junior",
    "associate",
    "mid",
    "senior",
    "staff",
    "principal",
    "lead",
    "head",
    "director",
    "vp",
    "chief",
    "manager",
];

/// Extracts positive title-filter keywords (role/seniority terms) from target archetype
/// sentences. Pure, deterministic, 0 tokens. Not yet wired to any scan UI (Phase 6 stub).
pub fn derive_title_keywords(archetypes: &[String]) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut keywords = Vec::new();

    for archetype in archetypes {
        for raw in archetype.split(|c: char| !c.is_alphanumeric()) {
            let word = raw.to_lowercase();
            if word.len() < 3 || word.chars().any(|c| c.is_numeric()) {
                continue;
            }
            if STOPWORDS.contains(&word.as_str()) && !SENIORITY_TERMS.contains(&word.as_str()) {
                continue;
            }
            if seen.insert(word.clone()) {
                keywords.push(word);
            }
        }
    }

    keywords
}

/// True if `text` (job title + JD) shares a keyword with any archetype, or if there are
/// no archetypes to compare against (nothing to flag). False = off-archetype.
pub fn archetype_keyword_overlap(text: &str, archetypes: &[String]) -> bool {
    if archetypes.is_empty() {
        return true;
    }
    let keywords = derive_title_keywords(archetypes);
    if keywords.is_empty() {
        return true;
    }
    let lower = text.to_lowercase();
    keywords.iter().any(|k| lower.contains(k.as_str()))
}

/// `archetypes_json` is the raw `profile.target_archetypes` JSON array string (may be
/// None/empty if the user hasn't defined any yet). Returns false only when archetypes
/// exist and none of their keywords match — the UI surfaces that as "off-archetype".
#[tauri::command]
pub fn check_archetype_match(
    title: Option<String>,
    jd_text: String,
    archetypes_json: Option<String>,
) -> Result<bool, String> {
    let archetypes: Vec<String> = match archetypes_json {
        Some(json) if !json.trim().is_empty() => serde_json::from_str(&json)
            .map_err(|e| format!("check_archetype_match: bad archetypes_json: {e}"))?,
        _ => Vec::new(),
    };
    let combined = format!("{} {}", title.unwrap_or_default(), jd_text);
    Ok(archetype_keyword_overlap(&combined, &archetypes))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn archetypes() -> Vec<String> {
        vec![
            "Staff Frontend Engineer, remote or hybrid EU, Series B-D product company, €110-150K"
                .to_string(),
            "Senior Backend Engineer, Germany, fintech".to_string(),
        ]
    }

    #[test]
    fn derives_role_and_seniority_keywords() {
        let keywords = derive_title_keywords(&archetypes());
        assert!(keywords.contains(&"staff".to_string()));
        assert!(keywords.contains(&"frontend".to_string()));
        assert!(keywords.contains(&"engineer".to_string()));
        assert!(keywords.contains(&"senior".to_string()));
        assert!(keywords.contains(&"backend".to_string()));
        assert!(keywords.contains(&"fintech".to_string()));
    }

    #[test]
    fn drops_stopwords_and_numeric_noise() {
        let keywords = derive_title_keywords(&archetypes());
        assert!(!keywords.contains(&"remote".to_string()));
        assert!(!keywords.contains(&"series".to_string()));
        assert!(!keywords.contains(&"150k".to_string()));
        assert!(!keywords.contains(&"eu".to_string()));
    }

    #[test]
    fn dedupes_keywords_across_archetypes() {
        let keywords = derive_title_keywords(&archetypes());
        let engineer_count = keywords.iter().filter(|k| *k == "engineer").count();
        assert_eq!(engineer_count, 1);
    }

    #[test]
    fn on_archetype_job_matches() {
        let matched = archetype_keyword_overlap(
            "Staff Frontend Engineer at Acme — React, TypeScript, remote EU",
            &archetypes(),
        );
        assert!(matched);
    }

    #[test]
    fn off_archetype_job_does_not_match() {
        let matched = archetype_keyword_overlap(
            "Warehouse Logistics Coordinator — night shift, forklift certified",
            &archetypes(),
        );
        assert!(!matched);
    }

    #[test]
    fn no_archetypes_never_flags_off_archetype() {
        let matched = archetype_keyword_overlap("Anything at all", &[]);
        assert!(matched);
    }

    #[test]
    fn check_archetype_match_command_handles_missing_archetypes() {
        let result =
            check_archetype_match(Some("Anything".to_string()), "JD text".to_string(), None);
        assert_eq!(result, Ok(true));
    }

    #[test]
    fn check_archetype_match_command_parses_archetypes_json() {
        let json = serde_json::to_string(&archetypes()).unwrap();
        let result = check_archetype_match(
            Some("Staff Frontend Engineer".to_string()),
            "React, TypeScript".to_string(),
            Some(json),
        );
        assert_eq!(result, Ok(true));
    }
}
