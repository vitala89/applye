//! Tests for `discover_parsers_ats`: one fixture per hosted-ATS board shape,
//! asserting the fields a job carries out of each. No network.

use super::*;

#[test]
fn personio_reads_title_office_and_all_description_sections() {
    let xml = r#"<workzag-jobs>
          <position>
            <id>1234</id>
            <subcompany>Muster GmbH</subcompany>
            <office>Berlin</office>
            <name>Frontend Entwickler (m/w/d)</name>
            <jobDescriptions>
              <jobDescription><name>Aufgaben</name><value><![CDATA[<p>Du baust das Web-Frontend.</p>]]></value></jobDescription>
              <jobDescription><name>Dein Profil</name><value><![CDATA[<ul><li>Angular</li></ul>]]></value></jobDescription>
            </jobDescriptions>
          </position>
        </workzag-jobs>"#;
    let jobs = parse_personio_xml(xml, "muster", "Muster");
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0].title, "Frontend Entwickler (m/w/d)");
    assert_eq!(jobs[0].company, "Muster GmbH");
    assert_eq!(jobs[0].location, "Berlin");
    assert_eq!(jobs[0].url, "https://muster.jobs.personio.de/job/1234");
    // Both sections land, headings included.
    assert!(jobs[0].jd_text.contains("Aufgaben"));
    assert!(jobs[0].jd_text.contains("Du baust das Web-Frontend."));
    assert!(jobs[0].jd_text.contains("Dein Profil"));
    assert!(jobs[0].jd_text.contains("Angular"));
}

#[test]
fn personio_title_is_not_taken_from_a_description_heading() {
    let xml = r#"<workzag-jobs><position>
            <name>Werkstudent Data</name>
            <jobDescriptions><jobDescription><name>Aufgaben</name><value>x</value></jobDescription></jobDescriptions>
          </position></workzag-jobs>"#;
    let jobs = parse_personio_xml(xml, "acme", "Acme");
    assert_eq!(jobs[0].title, "Werkstudent Data");
}

#[test]
fn personio_falls_back_to_the_slug_company_and_board_url() {
    let xml = r#"<workzag-jobs><position><name>QA</name></position></workzag-jobs>"#;
    let jobs = parse_personio_xml(xml, "acme", "Acme");
    assert_eq!(jobs[0].company, "Acme");
    assert_eq!(jobs[0].url, "https://acme.jobs.personio.de");
}

#[test]
fn personio_empty_or_unrelated_xml_yields_nothing() {
    assert!(parse_personio_xml("<workzag-jobs></workzag-jobs>", "a", "A").is_empty());
    assert!(parse_personio_xml("<rss><item></item></rss>", "a", "A").is_empty());
}

#[test]
fn greenhouse_fixture_parses_escaped_content() {
    let val: serde_json::Value = serde_json::from_str(
        r#"{"jobs":[{"title":"Platform Eng","content":"&lt;p&gt;Do platform things&lt;/p&gt;",
                 "absolute_url":"https://boards.greenhouse.io/acme/jobs/4",
                 "location":{"name":"Berlin"}}]}"#,
    )
    .unwrap();
    let jobs = parse_greenhouse_board(&val, "Acme");
    assert_eq!(jobs[0].jd_text, "Do platform things");
    assert_eq!(jobs[0].location, "Berlin");
    assert_eq!(jobs[0].company, "Acme");
}

#[test]
fn lever_and_ashby_fixtures_parse() {
    let lever: serde_json::Value = serde_json::from_str(
        r#"[{"text":"Data Eng","descriptionPlain":"Pipelines",
                 "categories":{"location":"Remote - Europe"},
                 "hostedUrl":"https://jobs.lever.co/acme/5"}]"#,
    )
    .unwrap();
    let jobs = parse_lever_postings(&lever, "Acme");
    assert_eq!(jobs[0].title, "Data Eng");
    assert_eq!(jobs[0].location, "Remote - Europe");

    let ashby: serde_json::Value = serde_json::from_str(
        r#"{"name":"Acme","jobs":[{"title":"ML Eng","location":"Remote",
                 "descriptionPlain":"Models","jobUrl":"https://jobs.ashbyhq.com/acme/6"}]}"#,
    )
    .unwrap();
    let jobs = parse_ashby_board(&ashby);
    assert_eq!(jobs[0].company, "Acme");
    assert_eq!(jobs[0].title, "ML Eng");
}
