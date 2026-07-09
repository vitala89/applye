// Documents library (ROADMAP §16): the live, editable CV / Cover-Letter
// library — distinct from `generated_docs`, which stays the export journal.
// `content_json` is a serialized JSON string whose shape is locked as a typed
// contract in `libs/core` (`CvContent` for `doc_type = 'cv'`,
// `CoverLetterContent` for `doc_type = 'cover_letter'`) so the 1b/1c UI
// modules build against a stable structure. This module (1a) only stores and
// returns it opaquely, same convention as other `*_json` columns in this
// codebase (e.g. `scoring_cache.dimensions_json`).
//
// `applications.cv_path` / `cover_letter_path` stay the frozen apply-time
// snapshot and are never touched here.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::{stable_hash, Db};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CvTemplate {
    pub id: i64,
    pub name: Option<String>,
    pub region_tag: Option<String>,
    pub sections_json: Option<String>,
    pub include_photo: bool,
    pub include_birthdate: bool,
    pub include_marital_status: bool,
    pub is_builtin: bool,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DocumentLibraryItem {
    pub id: i64,
    pub doc_type: String,
    pub source: String,
    pub label: Option<String>,
    pub content_json: Option<String>,
    pub file_path: Option<String>,
    pub template_id: Option<i64>,
    pub style_json: Option<String>,
    pub region_tag: Option<String>,
    pub language: Option<String>,
    pub archetype_tag: Option<String>,
    pub is_default: bool,
    pub input_hash: Option<String>,
    pub model_used: Option<String>,
    pub tokens_input: Option<i64>,
    pub tokens_output: Option<i64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertDocumentLibraryItemInput {
    pub id: Option<i64>,
    pub doc_type: String,
    pub source: String,
    pub label: Option<String>,
    pub content_json: Option<String>,
    pub file_path: Option<String>,
    pub template_id: Option<i64>,
    pub style_json: Option<String>,
    pub region_tag: Option<String>,
    pub language: Option<String>,
    pub archetype_tag: Option<String>,
    pub is_default: Option<bool>,
    pub input_hash: Option<String>,
    pub model_used: Option<String>,
    pub tokens_input: Option<i64>,
    pub tokens_output: Option<i64>,
}

#[tauri::command]
pub async fn cv_templates_list(db: State<'_, Db>) -> Result<Vec<CvTemplate>, String> {
    cv_templates_list_core(&db.pool).await
}

async fn cv_templates_list_core(pool: &sqlx::SqlitePool) -> Result<Vec<CvTemplate>, String> {
    sqlx::query_as::<_, CvTemplate>("SELECT * FROM cv_templates ORDER BY is_builtin DESC, name ASC")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("cv_templates_list: {e}"))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertCvTemplateInput {
    pub id: Option<i64>,
    pub name: String,
    pub region_tag: Option<String>,
    /// Ordered list of `CvSectionKey` values, JSON-encoded (e.g. from the
    /// constructor's current section order).
    pub sections_json: String,
    pub include_photo: bool,
    pub include_birthdate: bool,
    pub include_marital_status: bool,
}

/// Saves a constructor arrangement as a named custom template. Always
/// `is_builtin = 0` — the five seeded presets are the only builtins and are
/// never touched here.
#[tauri::command]
pub async fn cv_template_upsert(
    input: UpsertCvTemplateInput,
    db: State<'_, Db>,
) -> Result<CvTemplate, String> {
    cv_template_upsert_core(input, &db.pool).await
}

async fn cv_template_upsert_core(
    input: UpsertCvTemplateInput,
    pool: &sqlx::SqlitePool,
) -> Result<CvTemplate, String> {
    match input.id {
        Some(id) => sqlx::query_as::<_, CvTemplate>(
            "UPDATE cv_templates SET
               name = ?, region_tag = ?, sections_json = ?,
               include_photo = ?, include_birthdate = ?, include_marital_status = ?
             WHERE id = ? AND is_builtin = 0
             RETURNING *",
        )
        .bind(input.name)
        .bind(input.region_tag)
        .bind(input.sections_json)
        .bind(input.include_photo)
        .bind(input.include_birthdate)
        .bind(input.include_marital_status)
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("cv_template_upsert (update): {e}")),
        None => sqlx::query_as::<_, CvTemplate>(
            "INSERT INTO cv_templates
               (name, region_tag, sections_json, include_photo, include_birthdate,
                include_marital_status, is_builtin, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))
             RETURNING *",
        )
        .bind(input.name)
        .bind(input.region_tag)
        .bind(input.sections_json)
        .bind(input.include_photo)
        .bind(input.include_birthdate)
        .bind(input.include_marital_status)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("cv_template_upsert (insert): {e}")),
    }
}

/// Extracted plain text from an uploaded CV file, ready for the `cv-import`
/// skill. `input_hash` lets the caller skip a repeat AI call for a file
/// that was already imported (same normalized text).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CvImportFile {
    pub text: String,
    pub file_type: String,
    pub input_hash: String,
}

/// Reads a CV file picked via the OS file dialog (DOCX or PDF) and extracts
/// its plain text. No parsing into sections happens here — that is the
/// `cv-import` skill's job (one cached AI call); this step is deterministic
/// and free.
#[tauri::command]
pub fn cv_import_read_file(path: String) -> Result<CvImportFile, String> {
    let lower = path.to_lowercase();
    let (text, file_type) = if lower.ends_with(".docx") {
        (read_docx_text(&path)?, "docx".to_string())
    } else if lower.ends_with(".pdf") {
        (read_pdf_text(&path)?, "pdf".to_string())
    } else {
        return Err("cv_import_read_file: unsupported file type (expected .docx or .pdf)".into());
    };
    let input_hash = stable_hash(&text);
    Ok(CvImportFile {
        text,
        file_type,
        input_hash,
    })
}

use base64::Engine as _;

/// Sniff image MIME from magic bytes; default to octet-stream.
fn image_mime(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        "image/png"
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "image/jpeg"
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        "image/webp"
    } else {
        "application/octet-stream"
    }
}

fn bytes_to_data_uri(bytes: &[u8]) -> String {
    let mime = image_mime(bytes);
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    format!("data:{mime};base64,{b64}")
}

/// Strip a `data:...;base64,` prefix and base64-decode the payload to raw bytes.
/// Returns `None` if there is no `,` separator or the payload is not valid base64.
fn data_uri_to_bytes(uri: &str) -> Option<Vec<u8>> {
    let comma = uri.find(',')?;
    let b64 = &uri[comma + 1..];
    base64::engine::general_purpose::STANDARD.decode(b64).ok()
}

