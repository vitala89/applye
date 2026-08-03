//! Tests for `discover_parsers`: one fixture per source shape, asserting the
//! fields a job carries out of each feed. No network - every reader takes text
//! or JSON that is already in hand, which is the property that makes this file
//! possible.

use super::*;

#[test]
fn arbeitsagentur_maps_list_fields() {
    let val: serde_json::Value = serde_json::from_str(
        r#"{"stellenangebote":[{
                 "titel":"Frontend Entwickler (m/w/d)",
                 "beruf":"Softwareentwickler",
                 "refnr":"10000-1198013731-S",
                 "arbeitgeber":"Muster GmbH",
                 "arbeitsort":{"ort":"Berlin","plz":"10115","region":"Berlin"}
               }]}"#,
    )
    .unwrap();
    let jobs = parse_arbeitsagentur(&val);
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0].title, "Frontend Entwickler (m/w/d)");
    assert_eq!(jobs[0].company, "Muster GmbH");
    assert_eq!(jobs[0].location, "Berlin, Berlin, Deutschland");
    assert_eq!(
        jobs[0].url,
        "https://www.arbeitsagentur.de/jobsuche/jobdetail/10000-1198013731-S"
    );
    assert_eq!(jobs[0].detail_ref.as_deref(), Some("10000-1198013731-S"));
    // Placeholder body until the detail request runs.
    assert!(jobs[0].jd_text.contains("Softwareentwickler"));
}

#[test]
fn arbeitsagentur_falls_back_to_beruf_and_external_url() {
    let val: serde_json::Value = serde_json::from_str(
        r#"{"stellenangebote":[{
                 "beruf":"Pflegefachkraft",
                 "refnr":"abc",
                 "externeUrl":"https://karriere.example.de/stelle/1",
                 "arbeitsort":{"land":"Deutschland"}
               }]}"#,
    )
    .unwrap();
    let jobs = parse_arbeitsagentur(&val);
    assert_eq!(jobs[0].title, "Pflegefachkraft");
    assert_eq!(jobs[0].location, "Deutschland");
    assert_eq!(jobs[0].url, "https://karriere.example.de/stelle/1");
}

#[test]
fn arbeitsagentur_empty_or_foreign_shape_yields_nothing() {
    assert!(parse_arbeitsagentur(&serde_json::json!({})).is_empty());
    assert!(parse_arbeitsagentur(&serde_json::json!({"stellenangebote":[]})).is_empty());
}

#[test]
fn trudvsem_reads_vacancy_fields_and_appends_russia() {
    let val: serde_json::Value = serde_json::from_str(
        r#"{"results":{"vacancies":[{"vacancy":{
                 "job-name":"Backend Developer",
                 "company":{"name":"Acme LLC"},
                 "region":{"name":"Москва"},
                 "vac_url":"https://trudvsem.ru/vacancy/1",
                 "duty":"Write code",
                 "requirement":"Rust experience"
               }}]}}"#,
    )
    .unwrap();
    let jobs = parse_trudvsem(&val);
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0].title, "Backend Developer");
    assert_eq!(jobs[0].company, "Acme LLC");
    assert_eq!(jobs[0].location, "Москва, Russia");
    assert_eq!(jobs[0].url, "https://trudvsem.ru/vacancy/1");
    assert!(jobs[0].jd_text.contains("Write code"));
    assert!(jobs[0].jd_text.contains("Rust experience"));
}

#[test]
fn trudvsem_missing_region_falls_back_to_bare_russia() {
    let val: serde_json::Value =
        serde_json::from_str(r#"{"results":{"vacancies":[{"vacancy":{"job-name":"QA"}}]}}"#)
            .unwrap();
    assert_eq!(parse_trudvsem(&val)[0].location, "Russia");
}

#[test]
fn trudvsem_empty_or_foreign_shape_yields_nothing() {
    assert!(parse_trudvsem(&serde_json::json!({})).is_empty());
    assert!(parse_trudvsem(&serde_json::json!({"results":{"vacancies":[]}})).is_empty());
}

#[test]
fn arbeitnow_reads_job_fields_and_appends_germany() {
    let val: serde_json::Value = serde_json::from_str(
        r#"{"data":[{
                 "title":"Frontend Engineer",
                 "company_name":"Muster GmbH",
                 "description":"<p>Build things.</p>",
                 "location":"Berlin",
                 "url":"https://arbeitnow.com/jobs/1"
               }]}"#,
    )
    .unwrap();
    let jobs = parse_arbeitnow(&val);
    assert_eq!(jobs[0].title, "Frontend Engineer");
    assert_eq!(jobs[0].company, "Muster GmbH");
    assert_eq!(jobs[0].location, "Berlin, Germany");
    assert!(jobs[0].jd_text.contains("Build things."));
}

