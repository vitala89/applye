//! Deterministic tracklist status mapping. A terminal outcome wins when a
//! cell mentions both an in-between stage and an outcome
//! (`Interview - Rejected` -> `rejected`). Exact `No` is rejected; `None`
//! and `Notes` are not.

pub(crate) fn normalize_status(raw: &str) -> &'static str {
    let s = raw.trim().to_lowercase();
    if s.is_empty() {
        return "saved";
    }
    if s == "no"
        || s.contains("no response")
        || s.contains("ghost")
        || s.contains("reject")
        || s.contains("declin")
    {
        "rejected"
    } else if s.contains("offer") || s.contains("accept") {
        "offer"
    } else if s.contains("interview") || s.contains("screening") || s.contains("in progress") {
        "interview"
    } else if s.contains("sent") || s.contains("applied") || s.contains("submit") {
        "applied"
    } else {
        "saved"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_documented_status_examples() {
        assert_eq!(normalize_status("Sent"), "applied");
        assert_eq!(normalize_status("Applied"), "applied");
        assert_eq!(normalize_status("Submitted"), "applied");
        assert_eq!(normalize_status("In progress"), "interview");
        assert_eq!(normalize_status("Interview"), "interview");
        assert_eq!(normalize_status("Screening"), "interview");
        assert_eq!(normalize_status("Rejected"), "rejected");
        assert_eq!(normalize_status("Declined"), "rejected");
        assert_eq!(normalize_status("No"), "rejected");
        assert_eq!(normalize_status("Offer"), "offer");
        assert_eq!(normalize_status("Accepted"), "offer");
        assert_eq!(normalize_status(""), "saved");
        assert_eq!(normalize_status("Something else entirely"), "saved");
    }

    #[test]
    fn terminal_outcome_wins_over_interview_mention() {
        assert_eq!(normalize_status("Interview - Rejected"), "rejected");
    }

    #[test]
    fn short_ambiguous_words_do_not_false_positive() {
        // "no" must not match inside unrelated words like "None"/"Notes".
        assert_eq!(normalize_status("None yet"), "saved");
        assert_eq!(normalize_status("Notes pending"), "saved");
    }
}
