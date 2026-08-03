//! Tests for `discover_parsers_nofluffjobs`: both observed list shapes, and the
//! detail reader that turns a posting into structured text. No network.

use super::*;

#[test]
fn nofluffjobs_reads_root_array_shape() {
    let val: serde_json::Value = serde_json::from_str(
        r#"[{
                 "title":"Java Developer",
                 "name":"Acme Sp. z o.o.",
                 "url":"java-developer-acme",
                 "category":"backend",
                 "technology":"java",
                 "seniority":["Mid"],
                 "location":{"places":[{"city":"Warsaw"}],"fullyRemote":false}
               }]"#,
    )
    .unwrap();
    let jobs = parse_nofluffjobs(&val);
    assert_eq!(jobs[0].title, "Java Developer");
    assert_eq!(jobs[0].company, "Acme Sp. z o.o.");
    assert_eq!(jobs[0].location, "Warsaw, Poland");
    assert_eq!(
        jobs[0].url,
        "https://nofluffjobs.com/job/java-developer-acme"
    );
    assert!(jobs[0].jd_text.contains("backend"));
    assert!(jobs[0].jd_text.contains("java"));
    assert!(jobs[0].jd_text.contains("Mid"));
    assert_eq!(jobs[0].detail_ref.as_deref(), Some("java-developer-acme"));
}

#[test]
fn nofluffjobs_reads_postings_wrapper_shape_and_remote() {
    let val: serde_json::Value = serde_json::from_str(
        r#"{"postings":[{
                 "title":"DevOps",
                 "companyName":"Acme",
                 "url":"https://nofluffjobs.com/job/devops-acme",
                 "location":{"places":[],"fullyRemote":true}
               }]}"#,
    )
    .unwrap();
    let jobs = parse_nofluffjobs(&val);
    assert_eq!(jobs[0].company, "Acme");
    assert_eq!(jobs[0].location, "Remote, Poland");
    assert_eq!(jobs[0].url, "https://nofluffjobs.com/job/devops-acme");
    assert_eq!(jobs[0].detail_ref, None);
}

#[test]
fn nofluffjobs_empty_or_foreign_shape_yields_nothing() {
    assert!(parse_nofluffjobs(&serde_json::json!({})).is_empty());
    assert!(parse_nofluffjobs(&serde_json::json!([])).is_empty());
}

#[test]
fn nofluffjobs_detail_builds_structured_text() {
    let val: serde_json::Value = serde_json::from_str(
        r#"{
              "requirements": {
                "musts": [{"value":"React"},{"value":"Next.js"},{"value":"TypeScript"}],
                "nices": [{"value":"AWS"},{"value":"Nest.js"}],
                "description": "<p>You have 5 years of commercial experience.</p>"
              },
              "specs": {
                "dailyTasks": [
                  "Design and build complete product features.",
                  "Monitoring and tracing."
                ]
              },
              "essentials": {
                "originalSalary": {
                  "currency": "PLN",
                  "types": { "b2b": { "period": "Hour", "range": [200.0, 220.0] } }
                }
              }
            }"#,
    )
    .unwrap();

    let text = parse_nofluffjobs_detail(&val);
    // Headings the block renderer recognises, each on its own line.
    assert!(text.contains("Requirements:"));
    assert!(text.contains("- React"));
    assert!(text.contains("- TypeScript"));
    assert!(text.contains("Nice to have:"));
    assert!(text.contains("- AWS"));
    assert!(text.contains("Responsibilities:"));
    assert!(text.contains("- Design and build complete product features."));
    assert!(text.contains("You have 5 years of commercial experience."));
    // Salary line carries the currency and range so the extractor can read it.
    assert!(text.contains("Salary:"));
    assert!(text.contains("PLN"));
    assert!(text.contains("200"));
    assert!(text.contains("220"));
}

#[test]
fn nofluffjobs_detail_tolerates_missing_sections() {
    // A posting with no nices, no tasks, no salary must still yield its musts,
    // and never panic on the absent keys.
    let val: serde_json::Value =
        serde_json::from_str(r#"{"requirements":{"musts":[{"value":"Java"}]}}"#).unwrap();
    let text = parse_nofluffjobs_detail(&val);
    assert!(text.contains("- Java"));
    assert!(!text.contains("Nice to have:"));
    assert!(!text.contains("Salary:"));
}
