//! Pure application invariants. Status transitions stay in the workflow: they
//! read the settings cadence and write history in one transaction.

/// Pipeline priority is the user's own triage signal. `None` clears it.
/// Anything outside `low` / `medium` / `high` is rejected before a write.
pub(crate) fn validate_priority(priority: Option<&str>) -> Result<(), String> {
    if let Some(p) = priority {
        if !matches!(p, "low" | "medium" | "high") {
            return Err(format!("invalid priority: {p}"));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_low_medium_high_and_cleared() {
        assert!(validate_priority(None).is_ok());
        assert!(validate_priority(Some("low")).is_ok());
        assert!(validate_priority(Some("medium")).is_ok());
        assert!(validate_priority(Some("high")).is_ok());
    }

    #[test]
    fn rejects_any_other_value_including_case_variants() {
        assert_eq!(
            validate_priority(Some("urgent")).unwrap_err(),
            "invalid priority: urgent"
        );
        assert!(validate_priority(Some("")).is_err());
        assert!(validate_priority(Some("Low")).is_err());
        assert!(validate_priority(Some("none")).is_err());
    }
}