/// Reads a picked CV photo file and returns it as a base64 data URI for
/// inline storage/preview — no separate asset file, matches the
/// `content_json`-opaque-blob convention used elsewhere in this module.
#[tauri::command]
pub fn cv_photo_read_file(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("read photo: {e}"))?;
    // Guard: reject files that are not a supported image type.
    match image_mime(&bytes) {
        "application/octet-stream" => Err("unsupported image format".into()),
        _ => Ok(bytes_to_data_uri(&bytes)),
    }
}

fn read_docx_text(path: &str) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("read_docx_text: {e}"))?;
    let docx = docx_rs::read_docx(&bytes).map_err(|e| format!("read_docx_text: {e}"))?;

    let mut out = String::new();
    for child in &docx.document.children {
        if let docx_rs::DocumentChild::Paragraph(paragraph) = child {
            for p_child in &paragraph.children {
                if let docx_rs::ParagraphChild::Run(run) = p_child {
                    for r_child in &run.children {
                        if let docx_rs::RunChild::Text(text) = r_child {
                            out.push_str(&text.text);
                        }
                    }
                }
            }
            out.push('\n');
        }
    }
    if out.trim().is_empty() {
        return Err("read_docx_text: no extractable text found".into());
    }
    Ok(out)
}

fn read_pdf_text(path: &str) -> Result<String, String> {
    let text = pdf_extract::extract_text(path).map_err(|e| format!("read_pdf_text: {e}"))?;
    if text.trim().is_empty() {
        return Err("read_pdf_text: no extractable text found".into());
    }
    Ok(text)
}

/// Renders a `CvContent` JSON blob (opaque everywhere else in this module)
/// into plain markdown for the existing docx/pdf byte generators. Reads
/// `content_json` generically via `serde_json::Value` rather than a full
/// typed mirror of the `libs/core` union — this module only ever needs to
/// walk it in visible/order sequence, not round-trip it.
fn cv_content_to_markdown(content_json: &str) -> Result<String, String> {
    let parsed: serde_json::Value = serde_json::from_str(content_json)
        .map_err(|e| format!("cv_content_to_markdown: invalid content_json: {e}"))?;
    let mut sections: Vec<serde_json::Value> = parsed
        .get("sections")
        .and_then(|s| s.as_array())
        .cloned()
        .unwrap_or_default();
    sections.sort_by_key(|s| s.get("order").and_then(|o| o.as_i64()).unwrap_or(0));

    let mut md = String::new();
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
        match section.get("key").and_then(|k| k.as_str()).unwrap_or("") {
            "personal_details" => {
                if let Some(name) = str_field("fullName") {
                    md.push_str(&format!("# {name}\n\n"));
                }
                let contact: Vec<String> = ["email", "phone", "address"]
                    .into_iter()
                    .filter_map(str_field)
                    .collect();
                if !contact.is_empty() {
                    md.push_str(&contact.join(" · "));
                    md.push_str("\n\n");
                }
            }
            "summary" => {
                if let Some(text) = str_field("text") {
                    md.push_str("## Summary\n\n");
                    md.push_str(&text);
                    md.push_str("\n\n");
                }
            }
            "experience" => {
                md.push_str("## Experience\n\n");
                if let Some(entries) = section.get("entries").and_then(|e| e.as_array()) {
                    for entry in entries {
                        let company = entry.get("company").and_then(|v| v.as_str()).unwrap_or("");
                        let role = entry.get("role").and_then(|v| v.as_str()).unwrap_or("");
                        let start = entry
                            .get("startDate")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let end = entry
                            .get("endDate")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Present");
                        md.push_str(&format!("**{role}**, {company} ({start} – {end})\n\n"));
                        if let Some(bullets) = entry.get("bullets").and_then(|b| b.as_array()) {
                            for bullet in bullets {
                                if let Some(text) = bullet.as_str() {
                                    md.push_str(&format!("- {text}\n"));
                                }
                            }
                        }
                        md.push('\n');
                    }
                }
            }
            "education" => {
                md.push_str("## Education\n\n");
                if let Some(entries) = section.get("entries").and_then(|e| e.as_array()) {
                    for entry in entries {
                        let institution = entry
                            .get("institution")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let degree = entry.get("degree").and_then(|v| v.as_str()).unwrap_or("");
                        let start = entry
                            .get("startDate")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let end = entry
                            .get("endDate")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Present");
                        md.push_str(&format!(
                            "**{degree}**, {institution} ({start} – {end})\n\n"
                        ));
                    }
                }
            }
            "skills" => {
                if let Some(items) = section.get("items").and_then(|i| i.as_array()) {
                    let list: Vec<&str> = items.iter().filter_map(|v| v.as_str()).collect();
                    if !list.is_empty() {
                        md.push_str("## Skills\n\n");
                        md.push_str(&list.join(", "));
                        md.push_str("\n\n");
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
                            lines.push(format!("**{label}:** {}", values.join(", ")));
                        }
                    }
                    if !lines.is_empty() {
                        md.push_str("## Skills\n\n");
                        md.push_str(&lines.join("\n"));
                        md.push_str("\n\n");
                    }
                }
            }
            "languages" => {
                if let Some(items) = section.get("items").and_then(|i| i.as_array()) {
                    if !items.is_empty() {
                        md.push_str("## Languages\n\n");
                        for item in items {
                            let language =
                                item.get("language").and_then(|v| v.as_str()).unwrap_or("");
                            let level = item.get("level").and_then(|v| v.as_str()).unwrap_or("");
                            md.push_str(&format!("- {language}: {level}\n"));
                        }
                        md.push('\n');
                    }
                }
            }
            // "photo" has no plain-text representation in this renderer.
            _ => {}
        }
    }
    Ok(md)
}

