// Turning stored document content into the styled blocks both exporters render.
//
// Split out of `documents.rs`, which was 1926 lines against an 800 budget. This
// is the pure middle of the export path: JSON in, `StyledBlock`s out, no
// database and no filesystem. `tailoring_pdf` and the DOCX renderer both take
// it from here, which is why the section headings and the block tagging can be
// asserted without producing a file.

pub(super) fn cv_content_to_blocks(
    content_json: &str,
    lang: Option<&str>,
) -> Result<Vec<crate::commands::tailoring::StyledBlock>, String> {
    use crate::commands::tailoring::{BlockLevel, StyledBlock};

    let parsed: serde_json::Value = serde_json::from_str(content_json)
        .map_err(|e| format!("cv_content_to_blocks: invalid content_json: {e}"))?;
    let mut sections: Vec<serde_json::Value> = parsed
        .get("sections")
        .and_then(|s| s.as_array())
        .cloned()
        .unwrap_or_default();
    sections.sort_by_key(|s| s.get("order").and_then(|o| o.as_i64()).unwrap_or(0));

    let mut out: Vec<StyledBlock> = Vec::new();
    let block = |level, key: &str, text: String, bold| StyledBlock {
        level,
        section_key: Some(key.to_string()),
        text,
        bold,
    };

    for section in sections {
        if section.get("visible").and_then(|v| v.as_bool()) == Some(false) {
            continue;
        }
        let str_field = |field: &str| -> Option<String> {
            section
                .get(field)
                .and_then(|v| v.as_str())
                .map(str::to_string)
        };
        let key = section.get("key").and_then(|k| k.as_str()).unwrap_or("");
        match key {
            "personal_details" => {
                if let Some(name) = str_field("fullName") {
                    out.push(block(BlockLevel::H1, "personal_details", name, false));
                }
                // Position/title line (bold, dark) - mirrors the editor's
                // `.cvpreview__title` under the name.
                if let Some(title) = str_field("title") {
                    out.push(block(BlockLevel::Body, "personal_details", title, true));
                }
                // Contact line - same fields, order, and " | " separator as the
                // editor's `buildContactLine`.
                let contact: Vec<String> = [
                    "address",
                    "phone",
                    "email",
                    "website",
                    "linkedin",
                    "birthDate",
                    "maritalStatus",
                ]
                .into_iter()
                .filter_map(str_field)
                .collect();
                if !contact.is_empty() {
                    out.push(block(
                        BlockLevel::Body,
                        "personal_details",
                        contact.join(" | "),
                        false,
                    ));
                }
            }
            "summary" => {
                if let Some(text) = str_field("text") {
                    out.push(block(
                        BlockLevel::H2,
                        "summary",
                        section_heading("summary", lang),
                        false,
                    ));
                    out.push(block(BlockLevel::Body, "summary", text, false));
                }
            }
            "experience" => {
                out.push(block(
                    BlockLevel::H2,
                    "experience",
                    section_heading("experience", lang),
                    false,
                ));
                if let Some(entries) = section.get("entries").and_then(|e| e.as_array()) {
                    for entry in entries {
                        let s = |f: &str| entry.get(f).and_then(|v| v.as_str()).unwrap_or("");
                        let company = s("company");
                        let industry = s("industry");
                        let role = s("role");
                        let location = s("location");
                        let start = s("startDate");
                        let end = if s("endDate").is_empty() {
                            "Present"
                        } else {
                            s("endDate")
                        };
                        // Entry head/role as two-column lines, mirroring the
                        // editor: company (+industry) left / location right,
                        // then role left / dates right. `\t` separates the
                        // columns; the renderers right-align the tail (PDF:
                        // measured right-aligned draw, DOCX: right tab stop).
                        let head = if industry.is_empty() {
                            company.to_string()
                        } else {
                            format!("{company} - {industry}")
                        };
                        let head_line = if location.is_empty() {
                            head
                        } else {
                            format!("{head}\t{location}")
                        };
                        out.push(block(BlockLevel::EntryHead, "experience", head_line, false));
                        let dates = format!("{start} - {end}");
                        let role_line = if role.is_empty() {
                            dates.clone()
                        } else {
                            format!("{role}\t{dates}")
                        };
                        out.push(block(BlockLevel::EntryRole, "experience", role_line, false));
                        if let Some(bullets) = entry.get("bullets").and_then(|b| b.as_array()) {
                            for bullet in bullets {
                                if let Some(text) = bullet.as_str() {
                                    out.push(block(
                                        BlockLevel::Bullet,
                                        "experience",
                                        text.to_string(),
                                        false,
                                    ));
                                }
                            }
                        }
                    }
                }
            }
            "education" => {
                out.push(block(
                    BlockLevel::H2,
                    "education",
                    section_heading("education", lang),
                    false,
                ));
                if let Some(entries) = section.get("entries").and_then(|e| e.as_array()) {
                    for entry in entries {
                        let s = |f: &str| entry.get(f).and_then(|v| v.as_str()).unwrap_or("");
                        let institution = s("institution");
                        let degree = s("degree");
                        let start = s("startDate");
                        let end = if s("endDate").is_empty() {
                            "Present"
                        } else {
                            s("endDate")
                        };
                        let head = [degree, institution]
                            .into_iter()
                            .filter(|p| !p.is_empty())
                            .collect::<Vec<_>>()
                            .join(", ");
                        let dates = format!("{start} - {end}");
                        let dates = dates.trim();
                        // Two-column: degree/institution left, dates right -
                        // mirrors the editor's education rows.
                        let line = if head.is_empty() {
                            dates.to_string()
                        } else {
                            format!("{head}\t{dates}")
                        };
                        out.push(block(BlockLevel::EntryRole, "education", line, false));
                    }
                }
            }
            "skills" => {
                if let Some(items) = section.get("items").and_then(|i| i.as_array()) {
                    let list: Vec<&str> = items.iter().filter_map(|v| v.as_str()).collect();
                    if !list.is_empty() {
                        out.push(block(
                            BlockLevel::H2,
                            "skills",
                            section_heading("skills", lang),
                            false,
                        ));
                        out.push(block(BlockLevel::Body, "skills", list.join(", "), false));
                    }
                } else if let Some(groups) = section.get("groups").and_then(|g| g.as_array()) {
                    let mut lines: Vec<String> = Vec::new();
                    for group in groups {
                        let label = group.get("label").and_then(|v| v.as_str()).unwrap_or("");
                        let values: Vec<&str> = group
                            .get("values")
                            .and_then(|v| v.as_array())
                            .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect())
                            .unwrap_or_default();
                        if !values.is_empty() {
                            lines.push(format!("{label}: {}", values.join(", ")));
                        }
                    }
                    if !lines.is_empty() {
                        out.push(block(
                            BlockLevel::H2,
                            "skills",
                            section_heading("skills", lang),
                            false,
                        ));
                        for line in lines {
                            out.push(block(BlockLevel::Body, "skills", line, false));
                        }
                    }
                }
            }
            "languages" => {
                if let Some(items) = section.get("items").and_then(|i| i.as_array()) {
                    if !items.is_empty() {
                        out.push(block(
                            BlockLevel::H2,
                            "languages",
                            section_heading("languages", lang),
                            false,
                        ));
                        for item in items {
                            let language =
                                item.get("language").and_then(|v| v.as_str()).unwrap_or("");
                            let level = item.get("level").and_then(|v| v.as_str()).unwrap_or("");
                            out.push(block(
                                BlockLevel::Bullet,
                                "languages",
                                format!("{language}: {level}"),
                                false,
                            ));
                        }
                    }
                }
            }
            // "photo" is rendered as an embedded image, not a text block.
            _ => {}
        }
    }
    Ok(out)
}