#[test]
fn arbeitnow_missing_location_falls_back_to_bare_germany() {
    let val: serde_json::Value = serde_json::from_str(r#"{"data":[{"title":"QA"}]}"#).unwrap();
    assert_eq!(parse_arbeitnow(&val)[0].location, "Germany");
}

#[test]
fn arbeitnow_empty_or_foreign_shape_yields_nothing() {
    assert!(parse_arbeitnow(&serde_json::json!({})).is_empty());
    assert!(parse_arbeitnow(&serde_json::json!({"data":[]})).is_empty());
}

#[test]
fn percent_encoding_keeps_one_path_segment() {
    assert_eq!(percent_encode_segment("10000-119-S"), "10000-119-S");
    assert_eq!(percent_encode_segment("a/b c"), "a%2Fb%20c");
    assert_eq!(percent_encode_segment("x+y="), "x%2By%3D");
}

#[test]
fn remotive_fixture_parses() {
    let val: serde_json::Value = serde_json::from_str(
        r#"{"jobs":[{"title":"Frontend Dev","company_name":"Acme",
                 "description":"<p>Build &amp; ship</p>",
                 "candidate_required_location":"Europe",
                 "url":"https://remotive.com/jobs/1"}]}"#,
    )
    .unwrap();
    let jobs = parse_remotive(&val);
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0].title, "Frontend Dev");
    assert_eq!(jobs[0].company, "Acme");
    assert_eq!(jobs[0].jd_text, "Build & ship");
    assert_eq!(jobs[0].location, "Europe");
}

#[test]
fn himalayas_tolerates_root_array_and_field_spellings() {
    let val: serde_json::Value = serde_json::from_str(
        r#"[{"title":"Rust Dev","companyName":"Ferrous",
                 "description":"Systems work",
                 "locationRestrictions":["Germany","Austria"],
                 "applicationLink":"https://himalayas.app/jobs/2"}]"#,
    )
    .unwrap();
    let jobs = parse_himalayas(&val);
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0].company, "Ferrous");
    assert_eq!(jobs[0].location, "Germany, Austria");
}

#[test]
fn rss_wwr_splits_company_from_title() {
    let xml = r#"<rss><channel>
            <item><title>Acme: Senior Dev</title>
              <region>Anywhere in the World</region>
              <link>https://weworkremotely.com/jobs/3</link>
              <description><![CDATA[<p>Great job</p>]]></description></item>
        </channel></rss>"#;
    let jobs = parse_rss_items(xml, true);
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0].company, "Acme");
    assert_eq!(jobs[0].title, "Senior Dev");
    assert_eq!(jobs[0].jd_text, "Great job");
    assert_eq!(jobs[0].location, "Anywhere in the World");

    let generic = parse_rss_items(xml, false);
    assert_eq!(generic[0].title, "Acme: Senior Dev");
    assert_eq!(generic[0].company, "");
}

#[test]
fn rss_location_falls_back_to_place_like_category() {
    // No <region>/<location>; a <category> naming a place is used, while the
    // job-type category is ignored.
    let xml = r#"<rss><channel>
            <item><title>Backend Engineer</title>
              <category>Full-Time</category>
              <category>Berlin, Germany</category>
              <link>https://example.com/jobs/1</link>
              <description><![CDATA[<p>Build things</p>]]></description></item>
        </channel></rss>"#;
    let jobs = parse_rss_items(xml, false);
    assert_eq!(jobs[0].location, "Berlin, Germany");
}

#[test]
fn rss_location_reads_body_label() {
    let xml = r#"<rss><channel>
            <item><title>Data Engineer (m/w/d)</title>
              <link>https://example.com/jobs/2</link>
              <description><![CDATA[<p>About us</p><p>Standort: Munich</p>]]></description></item>
        </channel></rss>"#;
    let jobs = parse_rss_items(xml, false);
    assert_eq!(jobs[0].location, "Munich");
}

#[test]
fn rss_location_marks_remote_when_only_signal() {
    let xml = r#"<rss><channel>
            <item><title>Frontend Engineer</title>
              <link>https://example.com/jobs/3</link>
              <description><![CDATA[<p>Fully remote, work from anywhere.</p>]]></description></item>
        </channel></rss>"#;
    let jobs = parse_rss_items(xml, false);
    assert_eq!(jobs[0].location, "Remote");
}

#[test]
fn rss_location_stays_empty_without_any_signal() {
    // "(m/w/d)" and a plain JD must not be mistaken for a location.
    let xml = r#"<rss><channel>
            <item><title>Software Engineer (m/w/d)</title>
              <category>Engineering</category>
              <link>https://example.com/jobs/4</link>
              <description><![CDATA[<p>Join our team building products.</p>]]></description></item>
        </channel></rss>"#;
    let jobs = parse_rss_items(xml, false);
    assert_eq!(jobs[0].location, "");
}