/// Structured, section-tagged version of `cv_content_to_markdown` for the
/// styled DOCX/PDF exporters: same section walk, but each line is emitted as a
/// `StyledBlock` carrying its `CvSectionKey` so the renderer can apply that
/// section's effective style. Section titles stay in English (export
/// convention), matching the markdown path.
fn cv_content_to_blocks(
    content_json: &str,
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
                let contact: Vec<String> = ["email", "phone", "address"]
                    .into_iter()
                    .filter_map(str_field)
                    .collect();
                if !contact.is_empty() {
                    out.push(block(
                        BlockLevel::Body,
                        "personal_details",
                        contact.join(" · "),
                        false,
                    ));
                }
            }
            "summary" => {
                if let Some(text) = str_field("text") {
                    out.push(block(
                        BlockLevel::H2,
                        "summary",
                        "Summary".to_string(),
                        false,
                    ));
                    out.push(block(BlockLevel::Body, "summary", text, false));
                }
            }
            "experience" => {
                out.push(block(
                    BlockLevel::H2,
                    "experience",
                    "Experience".to_string(),
                    false,
                ));
                if let Some(entries) = section.get("entries").and_then(|e| e.as_array()) {
                    for entry in entries {
                        let company = entry.get("company").and_then(|v| v.as_str()).unwrap_or("");
                        let role = entry.get("role").and_then(|v| v.as_str()).unwrap_or("");
                        let start = entry
                            .get("startDate")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let end = entry
                            .get("endDate")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Present");
                        out.push(block(
                            BlockLevel::Body,
                            "experience",
                            format!("{role}, {company} ({start} – {end})"),
                            true,
                        ));
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
                    "Education".to_string(),
                    false,
                ));
                if let Some(entries) = section.get("entries").and_then(|e| e.as_array()) {
                    for entry in entries {
                        let institution = entry
                            .get("institution")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let degree = entry.get("degree").and_then(|v| v.as_str()).unwrap_or("");
                        let start = entry
                            .get("startDate")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let end = entry
                            .get("endDate")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Present");
                        out.push(block(
                            BlockLevel::Body,
                            "education",
                            format!("{degree}, {institution} ({start} – {end})"),
                            true,
                        ));
                    }
                }
            }
            "skills" => {
                if let Some(items) = section.get("items").and_then(|i| i.as_array()) {
                    let list: Vec<&str> = items.iter().filter_map(|v| v.as_str()).collect();
                    if !list.is_empty() {
                        out.push(block(BlockLevel::H2, "skills", "Skills".to_string(), false));
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
                        out.push(block(BlockLevel::H2, "skills", "Skills".to_string(), false));
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
                            "Languages".to_string(),
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
fn cover_letter_content_to_blocks(
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

/// Escapes LaTeX special characters in plain (non-math) text.
fn tex_escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' | '%' | '$' | '#' | '_' | '{' | '}' => {
                out.push('\\');
                out.push(c);
            }
            '~' => out.push_str("\\textasciitilde{}"),
            '^' => out.push_str("\\textasciicircum{}"),
            '\\' => out.push_str("\\textbackslash{}"),
            _ => out.push(c),
        }
    }
    out
}

/// Renders a `CvContent` JSON blob into a clean, minimal LaTeX source
/// (ROADMAP §16.6) — string templating only, never compiled here (no TeX
/// toolchain bundled, keeps the binary tiny and local-first). Same section
/// walk as `cv_content_to_markdown`, escaped for LaTeX instead.
fn cv_content_to_tex(content_json: &str) -> Result<String, String> {
    let parsed: serde_json::Value = serde_json::from_str(content_json)
        .map_err(|e| format!("cv_content_to_tex: invalid content_json: {e}"))?;
    let mut sections: Vec<serde_json::Value> = parsed
        .get("sections")
        .and_then(|s| s.as_array())
        .cloned()
        .unwrap_or_default();
    sections.sort_by_key(|s| s.get("order").and_then(|o| o.as_i64()).unwrap_or(0));

    let mut body = String::new();
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
        match section.get("key").and_then(|k| k.as_str()).unwrap_or("") {
            "personal_details" => {
                if let Some(name) = str_field("fullName") {
                    body.push_str(&format!(
                        "{{\\LARGE \\textbf{{{}}}}}\\\\\n",
                        tex_escape(&name)
                    ));
                }
                let contact: Vec<String> = ["email", "phone", "address"]
                    .into_iter()
                    .filter_map(str_field)
                    .map(|v| tex_escape(&v))
                    .collect();
                if !contact.is_empty() {
                    body.push_str(&contact.join(" \\textbullet\\ "));
                    body.push_str("\n\n");
                }
            }
            "summary" => {
                if let Some(text) = str_field("text") {
                    body.push_str("\\section*{Summary}\n");
                    body.push_str(&tex_escape(&text));
                    body.push_str("\n\n");
                }
            }
            "experience" => {
                body.push_str("\\section*{Experience}\n");
                if let Some(entries) = section.get("entries").and_then(|e| e.as_array()) {
                    for entry in entries {
                        let company = entry.get("company").and_then(|v| v.as_str()).unwrap_or("");
                        let role = entry.get("role").and_then(|v| v.as_str()).unwrap_or("");
                        let start = entry
                            .get("startDate")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let end = entry
                            .get("endDate")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Present");
                        body.push_str(&format!(
                            "\\textbf{{{}}}, {} \\hfill {} -- {}\\\\\n",
                            tex_escape(role),
                            tex_escape(company),
                            tex_escape(start),
                            tex_escape(end)
                        ));
                        if let Some(bullets) = entry.get("bullets").and_then(|b| b.as_array()) {
                            let items: Vec<&str> =
                                bullets.iter().filter_map(|b| b.as_str()).collect();
                            if !items.is_empty() {
                                body.push_str("\\begin{itemize}\n");
                                for bullet in items {
                                    body.push_str(&format!("\\item {}\n", tex_escape(bullet)));
                                }
                                body.push_str("\\end{itemize}\n");
                            }
                        }
                        body.push('\n');
                    }
                }
            }
            "education" => {
                body.push_str("\\section*{Education}\n");
                if let Some(entries) = section.get("entries").and_then(|e| e.as_array()) {
                    for entry in entries {
                        let institution = entry
                            .get("institution")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let degree = entry.get("degree").and_then(|v| v.as_str()).unwrap_or("");
                        let start = entry
                            .get("startDate")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let end = entry
                            .get("endDate")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Present");
                        body.push_str(&format!(
                            "\\textbf{{{}}}, {} \\hfill {} -- {}\\\\\n\n",
                            tex_escape(degree),
                            tex_escape(institution),
                            tex_escape(start),
                            tex_escape(end)
                        ));
                    }
                }
            }
            "skills" => {
                if let Some(items) = section.get("items").and_then(|i| i.as_array()) {
                    let list: Vec<String> = items
                        .iter()
                        .filter_map(|v| v.as_str())
                        .map(tex_escape)
                        .collect();
                    if !list.is_empty() {
                        body.push_str("\\section*{Skills}\n");
                        body.push_str(&list.join(", "));
                        body.push_str("\n\n");
                    }
                } else if let Some(groups) = section.get("groups").and_then(|g| g.as_array()) {
                    let mut lines: Vec<String> = Vec::new();
                    for group in groups {
                        let label = group.get("label").and_then(|v| v.as_str()).unwrap_or("");
                        let values: Vec<String> = group
                            .get("values")
                            .and_then(|v| v.as_array())
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|v| v.as_str())
                                    .map(tex_escape)
                                    .collect()
                            })
                            .unwrap_or_default();
                        if !values.is_empty() {
                            lines.push(format!(
                                "\\textbf{{{}:}} {}",
                                tex_escape(label),
                                values.join(", ")
                            ));
                        }
                    }
                    if !lines.is_empty() {
                        body.push_str("\\section*{Skills}\n");
                        body.push_str(&lines.join("\\\\\n"));
                        body.push_str("\n\n");
                    }
                }
            }
            "languages" => {
                if let Some(items) = section.get("items").and_then(|i| i.as_array()) {
                    if !items.is_empty() {
                        body.push_str("\\section*{Languages}\n");
                        for item in items {
                            let language =
                                item.get("language").and_then(|v| v.as_str()).unwrap_or("");
                            let level = item.get("level").and_then(|v| v.as_str()).unwrap_or("");
                            body.push_str(&format!(
                                "{}: {}\\\\\n",
                                tex_escape(language),
                                tex_escape(level)
                            ));
                        }
                        body.push('\n');
                    }
                }
            }
            // "photo" is intentionally omitted from .tex export: the app never
            // compiles the .tex itself, and there is no companion-asset
            // mechanism to ship the image alongside for \includegraphics.
            // DOCX/PDF embed the photo; LaTeX stays photo-less by design.
            _ => {}
        }
    }

    Ok(format!(
        "\\documentclass[11pt]{{article}}\n\
         \\usepackage[margin=1in]{{geometry}}\n\
         \\usepackage[utf8]{{inputenc}}\n\
         \\pagestyle{{empty}}\n\
         \\setlength{{\\parindent}}{{0pt}}\n\n\
         \\begin{{document}}\n\n\
         {body}\
         \\end{{document}}\n"
    ))
}

