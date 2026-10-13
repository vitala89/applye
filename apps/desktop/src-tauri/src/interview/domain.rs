//! Pure interview rules. Stage persistence and the parent-application
//! rejection sync live in the workflow, which reuses `applications::set_status`.

/// A new stage's status is derived, not chosen: a confirmed date means
/// `scheduled`, no date yet means `awaiting_scheduling`.
pub(crate) fn initial_stage_status(scheduled_at: Option<&str>) -> &'static str {
    if scheduled_at.unwrap_or("").is_empty() {
        "awaiting_scheduling"
    } else {
        "scheduled"
    }
}

/// Rejection is terminal at any stage and syncs the parent application.
/// A stage that was already rejected does not write history again.
/// `cancelled` and every other status leave the parent application alone.
pub(crate) fn rejection_propagates_to_application(previous_status: &str, new_status: &str) -> bool {
    new_status == "rejected" && previous_status != "rejected"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_schedule_awaits_scheduling() {
        assert_eq!(initial_stage_status(None), "awaiting_scheduling");
        assert_eq!(initial_stage_status(Some("")), "awaiting_scheduling");
    }

    #[test]
    fn a_confirmed_date_is_scheduled() {
        assert_eq!(initial_stage_status(Some("2026-08-01")), "scheduled");
    }

    #[test]
    fn only_a_fresh_rejection_propagates() {
        assert!(rejection_propagates_to_application("scheduled", "rejected"));
        assert!(rejection_propagates_to_application(
            "awaiting_scheduling",
            "rejected"
        ));
        assert!(!rejection_propagates_to_application("rejected", "rejected"));
        assert!(!rejection_propagates_to_application(
            "scheduled",
            "cancelled"
        ));
        assert!(!rejection_propagates_to_application("scheduled", "passed"));
    }
}
