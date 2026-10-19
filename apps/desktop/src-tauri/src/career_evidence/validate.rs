//! Stored-shape checks. These protect a row. They are not a second lifecycle.

use super::types::{CanonicalEvidence, CareerEvidenceInput, CareerEvidenceRow};

pub(crate) const STORED: &str = "Career Evidence could not be stored.";
pub(crate) const READ: &str = "Career Evidence could not be read.";

pub(crate) fn canonical_for_insert(
    input: &CareerEvidenceInput,
) -> Result<CanonicalEvidence, String> {
    let canonical = canonical_record(input, STORED)?;
    if canonical.review_state == "draft" || canonical.review_state == "proposal" {
        return Ok(canonical);
    }
    Err(STORED.to_string())
}

pub(crate) fn canonical_for_lifecycle(
    input: &CareerEvidenceInput,
) -> Result<CanonicalEvidence, String> {
    let canonical = canonical_record(input, STORED)?;
    if canonical.review_state == "confirmed" || canonical.review_state == "rejected" {
        return Ok(canonical);
    }
    Err(STORED.to_string())
}

pub(crate) fn ensure_row(row: &CareerEvidenceRow) -> Result<(), String> {
    canonical_record(&row_as_input(row), READ).map(|_| ())
}

fn canonical_record(
    input: &CareerEvidenceInput,
    failure: &str,
) -> Result<CanonicalEvidence, String> {
    let statement = required_text(&input.statement, failure)?;
    let review_state = required_text(&input.review_state, failure)?;
    let origin = required_text(&input.provenance.origin, failure)?;
    let captured_at = required_text(&input.provenance.captured_at, failure)?;
    let created_at = required_text(&input.created_at, failure)?;
    let updated_at = required_text(&input.updated_at, failure)?;
    let source_label = optional_text(&input.provenance.source_label, failure)?;
    let source_ref = optional_text(&input.provenance.source_ref, failure)?;
    let confirmed_at = optional_text(&input.confirmed_at, failure)?;
    let rejected_at = optional_text(&input.rejected_at, failure)?;

    if !matches!(
        review_state.as_str(),
        "draft" | "proposal" | "confirmed" | "rejected"
    ) {
        return Err(failure.to_string());
    }
    if !matches!(origin.as_str(), "user" | "ai" | "import") {
        return Err(failure.to_string());
    }
    if !clocks_hold(
        &review_state,
        &origin,
        &created_at,
        &updated_at,
        &confirmed_at,
        &rejected_at,
    ) {
        return Err(failure.to_string());
    }

    Ok(CanonicalEvidence {
        statement,
        review_state,
        origin,
        source_label,
        source_ref,
        captured_at,
        created_at,
        updated_at,
        confirmed_at,
        rejected_at,
    })
}

fn clocks_hold(
    review_state: &str,
    origin: &str,
    created_at: &str,
    updated_at: &str,
    confirmed_at: &Option<String>,
    rejected_at: &Option<String>,
) -> bool {
    match review_state {
        "draft" => {
            origin == "user"
                && confirmed_at.is_none()
                && rejected_at.is_none()
                && updated_at == created_at
        }
        "proposal" => {
            matches!(origin, "ai" | "import")
                && confirmed_at.is_none()
                && rejected_at.is_none()
                && updated_at == created_at
        }
        "confirmed" => confirmed_at.as_deref() == Some(updated_at) && rejected_at.is_none(),
        "rejected" => rejected_at.as_deref() == Some(updated_at) && confirmed_at.is_none(),
        _ => false,
    }
}

fn required_text(value: &str, failure: &str) -> Result<String, String> {
    if value.is_empty() || value.trim() != value {
        return Err(failure.to_string());
    }
    Ok(value.to_string())
}

/// Blank provenance is absent. A non-empty untrimmed value is refused, so the
/// stored text cannot silently change into a different string.
fn optional_text(value: &Option<String>, failure: &str) -> Result<Option<String>, String> {
    match value {
        None => Ok(None),
        Some(text) if text.trim().is_empty() => Ok(None),
        Some(text) if text.trim() == text => Ok(Some(text.clone())),
        Some(_) => Err(failure.to_string()),
    }
}

fn row_as_input(row: &CareerEvidenceRow) -> CareerEvidenceInput {
    CareerEvidenceInput {
        statement: row.statement.clone(),
        review_state: row.review_state.clone(),
        provenance: super::types::ProvenanceInput {
            origin: row.origin.clone(),
            source_label: row.source_label.clone(),
            source_ref: row.source_ref.clone(),
            captured_at: row.captured_at.clone(),
        },
        created_at: row.created_at.clone(),
        updated_at: row.updated_at.clone(),
        confirmed_at: row.confirmed_at.clone(),
        rejected_at: row.rejected_at.clone(),
    }
}