/// CV style choices (ROADMAP §16.5) — layout-adjacent but distinct from
/// `cv_templates` (section order/toggles): font, size, one accent colour.
/// Deserializes with safe defaults so a document with no `style_json` yet
/// (every CV before this feature) resolves to the safe default, not an error.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CvStyle {
    #[serde(default = "CvStyle::default_font_family")]
    pub font_family: String,
    #[serde(default = "CvStyle::default_font_size_pt")]
    pub font_size_pt: f64,
    #[serde(default = "CvStyle::default_accent_color_hex")]
    pub accent_color_hex: String,
    #[serde(default = "CvStyle::default_font_weight")]
    pub font_weight: i64,
    #[serde(default)]
    pub section_styles: std::collections::HashMap<String, CvSectionStyle>,
}

impl CvStyle {
    fn default_font_family() -> String {
        "Calibri".to_string()
    }
    fn default_font_size_pt() -> f64 {
        11.0
    }
    fn default_accent_color_hex() -> String {
        "#333333".to_string()
    }
    fn default_font_weight() -> i64 {
        400
    }
}

impl Default for CvStyle {
    fn default() -> Self {
        Self {
            font_family: Self::default_font_family(),
            font_size_pt: Self::default_font_size_pt(),
            accent_color_hex: Self::default_accent_color_hex(),
            font_weight: Self::default_font_weight(),
            section_styles: Default::default(),
        }
    }
}

/// Per-section style override (Wave B): any field left `None` falls back to
/// the parent `CvStyle`'s value when `check_style_safety_core` evaluates it.
#[derive(Debug, Default, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CvSectionStyle {
    pub font_family: Option<String>,
    pub font_size_pt: Option<f64>,
    pub color_hex: Option<String>,
    pub font_weight: Option<i64>,
}

/// Curated ATS-safe font list (ROADMAP §16.5) — case-insensitive match.
/// Fonts outside this list aren't blocked, just flagged: some ATS parsers
/// choke on decorative/condensed/script fonts when extracting text.
const ATS_SAFE_FONTS: &[&str] = &[
    "arial",
    "calibri",
    "helvetica",
    "times new roman",
    "georgia",
    "lato",
    "open sans",
    "verdana",
    "tahoma",
    "garamond",
];

/// One ATS/readability note. `kind` selects the (translated, honestly
/// worded) message on the frontend; `detail` is the value to interpolate
/// (font name / point size / hex) — Rust never renders user-facing text.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StyleNote {
    pub kind: String,
    pub detail: String,
}

/// Deterministic, 0-token style-safety check. Two honestly distinct note
/// types (ROADMAP §16.5): `font_ats_risk` / `size_out_of_range` are about
/// ATS text-parsing risk; `color_readability_risk` is about print/greyscale
/// legibility, NOT ATS parsing — colour barely affects text extraction.
/// A note only appears when the value leaves the safe default.
#[tauri::command]
pub fn check_style_safety(style_json: Option<String>) -> Vec<StyleNote> {
    check_style_safety_core(style_json)
}

fn check_style_safety_core(style_json: Option<String>) -> Vec<StyleNote> {
    let style: CvStyle = style_json
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();
    let mut notes = Vec::new();

    push_font_size_color_notes(
        &mut notes,
        &style.font_family,
        style.font_size_pt,
        &style.accent_color_hex,
    );
    if let Some(n) = weight_note(style.font_weight) {
        notes.push(n);
    }
    for o in style.section_styles.values() {
        let font = o.font_family.as_deref().unwrap_or(&style.font_family);
        let size = o.font_size_pt.unwrap_or(style.font_size_pt);
        let color = o.color_hex.as_deref().unwrap_or(&style.accent_color_hex);
        push_font_size_color_notes(&mut notes, font, size, color);
        if let Some(n) = weight_note(o.font_weight.unwrap_or(style.font_weight)) {
            notes.push(n);
        }
    }
    notes
}

/// Shared ATS/size/colour checks, run once for the global style and once per
/// per-section override (with the override's effective, fallback-resolved
/// values) so both paths stay in lockstep.
fn push_font_size_color_notes(notes: &mut Vec<StyleNote>, font: &str, size: f64, color: &str) {
    if !ATS_SAFE_FONTS.contains(&font.trim().to_lowercase().as_str()) {
        notes.push(StyleNote {
            kind: "font_ats_risk".to_string(),
            detail: font.to_string(),
        });
    }
    if !(9.0..=13.0).contains(&size) {
        notes.push(StyleNote {
            kind: "size_out_of_range".to_string(),
            detail: format!("{size}"),
        });
    }
    if is_low_print_contrast(color) {
        notes.push(StyleNote {
            kind: "color_readability_risk".to_string(),
            detail: color.to_string(),
        });
    }
}