/// Structured, block-tagged version of `cover_letter_content_to_markdown`. Body
/// paragraphs are tagged `body_<i>` so per-paragraph style overrides resolve
/// through the `body` block down to the document-wide style.
pub(super) fn cover_letter_content_to_blocks(
    content_json: &str,
) -> Result<Vec<crate::commands::tailoring::StyledBlock>, String> {
    use crate::commands::tailoring::{BlockLevel, StyledBlock};

    let parsed: serde_json::Value = serde_json::from_str(content_json)
        .map_err(|e| format!("cover_letter_content_to_blocks: invalid json: {e}"))?;

    let mut out: Vec<StyledBlock> = Vec::new();
    let mut body = |key: String, text: String, bold| {
        if !text.is_empty() {
            out.push(StyledBlock {
                level: BlockLevel::Body,
                section_key: Some(key),
                text,
                bold,
            });
        }
    };

    if let Some(addr) = parsed.get("address") {
        let s = |f: &str| addr.get(f).and_then(|v| v.as_str()).unwrap_or("");
        body("recipient".into(), s("recipientName").into(), false);
        body("recipient".into(), s("company").into(), false);
        body("recipient".into(), s("street").into(), false);
        let pc_city = format!("{} {}", s("postalCode"), s("city"))
            .trim()
            .to_string();
        body("recipient".into(), pc_city, false);
        body("recipient".into(), s("country").into(), false);
    }

    let s = |f: &str| parsed.get(f).and_then(|v| v.as_str()).unwrap_or("");
    body("date".into(), s("date").into(), false);
    body("subject".into(), s("subject").into(), true);
    body("greeting".into(), s("greeting").into(), false);

    if let Some(paras) = parsed.get("bodyParagraphs").and_then(|v| v.as_array()) {
        for (i, para) in paras.iter().enumerate() {
            if let Some(p) = para.as_str() {
                body(format!("body_{i}"), p.to_string(), false);
            }
        }
    }

    body("closing".into(), s("closing").into(), false);
    body("signature".into(), s("signature").into(), false);

    Ok(out)
}
/// Localized section heading, mirroring the preview's
/// `t(sectionLabelKey(key))`. Only `en` and `de` define `cv_section_*` in the
/// i18n table (`translations.ts`); every other locale renders the English
/// label, so this table does the same: `de` → German, otherwise English.
fn section_heading(key: &str, lang: Option<&str>) -> String {
    let de = lang == Some("de");
    match (key, de) {
        ("summary", true) => "Zusammenfassung",
        ("summary", _) => "Summary",
        ("experience", true) => "Berufserfahrung",
        ("experience", _) => "Experience",
        ("education", true) => "Ausbildung",
        ("education", _) => "Education",
        ("skills", true) => "Fähigkeiten",
        ("skills", _) => "Skills",
        ("languages", true) => "Sprachen",
        ("languages", _) => "Languages",
        (other, _) => other,
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cv_content_to_blocks_orders_sections_tags_keys_and_hides_invisible() {
        use crate::commands::tailoring::BlockLevel;
        let content_json = r#"{"sections":[
            {"key":"summary","order":1,"visible":true,"text":"Backend engineer."},
            {"key":"personal_details","order":0,"visible":true,"fullName":"Jane Doe","email":"jane@example.com"},
            {"key":"experience","order":2,"visible":true,"entries":[{"company":"Acme","role":"Engineer","startDate":"2020","endDate":"2023","bullets":["Built things"]}]},
            {"key":"skills","order":3,"visible":false,"items":["Rust"]}
        ]}"#;
        let blocks = cv_content_to_blocks(content_json, None).expect("render");
        let pos = |needle: &str| {
            blocks
                .iter()
                .position(|b| b.text.contains(needle))
                .unwrap_or_else(|| panic!("missing {needle}"))
        };
        assert!(pos("Jane Doe") < pos("Backend engineer."));
        assert!(pos("Backend engineer.") < pos("Acme"));
        assert!(
            !blocks.iter().any(|b| b.text.contains("Rust")),
            "hidden section must not render"
        );
        // Name is the H1, tagged to its owning section for style resolution.
        assert_eq!(blocks[0].level, BlockLevel::H1);
        assert_eq!(blocks[0].section_key.as_deref(), Some("personal_details"));
        // The experience bullet keeps the section tag so overrides resolve.
        let bullet = blocks
            .iter()
            .find(|b| b.text.contains("Built things"))
            .unwrap();
        assert_eq!(bullet.level, BlockLevel::Bullet);
        assert_eq!(bullet.section_key.as_deref(), Some("experience"));
    }

    #[test]
    fn cv_content_to_blocks_splits_experience_into_accent_head_and_role() {
        use crate::commands::tailoring::BlockLevel;
        let content_json = r#"{"sections":[
            {"key":"experience","order":0,"visible":true,"entries":[
                {"company":"Acme","industry":"SaaS","role":"Engineer","location":"Berlin","startDate":"2020","endDate":"2023","bullets":["Shipped"]}
            ]}
        ]}"#;
        let blocks = cv_content_to_blocks(content_json, None).expect("render");
        let head = blocks
            .iter()
            .find(|b| b.level == BlockLevel::EntryHead)
            .expect("entry head");
        // Two-column: company+industry left, location right (tab-separated).
        assert_eq!(
            head.text, "Acme - SaaS\tBerlin",
            "company + industry, accent lead"
        );
        let role = blocks
            .iter()
            .find(|b| b.level == BlockLevel::EntryRole)
            .expect("entry role");
        // Two-column: role left, dates right.
        assert_eq!(role.text, "Engineer\t2020 - 2023");
    }

    #[test]
    fn cv_content_to_blocks_localizes_section_headings_for_german() {
        use crate::commands::tailoring::BlockLevel;
        let content_json = r#"{"sections":[
            {"key":"summary","order":0,"visible":true,"text":"Backend."},
            {"key":"experience","order":1,"visible":true,"entries":[{"company":"Acme","role":"Dev","startDate":"2020","endDate":"2023","bullets":["x"]}]}
        ]}"#;
        let heads = |lang| {
            cv_content_to_blocks(content_json, lang)
                .expect("render")
                .into_iter()
                .filter(|b| b.level == BlockLevel::H2)
                .map(|b| b.text)
                .collect::<Vec<_>>()
        };
        assert_eq!(
            heads(Some("de")),
            vec!["Zusammenfassung", "Berufserfahrung"]
        );
        // English for the default and any locale without cv_section_* keys.
        assert_eq!(heads(Some("uk")), vec!["Summary", "Experience"]);
        assert_eq!(heads(None), vec!["Summary", "Experience"]);
    }

    #[test]
    fn cv_content_to_blocks_renders_grouped_skills_when_items_absent() {
        use crate::commands::tailoring::BlockLevel;
        let content_json = r#"{"sections":[
            {"key":"skills","order":0,"visible":true,"groups":[
                {"label":"Languages","values":["TypeScript","Angular"]}
            ]}
        ]}"#;
        let blocks = cv_content_to_blocks(content_json, None).expect("render");
        assert!(blocks
            .iter()
            .any(|b| b.level == BlockLevel::H2 && b.text == "Skills"));
        assert!(blocks
            .iter()
            .any(|b| b.text == "Languages: TypeScript, Angular"));
    }
}