/// Curated fonts carry no per-weight metadata, so this note is a conservative,
/// truthful heuristic rather than a lookup: Light (300) is not reliably
/// shipped by the common ATS core fonts (Calibri, Arial, Times New Roman,
/// Georgia, Verdana), so only 300 is flagged. 400/600/700 are treated as
/// universally available and never flagged.
fn weight_note(weight: i64) -> Option<StyleNote> {
    if weight == 300 {
        Some(StyleNote {
            kind: "weight_unavailable_risk".to_string(),
            detail: "300".to_string(),
        })
    } else {
        None
    }
}

/// Flags an accent colour too light to stay legible once printed in
/// greyscale (e.g. by an Agentur für Arbeit printer) — a readability/print
/// concern, not an ATS-parsing one.
fn is_low_print_contrast(hex: &str) -> bool {
    let hex = hex.trim_start_matches('#');
    if hex.len() != 6 {
        return false; // malformed value — don't nag, `check_style_safety` isn't a validator
    }
    let Ok(r) = u8::from_str_radix(&hex[0..2], 16) else {
        return false;
    };
    let Ok(g) = u8::from_str_radix(&hex[2..4], 16) else {
        return false;
    };
    let Ok(b) = u8::from_str_radix(&hex[4..6], 16) else {
        return false;
    };
    let luminance =
        0.2126 * (r as f64 / 255.0) + 0.7152 * (g as f64 / 255.0) + 0.0722 * (b as f64 / 255.0);
    luminance > 0.75
}

/// Exports a library CV to a user-chosen path as DOCX or PDF. This is a
/// library export, distinct from the job-specific `generated_docs` journal
/// (`export_docx`/`export_pdf` in `commands::tailoring`) — it never touches
/// `applications.cv_path`, which stays the frozen apply-time snapshot.
#[tauri::command]
pub async fn cv_document_export(
    id: i64,
    format: String,
    save_path: String,
    db: State<'_, Db>,
) -> Result<String, String> {
    let bytes = cv_document_export_bytes_core(id, &format, &db.pool).await?;
    std::fs::write(&save_path, bytes).map_err(|e| format!("cv_document_export: write: {e}"))?;
    Ok(save_path)
}

async fn cv_document_export_bytes_core(
    id: i64,
    format: &str,
    pool: &sqlx::SqlitePool,
) -> Result<Vec<u8>, String> {
    let doc = document_library_get_core(id, pool)
        .await?
        .ok_or_else(|| "cv_document_export: document not found".to_string())?;
    // The user's style choices live in `style_json`; a missing/legacy value
    // resolves to the safe default rather than erroring. Read it before moving
    // `content_json` out of `doc`.
    let style: CvStyle = doc
        .style_json
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();
    let content_json = doc
        .content_json
        .ok_or_else(|| "cv_document_export: document has no content".to_string())?;

    // Extract the CV photo (a base64 data URI) from the `photo` section, but only
    // when that section is present and visible. Decoded once here and threaded
    // into the DOCX/PDF renderers; `.tex` deliberately omits it (see below).
    let photo_bytes: Option<Vec<u8>> = serde_json::from_str::<serde_json::Value>(&content_json)
        .ok()
        .and_then(|v| {
            v.get("sections")
                .and_then(|s| s.as_array())
                .and_then(|sections| {
                    sections
                        .iter()
                        .find(|s| s.get("key").and_then(|k| k.as_str()) == Some("photo"))
                        .cloned()
                })
        })
        .filter(|photo| {
            photo
                .get("visible")
                .and_then(|b| b.as_bool())
                .unwrap_or(false)
        })
        .and_then(|photo| {
            photo
                .get("dataUri")
                .and_then(|d| d.as_str())
                .and_then(data_uri_to_bytes)
        });

    match format {
        "docx" | "pdf" => {
            let blocks = cv_content_to_blocks(&content_json)?;
            let resolved = crate::commands::tailoring::resolve_blocks(&style, &blocks, false);
            if format == "docx" {
                crate::commands::tailoring::render_blocks_docx(&resolved, photo_bytes.as_deref())
            } else {
                crate::commands::tailoring::render_blocks_pdf(&resolved, photo_bytes.as_deref())
            }
        }
        "tex" => Ok(cv_content_to_tex(&content_json)?.into_bytes()),
        other => Err(format!("cv_document_export: unsupported format '{other}'")),
    }
}

#[tauri::command]
pub async fn cover_letter_document_export(
    id: i64,
    format: String,
    save_path: String,
    db: State<'_, Db>,
) -> Result<String, String> {
    let bytes = cover_letter_document_export_bytes_core(id, &format, &db.pool).await?;
    std::fs::write(&save_path, bytes)
        .map_err(|e| format!("cover_letter_document_export: write: {e}"))?;
    Ok(save_path)
}

async fn cover_letter_document_export_bytes_core(
    id: i64,
    format: &str,
    pool: &sqlx::SqlitePool,
) -> Result<Vec<u8>, String> {
    let doc = document_library_get_core(id, pool)
        .await?
        .ok_or_else(|| "cover_letter_document_export: document not found".to_string())?;
    let style: CvStyle = doc
        .style_json
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();
    let content_json = doc
        .content_json
        .ok_or_else(|| "cover_letter_document_export: document has no content".to_string())?;
    match format {
        "docx" | "pdf" => {
            let blocks = cover_letter_content_to_blocks(&content_json)?;
            let resolved = crate::commands::tailoring::resolve_blocks(&style, &blocks, true);
            if format == "docx" {
                crate::commands::tailoring::render_blocks_docx(&resolved, None)
            } else {
                crate::commands::tailoring::render_blocks_pdf(&resolved, None)
            }
        }
        other => Err(format!(
            "cover_letter_document_export: unsupported format '{other}'"
        )),
    }
}

#[tauri::command]
pub async fn document_library_list(
    doc_type: Option<String>,
    db: State<'_, Db>,
) -> Result<Vec<DocumentLibraryItem>, String> {
    document_library_list_core(doc_type, &db.pool).await
}

async fn document_library_list_core(
    doc_type: Option<String>,
    pool: &sqlx::SqlitePool,
) -> Result<Vec<DocumentLibraryItem>, String> {
    match doc_type {
        Some(doc_type) => sqlx::query_as::<_, DocumentLibraryItem>(
            "SELECT * FROM document_library WHERE doc_type = ? ORDER BY updated_at DESC",
        )
        .bind(doc_type)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("document_library_list: {e}")),
        None => sqlx::query_as::<_, DocumentLibraryItem>(
            "SELECT * FROM document_library ORDER BY updated_at DESC",
        )
        .fetch_all(pool)
        .await
        .map_err(|e| format!("document_library_list: {e}")),
    }
}

#[tauri::command]
pub async fn document_library_get(
    id: i64,
    db: State<'_, Db>,
) -> Result<Option<DocumentLibraryItem>, String> {
    document_library_get_core(id, &db.pool).await
}

async fn document_library_get_core(
    id: i64,
    pool: &sqlx::SqlitePool,
) -> Result<Option<DocumentLibraryItem>, String> {
    sqlx::query_as::<_, DocumentLibraryItem>("SELECT * FROM document_library WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("document_library_get: {e}"))
}

#[tauri::command]
pub async fn document_library_upsert(
    input: UpsertDocumentLibraryItemInput,
    db: State<'_, Db>,
) -> Result<DocumentLibraryItem, String> {
    document_library_upsert_core(input, &db.pool).await
}

async fn document_library_upsert_core(
    input: UpsertDocumentLibraryItemInput,
    pool: &sqlx::SqlitePool,
) -> Result<DocumentLibraryItem, String> {
    let is_default = input.is_default.unwrap_or(false);

    match input.id {
        Some(id) => sqlx::query_as::<_, DocumentLibraryItem>(
            "UPDATE document_library SET
               doc_type       = ?,
               source         = ?,
               label          = ?,
               content_json   = ?,
               file_path      = ?,
               template_id    = ?,
               style_json     = ?,
               region_tag     = ?,
               language       = ?,
               archetype_tag  = ?,
               is_default     = ?,
               input_hash     = ?,
               model_used     = ?,
               tokens_input   = ?,
               tokens_output  = ?,
               updated_at     = datetime('now')
             WHERE id = ?
             RETURNING *",
        )
        .bind(input.doc_type)
        .bind(input.source)
        .bind(input.label)
        .bind(input.content_json)
        .bind(input.file_path)
        .bind(input.template_id)
        .bind(input.style_json)
        .bind(input.region_tag)
        .bind(input.language)
        .bind(input.archetype_tag)
        .bind(is_default)
        .bind(input.input_hash)
        .bind(input.model_used)
        .bind(input.tokens_input)
        .bind(input.tokens_output)
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("document_library_upsert (update): {e}")),
        None => sqlx::query_as::<_, DocumentLibraryItem>(
            "INSERT INTO document_library
               (doc_type, source, label, content_json, file_path, template_id,
                style_json, region_tag, language, archetype_tag, is_default,
                input_hash, model_used, tokens_input, tokens_output,
                created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
             RETURNING *",
        )
        .bind(input.doc_type)
        .bind(input.source)
        .bind(input.label)
        .bind(input.content_json)
        .bind(input.file_path)
        .bind(input.template_id)
        .bind(input.style_json)
        .bind(input.region_tag)
        .bind(input.language)
        .bind(input.archetype_tag)
        .bind(is_default)
        .bind(input.input_hash)
        .bind(input.model_used)
        .bind(input.tokens_input)
        .bind(input.tokens_output)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("document_library_upsert (insert): {e}")),
    }
}

#[tauri::command]
pub async fn document_library_delete(id: i64, db: State<'_, Db>) -> Result<(), String> {
    document_library_delete_core(id, &db.pool).await
}

async fn document_library_delete_core(id: i64, pool: &sqlx::SqlitePool) -> Result<(), String> {
    sqlx::query("DELETE FROM document_library WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("document_library_delete: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::SqlitePool;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .expect("open in-memory sqlite");
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("run migrations");
        pool
    }

    /// The five built-in templates seeded by the migration round-trip through
    /// the list command.
    #[tokio::test]
    async fn builtin_cv_templates_are_seeded_and_listed() {
        let pool = test_pool().await;
        let templates = cv_templates_list_core(&pool).await.expect("list");
        assert_eq!(templates.len(), 5);
        assert!(templates.iter().all(|t| t.is_builtin));
        assert!(templates
            .iter()
            .any(|t| t.name.as_deref() == Some("DE-traditional")));
    }

    /// Migration 0013 backfills `personal_details` into the built-in
    /// templates that 0011 seeded without it (DE-ATS-modern/US/UK/generic),
    /// so every generated CV has a name section. DE-traditional was already
    /// correct and must be left untouched (photo still first).
    #[tokio::test]
    async fn migration_0013_adds_personal_details_to_builtin_templates() {
        let pool = test_pool().await;
        let rows: Vec<(String, String)> =
            sqlx::query_as("SELECT name, sections_json FROM cv_templates WHERE is_builtin = 1")
                .fetch_all(&pool)
                .await
                .unwrap();
        for (name, sections) in &rows {
            assert!(
                sections.contains("personal_details"),
                "built-in template {name} still lacks personal_details: {sections}"
            );
        }
        for name in ["US", "UK", "generic", "DE-ATS-modern"] {
            let (_, sections) = rows.iter().find(|(n, _)| n == name).unwrap();
            assert!(
                sections.starts_with("[\"personal_details\""),
                "built-in template {name} does not have personal_details first: {sections}"
            );
        }
        let de_trad = rows.iter().find(|(n, _)| n == "DE-traditional").unwrap();
        assert!(de_trad.1.starts_with("[\"photo\""));
    }

    fn cv_input(template_id: i64) -> UpsertDocumentLibraryItemInput {
        UpsertDocumentLibraryItemInput {
            id: None,
            doc_type: "cv".to_string(),
            source: "generated".to_string(),
            label: Some("DE baseline CV".to_string()),
            content_json: Some(r#"{"sections":[]}"#.to_string()),
            file_path: None,
            template_id: Some(template_id),
            style_json: None,
            region_tag: Some("de".to_string()),
            language: Some("de".to_string()),
            archetype_tag: None,
            is_default: Some(true),
            input_hash: Some("hash-1".to_string()),
            model_used: Some("claude-sonnet-5".to_string()),
            tokens_input: Some(500),
            tokens_output: Some(300),
        }
    }

    /// Insert then read back a `document_library` row — the round-trip
    /// required by the 1a acceptance criteria.
    #[tokio::test]
    async fn document_library_insert_and_read_round_trip() {
        let pool = test_pool().await;
        let templates = cv_templates_list_core(&pool).await.expect("list templates");
        let template_id = templates[0].id;

        let created = document_library_upsert_core(cv_input(template_id), &pool)
            .await
            .expect("insert");
        assert_eq!(created.doc_type, "cv");
        assert!(created.is_default);

        let fetched = document_library_get_core(created.id, &pool)
            .await
            .expect("get")
            .expect("row exists");
        assert_eq!(fetched.label.as_deref(), Some("DE baseline CV"));
        assert_eq!(fetched.template_id, Some(template_id));
    }

    /// Upserting with an existing id updates in place rather than inserting a
    /// second row.
    #[tokio::test]
    async fn document_library_upsert_with_id_updates_existing_row() {
        let pool = test_pool().await;
        let templates = cv_templates_list_core(&pool).await.expect("list templates");
        let template_id = templates[0].id;

        let created = document_library_upsert_core(cv_input(template_id), &pool)
            .await
            .expect("insert");

        let mut update = cv_input(template_id);
        update.id = Some(created.id);
        update.label = Some("Renamed CV".to_string());

        let updated = document_library_upsert_core(update, &pool)
            .await
            .expect("update");
        assert_eq!(updated.id, created.id);
        assert_eq!(updated.label.as_deref(), Some("Renamed CV"));

        let all = document_library_list_core(Some("cv".to_string()), &pool)
            .await
            .expect("list");
        assert_eq!(all.len(), 1);
    }

    /// Deleting removes the row and a subsequent get returns None.
    #[tokio::test]
    async fn document_library_delete_removes_row() {
        let pool = test_pool().await;
        let templates = cv_templates_list_core(&pool).await.expect("list templates");
        let template_id = templates[0].id;

        let created = document_library_upsert_core(cv_input(template_id), &pool)
            .await
            .expect("insert");

        document_library_delete_core(created.id, &pool)
            .await
            .expect("delete");

        let gone = document_library_get_core(created.id, &pool)
            .await
            .expect("get");
        assert!(gone.is_none());
    }

    /// Existing `applications` rows survive the additive migration, and the
    /// new FK columns default to NULL (frozen snapshot columns untouched).
    #[tokio::test]
    async fn applications_table_gets_nullable_document_fk_columns() {
        let pool = test_pool().await;
        let job_id = sqlx::query_scalar::<_, i64>(
            "INSERT INTO jobs (company, title, jd_text, jd_hash, created_at) VALUES ('Acme', 'Engineer', 'jd', 'hash1', datetime('now')) RETURNING id",
        )
        .fetch_one(&pool)
        .await
        .expect("insert job");

        let app = sqlx::query_as::<_, (Option<i64>, Option<i64>, Option<String>)>(
            "INSERT INTO applications (job_id, status, doc_language, updated_at)
             VALUES (?, 'saved', 'en', datetime('now'))
             RETURNING cv_document_id, cover_letter_document_id, cv_path",
        )
        .bind(job_id)
        .fetch_one(&pool)
        .await
        .expect("insert application");

        assert_eq!(app.0, None);
        assert_eq!(app.1, None);
        assert_eq!(app.2, None);
    }

    fn custom_template_input(id: Option<i64>) -> UpsertCvTemplateInput {
        UpsertCvTemplateInput {
            id,
            name: "My arrangement".to_string(),
            region_tag: Some("de".to_string()),
            sections_json: r#"["summary","experience","skills"]"#.to_string(),
            include_photo: false,
            include_birthdate: false,
            include_marital_status: false,
        }
    }

    #[tokio::test]
    async fn cv_template_upsert_inserts_as_non_builtin() {
        let pool = test_pool().await;
        let created = cv_template_upsert_core(custom_template_input(None), &pool)
            .await
            .expect("insert custom template");
        assert!(!created.is_builtin);
        assert_eq!(created.name.as_deref(), Some("My arrangement"));

        let templates = cv_templates_list_core(&pool).await.expect("list");
        assert_eq!(templates.len(), 6);
    }

    #[tokio::test]
    async fn cv_template_upsert_with_id_updates_existing_custom_template() {
        let pool = test_pool().await;
        let created = cv_template_upsert_core(custom_template_input(None), &pool)
            .await
            .expect("insert");

        let mut update = custom_template_input(Some(created.id));
        update.name = "Renamed arrangement".to_string();
        let updated = cv_template_upsert_core(update, &pool)
            .await
            .expect("update");
        assert_eq!(updated.id, created.id);
        assert_eq!(updated.name.as_deref(), Some("Renamed arrangement"));

        let templates = cv_templates_list_core(&pool).await.expect("list");
        assert_eq!(templates.len(), 6);
    }

    #[tokio::test]
    async fn cv_template_upsert_cannot_overwrite_a_builtin_template() {
        let pool = test_pool().await;
        let builtin_id = cv_templates_list_core(&pool)
            .await
            .expect("list")
            .into_iter()
            .find(|t| t.is_builtin)
            .expect("a builtin exists")
            .id;

        let result = cv_template_upsert_core(custom_template_input(Some(builtin_id)), &pool).await;
        assert!(result.is_err());
    }

    /// Round-trips a minimal in-memory DOCX (written with the same `docx-rs`
    /// crate used to read it) through `read_docx_text`, since the on-disk
    /// fixture path can't easily hold a binary file in this test module.
    #[test]
    fn read_docx_text_extracts_paragraph_text() {
        use docx_rs::*;

        let dir = std::env::temp_dir().join(format!(
            "applye-cv-import-test-{:?}",
            std::thread::current().id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("cv.docx");

        Docx::new()
            .add_paragraph(Paragraph::new().add_run(Run::new().add_text("Jane Doe")))
            .add_paragraph(Paragraph::new().add_run(Run::new().add_text("Backend Engineer")))
            .build()
            .pack(std::fs::File::create(&path).unwrap())
            .expect("write test docx");

        let text = read_docx_text(path.to_str().unwrap()).expect("read docx");
        assert!(text.contains("Jane Doe"));
        assert!(text.contains("Backend Engineer"));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn cv_import_read_file_rejects_unsupported_extensions() {
        let result = cv_import_read_file("resume.txt".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn cv_content_to_markdown_renders_visible_sections_in_order() {
        let content_json = r#"{"sections":[
            {"key":"summary","order":1,"visible":true,"text":"Backend engineer."},
            {"key":"personal_details","order":0,"visible":true,"fullName":"Jane Doe","email":"jane@example.com"},
            {"key":"experience","order":2,"visible":true,"entries":[{"company":"Acme","role":"Engineer","startDate":"2020","endDate":"2023","bullets":["Built things"]}]},
            {"key":"skills","order":3,"visible":false,"items":["Rust"]}
        ]}"#;
        let md = cv_content_to_markdown(content_json).expect("render");
        assert!(md.find("Jane Doe").unwrap() < md.find("Backend engineer.").unwrap());
        assert!(md.find("Backend engineer.").unwrap() < md.find("Acme").unwrap());
        assert!(!md.contains("Rust"), "hidden section must not render");
    }

    #[test]
    fn cv_content_to_markdown_renders_grouped_skills_when_items_absent() {
        let content_json = r#"{"sections":[
            {"key":"skills","order":0,"visible":true,"groups":[
                {"label":"Languages","values":["TypeScript","Angular"]}
            ]}
        ]}"#;
        let md = cv_content_to_markdown(content_json).expect("render");
        assert!(md.contains("## Skills"));
        assert!(md.contains("**Languages:** TypeScript, Angular"));
    }

    #[tokio::test]
    async fn cv_document_export_writes_docx_and_pdf_bytes() {
        let pool = test_pool().await;
        let templates = cv_templates_list_core(&pool).await.expect("list templates");
        let mut input = cv_input(templates[0].id);
        input.content_json = Some(
            r#"{"sections":[{"key":"summary","order":0,"visible":true,"text":"Summary text."}]}"#
                .to_string(),
        );
        let doc = document_library_upsert_core(input, &pool)
            .await
            .expect("insert");

        let dir = std::env::temp_dir().join(format!(
            "applye-cv-export-test-{:?}",
            std::thread::current().id()
        ));
        std::fs::create_dir_all(&dir).unwrap();

        for format in ["docx", "pdf", "tex"] {
            let save_path = dir.join(format!("cv.{format}"));
            let bytes = cv_document_export_bytes_core(doc.id, format, &pool)
                .await
                .expect("export bytes");
            std::fs::write(&save_path, &bytes).expect("write");
            assert!(!bytes.is_empty());
            assert!(save_path.exists());
        }

        let unsupported = cv_document_export_bytes_core(doc.id, "xyz", &pool).await;
        assert!(unsupported.is_err());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn cv_content_to_tex_escapes_special_characters_and_hides_invisible_sections() {
        let content_json = r#"{"sections":[
            {"key":"personal_details","order":0,"visible":true,"fullName":"Jane & Doe","email":"jane@example.com"},
            {"key":"summary","order":1,"visible":true,"text":"Grew revenue 50% using C# & R&D budget."},
            {"key":"skills","order":2,"visible":false,"items":["Rust"]}
        ]}"#;
        let tex = cv_content_to_tex(content_json).expect("render");
        assert!(tex.starts_with("\\documentclass"));
        assert!(tex.contains("\\end{document}"));
        assert!(tex.contains("Jane \\& Doe"));
        assert!(tex.contains("50\\%"));
        assert!(!tex.contains("Rust"), "hidden section must not render");
    }

    #[test]
    fn check_style_safety_is_quiet_on_the_safe_default() {
        assert!(check_style_safety_core(None).is_empty());
        let safe = r##"{"fontFamily":"Calibri","fontSizePt":11,"accentColorHex":"#333333"}"##;
        assert!(check_style_safety_core(Some(safe.to_string())).is_empty());
    }

    #[test]
    fn check_style_safety_flags_bad_per_section_override() {
        let json = r##"{"fontFamily":"Calibri","fontSizePt":11,"accentColorHex":"#333333","fontWeight":400,
            "sectionStyles":{"summary":{"fontSizePt":20.0,"colorHex":"#eeeeee"}}}"##;
        let notes = check_style_safety_core(Some(json.to_string()));
        assert!(notes.iter().any(|n| n.kind == "size_out_of_range"));
        assert!(notes.iter().any(|n| n.kind == "color_readability_risk"));
    }

    #[test]
    fn check_style_safety_flags_light_weight() {
        let json = r##"{"fontFamily":"Calibri","fontSizePt":11,"accentColorHex":"#333333","fontWeight":300}"##;
        let notes = check_style_safety_core(Some(json.to_string()));
        assert!(notes.iter().any(|n| n.kind == "weight_unavailable_risk"));
    }

    #[test]
    fn check_style_safety_quiet_on_safe_per_section() {
        let json = r##"{"fontFamily":"Calibri","fontSizePt":11,"accentColorHex":"#333333","fontWeight":700,
            "sectionStyles":{"skills":{"fontFamily":"Arial","fontWeight":600}}}"##;
        assert!(check_style_safety_core(Some(json.to_string())).is_empty());
    }

    #[test]
    fn check_style_safety_flags_risky_font_size_and_colour_independently() {
        let risky =
            r##"{"fontFamily":"Comic Sans MS","fontSizePt":18,"accentColorHex":"#FFFF66"}"##;
        let notes = check_style_safety_core(Some(risky.to_string()));
        let kinds: Vec<&str> = notes.iter().map(|n| n.kind.as_str()).collect();
        assert!(kinds.contains(&"font_ats_risk"));
        assert!(kinds.contains(&"size_out_of_range"));
        assert!(kinds.contains(&"color_readability_risk"));
        assert_eq!(notes.len(), 3);
    }

    #[test]
    fn check_style_safety_accepts_every_curated_safe_font_case_insensitively() {
        for font in ATS_SAFE_FONTS {
            let style = format!(
                r##"{{"fontFamily":"{}","fontSizePt":11,"accentColorHex":"#333333"}}"##,
                font.to_uppercase()
            );
            let notes = check_style_safety_core(Some(style));
            assert!(notes.is_empty(), "{font} should not be flagged");
        }
    }

    #[test]
    fn check_style_safety_ignores_a_malformed_hex_colour_instead_of_erroring() {
        let malformed =
            r#"{"fontFamily":"Calibri","fontSizePt":11,"accentColorHex":"not-a-color"}"#;
        let notes = check_style_safety_core(Some(malformed.to_string()));
        assert!(notes.iter().all(|n| n.kind != "color_readability_risk"));
    }
}

#[cfg(test)]
mod photo_tests {
    use super::*;

    #[test]
    fn detects_png_mime_and_encodes() {
        // 1x1 transparent PNG
        let png: &[u8] = &[
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
            0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78,
            0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        let uri = bytes_to_data_uri(png);
        assert!(uri.starts_with("data:image/png;base64,"));
    }

    #[test]
    fn decodes_data_uri_to_bytes() {
        let uri = "data:image/png;base64,AAAA";
        let bytes = data_uri_to_bytes(uri).unwrap();
        assert_eq!(bytes, vec![0, 0, 0]);
    }
}
