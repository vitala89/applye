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
    pub theme_id: Option<i64>,
    pub style_json: Option<String>,
    pub region_tag: Option<String>,
    pub language: Option<String>,
    pub archetype_tag: Option<String>,
    pub is_default: bool,
    /// True while this row is an uncommitted apply-wizard draft. Drafts are
    /// hidden from every library list until committed at Export & Apply.
    pub is_application_draft: bool,
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
    pub theme_id: Option<i64>,
    pub style_json: Option<String>,
    pub region_tag: Option<String>,
    pub language: Option<String>,
    pub archetype_tag: Option<String>,
    pub is_default: Option<bool>,
    /// `Some(true)` marks a new/regenerated apply-wizard draft; `None` leaves an
    /// existing row's draft flag untouched (the document editor saves without
    /// this field, so a Review edit must never un-draft the row).
    pub is_application_draft: Option<bool>,
    pub input_hash: Option<String>,
    pub model_used: Option<String>,
    pub tokens_input: Option<i64>,
    pub tokens_output: Option<i64>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Copy, Default, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
// Variant names are the serialized wire format shared with the Angular side;
// renaming them to satisfy the lint would break stored CV templates.
#[allow(clippy::enum_variant_names)]
pub enum PhotoPlacement {
    #[default]
    AboveLeft,
    AboveCenter,
    AboveRight,
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
/// Structured, section-tagged block list for the
/// styled DOCX/PDF exporters: same section walk, but each line is emitted as a
/// `StyledBlock` carrying its `CvSectionKey` so the renderer can apply that
/// section's effective style. Section titles stay in English (export
/// convention), matching the markdown path.
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

fn cv_content_to_blocks(
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
                // Position/title line (bold, dark) — mirrors the editor's
                // `.cvpreview__title` under the name.
                if let Some(title) = str_field("title") {
                    out.push(block(BlockLevel::Body, "personal_details", title, true));
                }
                // Contact line — same fields, order, and " | " separator as the
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
                        let dates = format!("{start} – {end}");
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
                        let dates = format!("{start} – {end}");
                        let dates = dates.trim();
                        // Two-column: degree/institution left, dates right —
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
    /// Document-wide body-text colour (mirrors the TS `CvStyle.bodyColorHex`).
    /// Distinct from `accent_color_hex`: body text reads this (or dark), never
    /// the accent — the no-accent-leak rule the export previously ignored.
    #[serde(default)]
    pub body_color_hex: Option<String>,
    #[serde(default)]
    pub section_styles: std::collections::HashMap<String, CvSectionStyle>,
    #[serde(default)]
    pub page: PageSettings,
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
            body_color_hex: None,
            section_styles: Default::default(),
            page: Default::default(),
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

/// Page geometry (portrait) stored in `style_json`. String fields (not enums)
/// so an unknown/legacy value deserializes cleanly and falls back at resolve
/// time rather than erroring, matching the rest of `CvStyle`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageMargins {
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
    pub left: f32,
}

/// Margin as stored: legacy preset string ("narrow"|"normal"|"wide") OR a
/// 4-side mm object. `resolve_page` normalises both to clamped mm.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MarginSpec {
    Preset(String),
    Sides(PageMargins),
}

impl Default for MarginSpec {
    fn default() -> Self {
        MarginSpec::Preset("normal".into())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageSettings {
    #[serde(default = "PageSettings::default_size")]
    pub size: String,
    #[serde(default)]
    pub margin: MarginSpec,
}

impl PageSettings {
    fn default_size() -> String {
        "a4".into()
    }
}

impl Default for PageSettings {
    fn default() -> Self {
        PageSettings {
            size: Self::default_size(),
            margin: MarginSpec::default(),
        }
    }
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

/// Hard validator for an uploaded CvThemeDescriptor (future upload/marketplace
/// path). Returns a note per problem; empty = safe to store. Built-in themes
/// always pass. Deliberately strict: rejects malformed hex, out-of-range
/// numerics, and unknown enum values so untrusted descriptors cannot smuggle
/// unexpected values into the render path.
#[tauri::command]
pub fn validate_theme(descriptor_json: Option<String>) -> Vec<StyleNote> {
    validate_theme_core(descriptor_json)
}

fn is_hex_color(s: &str) -> bool {
    let b = s.as_bytes();
    (b.len() == 4 || b.len() == 7) && b[0] == b'#' && b[1..].iter().all(|c| c.is_ascii_hexdigit())
}

fn validate_theme_core(descriptor_json: Option<String>) -> Vec<StyleNote> {
    let mut notes: Vec<StyleNote> = Vec::new();
    let Some(raw) = descriptor_json else {
        return notes;
    };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) else {
        notes.push(StyleNote {
            kind: "font_ats_risk".into(),
            detail: "malformed theme".into(),
        });
        return notes;
    };
    // hex tokens
    for path in [("tokens", "accentHex"), ("tokens", "mutedHex")] {
        if let Some(s) = v
            .get(path.0)
            .and_then(|o| o.get(path.1))
            .and_then(|x| x.as_str())
        {
            if !is_hex_color(s) {
                notes.push(StyleNote {
                    kind: "color_readability_risk".into(),
                    detail: s.into(),
                });
            }
        }
    }
    // size + weight ranges
    if let Some(sz) = v
        .get("tokens")
        .and_then(|o| o.get("baseSizePt"))
        .and_then(|x| x.as_f64())
    {
        if !(6.0..=18.0).contains(&sz) {
            notes.push(StyleNote {
                kind: "size_out_of_range".into(),
                detail: sz.to_string(),
            });
        }
    }
    if let Some(w) = v
        .get("tokens")
        .and_then(|o| o.get("fontWeight"))
        .and_then(|x| x.as_i64())
    {
        if ![300, 400, 600, 700].contains(&w) {
            notes.push(StyleNote {
                kind: "weight_unavailable_risk".into(),
                detail: w.to_string(),
            });
        }
    }
    // enum membership
    let check_enum = |notes: &mut Vec<StyleNote>, val: Option<&str>, allowed: &[&str]| {
        if let Some(s) = val {
            if !allowed.contains(&s) {
                notes.push(StyleNote {
                    kind: "font_ats_risk".into(),
                    detail: s.into(),
                });
            }
        }
    };
    check_enum(
        &mut notes,
        v.get("header")
            .and_then(|o| o.get("titleColor"))
            .and_then(|x| x.as_str()),
        &["accent", "text"],
    );
    check_enum(
        &mut notes,
        v.get("header")
            .and_then(|o| o.get("contactLayout"))
            .and_then(|x| x.as_str()),
        &["inline-pipe", "stacked"],
    );
    check_enum(
        &mut notes,
        v.get("sectionHeader")
            .and_then(|o| o.get("case"))
            .and_then(|x| x.as_str()),
        &["upper", "none"],
    );
    check_enum(
        &mut notes,
        v.get("sectionHeader")
            .and_then(|o| o.get("color"))
            .and_then(|x| x.as_str()),
        &["accent", "text"],
    );
    check_enum(
        &mut notes,
        v.get("entry")
            .and_then(|o| o.get("companyColor"))
            .and_then(|x| x.as_str()),
        &["accent", "text"],
    );
    check_enum(
        &mut notes,
        v.get("bullets")
            .and_then(|o| o.get("marker"))
            .and_then(|x| x.as_str()),
        &["disc", "textbullet"],
    );
    for k in ["header", "sectionHeader", "entry"] {
        check_enum(
            &mut notes,
            v.get(k)
                .and_then(|o| o.get("ruleColor"))
                .and_then(|x| x.as_str()),
            &["accent", "muted", "none"],
        );
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

/// Effective export style — mirrors the TS load-time merge
/// `{ ...CV_STYLE_DEFAULT, ...themeStyleSeed(theme), ...styleJson }`: the theme
/// seed (font/size/weight/accent) is the base, and only the fields the user
/// actually persisted in `style_json` override it. Serde's field defaults can't
/// express "absent → theme seed" (they force Calibri/#333, which is exactly the
/// wrong-font bug), so this reads the raw JSON and overlays only present keys.
fn resolve_export_style(
    style_json: Option<&str>,
    theme: &crate::commands::tailoring::CvTheme,
) -> CvStyle {
    let v: Option<serde_json::Value> = style_json.and_then(|s| serde_json::from_str(s).ok());
    let field = |k: &str| v.as_ref().and_then(|o| o.get(k));
    let (ar, ag, ab) = theme.accent_rgb;
    CvStyle {
        font_family: field("fontFamily")
            .and_then(|x| x.as_str())
            .map(str::to_string)
            .unwrap_or_else(|| theme.font_family.clone()),
        font_size_pt: field("fontSizePt")
            .and_then(|x| x.as_f64())
            .unwrap_or(theme.base_size_pt),
        accent_color_hex: field("accentColorHex")
            .and_then(|x| x.as_str())
            .map(str::to_string)
            .unwrap_or_else(|| format!("#{ar:02X}{ag:02X}{ab:02X}")),
        font_weight: field("fontWeight")
            .and_then(|x| x.as_i64())
            .unwrap_or(theme.font_weight),
        body_color_hex: field("bodyColorHex")
            .and_then(|x| x.as_str())
            .map(str::to_string),
        section_styles: field("sectionStyles")
            .and_then(|x| serde_json::from_value(x.clone()).ok())
            .unwrap_or_default(),
        page: field("page")
            .and_then(|x| serde_json::from_value(x.clone()).ok())
            .unwrap_or_default(),
    }
}

pub(crate) async fn cv_document_export_bytes_core(
    id: i64,
    format: &str,
    pool: &sqlx::SqlitePool,
) -> Result<Vec<u8>, String> {
    let doc = document_library_get_core(id, pool)
        .await?
        .ok_or_else(|| "cv_document_export: document not found".to_string())?;
    // The user's style choices live in `style_json`, over the selected theme's
    // seed — resolved together so the export matches the live preview's
    // effective style. Read before moving `content_json` out of `doc`.
    let theme = crate::commands::tailoring::builtin_theme(doc.theme_id);
    let style = resolve_export_style(doc.style_json.as_deref(), &theme);
    // Section headings follow the document's language, like the preview.
    let lang = doc.language.clone();
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

    // Photo placement (above-left/center/right) lives on the `photo` section;
    // a missing/legacy value defaults to `AboveLeft`. Consumed by the DOCX
    // renderer (full float-beside) and the Rust-PDF renderer (center only;
    // left/right approximate as top-of-document). The detail-view WYSIWYG
    // browser-print PDF is the full-fidelity path for all slots.
    let placement: PhotoPlacement = serde_json::from_str::<serde_json::Value>(&content_json)
        .ok()
        .and_then(|v| {
            v.get("sections")
                .and_then(|s| s.as_array())
                .and_then(|sections| {
                    sections
                        .iter()
                        .find(|s| s.get("key").and_then(|k| k.as_str()) == Some("photo"))
                        .and_then(|p| p.get("placement"))
                        .and_then(|p| serde_json::from_value(p.clone()).ok())
                })
        })
        .unwrap_or_default();

    match format {
        "docx" | "pdf" => {
            let blocks = cv_content_to_blocks(&content_json, lang.as_deref())?;
            let resolved = crate::commands::tailoring::resolve_cv_blocks(&style, &theme, &blocks);
            let page = crate::commands::tailoring::resolve_page(&style.page);
            if format == "docx" {
                crate::commands::tailoring::render_blocks_docx(
                    &resolved,
                    photo_bytes.as_deref(),
                    placement,
                    &page,
                )
            } else {
                crate::commands::tailoring::render_blocks_pdf(
                    &resolved,
                    photo_bytes.as_deref(),
                    placement,
                    &page,
                )
            }
        }
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

pub(crate) async fn cover_letter_document_export_bytes_core(
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
            let page = crate::commands::tailoring::resolve_page(&style.page);
            if format == "docx" {
                crate::commands::tailoring::render_blocks_docx(
                    &resolved,
                    None,
                    PhotoPlacement::default(),
                    &page,
                )
            } else {
                crate::commands::tailoring::render_blocks_pdf(
                    &resolved,
                    None,
                    PhotoPlacement::default(),
                    &page,
                )
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
        // Uncommitted apply-wizard drafts (is_application_draft = 1) are hidden
        // from every library list until committed at Export & Apply; Review /
        // editor / export fetch them by id via document_library_get, unfiltered.
        Some(doc_type) => sqlx::query_as::<_, DocumentLibraryItem>(
            "SELECT * FROM document_library
             WHERE doc_type = ? AND is_application_draft = 0
             ORDER BY updated_at DESC",
        )
        .bind(doc_type)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("document_library_list: {e}")),
        None => sqlx::query_as::<_, DocumentLibraryItem>(
            "SELECT * FROM document_library
             WHERE is_application_draft = 0
             ORDER BY updated_at DESC",
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

pub(crate) async fn document_library_get_core(
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
               theme_id       = ?,
               style_json     = ?,
               region_tag     = ?,
               language       = ?,
               archetype_tag  = ?,
               is_default     = ?,
               is_application_draft = COALESCE(?, is_application_draft),
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
        .bind(input.theme_id)
        .bind(input.style_json)
        .bind(input.region_tag)
        .bind(input.language)
        .bind(input.archetype_tag)
        .bind(is_default)
        .bind(input.is_application_draft)
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
                theme_id, style_json, region_tag, language, archetype_tag, is_default,
                is_application_draft, input_hash, model_used, tokens_input, tokens_output,
                created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
             RETURNING *",
        )
        .bind(input.doc_type)
        .bind(input.source)
        .bind(input.label)
        .bind(input.content_json)
        .bind(input.file_path)
        .bind(input.template_id)
        .bind(input.theme_id)
        .bind(input.style_json)
        .bind(input.region_tag)
        .bind(input.language)
        .bind(input.archetype_tag)
        .bind(is_default)
        .bind(input.is_application_draft.unwrap_or(false))
        .bind(input.input_hash)
        .bind(input.model_used)
        .bind(input.tokens_input)
        .bind(input.tokens_output)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("document_library_upsert (insert): {e}")),
    }
}

/// Clears the apply-wizard draft flag on a document, turning it into a normal
/// library entry that shows up in the Documents list. Called at Export & Apply
/// (export success / mark applied) - the moment the user commits to the doc.
#[tauri::command]
pub async fn document_library_commit(
    id: i64,
    db: State<'_, Db>,
) -> Result<Option<DocumentLibraryItem>, String> {
    document_library_commit_core(id, &db.pool).await
}

pub(crate) async fn document_library_commit_core(
    id: i64,
    pool: &sqlx::SqlitePool,
) -> Result<Option<DocumentLibraryItem>, String> {
    sqlx::query_as::<_, DocumentLibraryItem>(
        "UPDATE document_library
         SET is_application_draft = 0, updated_at = datetime('now')
         WHERE id = ?
         RETURNING *",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("document_library_commit: {e}"))
}

#[tauri::command]
pub async fn document_library_delete(id: i64, db: State<'_, Db>) -> Result<(), String> {
    document_library_delete_core(id, &db.pool).await
}

async fn document_library_delete_core(id: i64, pool: &sqlx::SqlitePool) -> Result<(), String> {
    // Clear the references first. `db_upsert_application` COALESCEs the two
    // document ids (so an ordinary save cannot drop a link), which means the
    // frontend has no way to unlink; without this, deleting a linked document
    // leaves the application pointing at a row that no longer exists.
    sqlx::query(
        "UPDATE applications
            SET cv_document_id = CASE WHEN cv_document_id = ? THEN NULL ELSE cv_document_id END,
                cover_letter_document_id = CASE WHEN cover_letter_document_id = ? THEN NULL
                                                ELSE cover_letter_document_id END
          WHERE cv_document_id = ? OR cover_letter_document_id = ?",
    )
    .bind(id)
    .bind(id)
    .bind(id)
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| format!("document_library_delete (unlink): {e}"))?;

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

    /// Deleting a linked document must not leave an application pointing at a
    /// row that no longer exists. The frontend cannot fix this itself:
    /// `db_upsert_application` COALESCEs both document ids, so it can set a
    /// link but never clear one.
    #[tokio::test]
    async fn document_library_delete_unlinks_the_application_that_referenced_it() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO jobs (id, jd_text, jd_hash) VALUES (1, 'jd', 'h1')")
            .execute(&pool)
            .await
            .unwrap();
        let templates = cv_templates_list_core(&pool).await.expect("list templates");
        let cv = document_library_upsert_core(cv_input(templates[0].id), &pool)
            .await
            .expect("insert cv");
        let letter = document_library_upsert_core(
            UpsertDocumentLibraryItemInput {
                doc_type: "cover_letter".to_string(),
                ..cv_input(templates[0].id)
            },
            &pool,
        )
        .await
        .expect("insert letter");
        sqlx::query(
            "INSERT INTO applications (id, job_id, status, cv_document_id, cover_letter_document_id)
             VALUES (1, 1, 'saved', ?, ?)",
        )
        .bind(cv.id)
        .bind(letter.id)
        .execute(&pool)
        .await
        .unwrap();

        document_library_delete_core(cv.id, &pool)
            .await
            .expect("delete cv");

        let (cv_ref, letter_ref): (Option<i64>, Option<i64>) = sqlx::query_as(
            "SELECT cv_document_id, cover_letter_document_id FROM applications WHERE id = 1",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(cv_ref, None, "the deleted CV link must be cleared");
        assert_eq!(
            letter_ref,
            Some(letter.id),
            "an unrelated document link must survive"
        );
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
            theme_id: None,
            style_json: None,
            region_tag: Some("de".to_string()),
            language: Some("de".to_string()),
            archetype_tag: None,
            is_default: Some(true),
            is_application_draft: None,
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

    /// An uncommitted apply-wizard draft is hidden from the library list but
    /// still fetchable by id (Review / editor / export path), and committing it
    /// makes it appear in the list.
    #[tokio::test]
    async fn document_library_draft_is_hidden_until_committed() {
        let pool = test_pool().await;
        let templates = cv_templates_list_core(&pool).await.expect("list templates");
        let mut input = cv_input(templates[0].id);
        input.is_application_draft = Some(true);

        let draft = document_library_upsert_core(input, &pool)
            .await
            .expect("insert draft");
        assert!(draft.is_application_draft);

        // Hidden from the list...
        let listed = document_library_list_core(Some("cv".to_string()), &pool)
            .await
            .expect("list");
        assert!(listed.is_empty(), "draft must not appear in library list");

        // ...but still fetchable by id (Review / export use this path).
        let fetched = document_library_get_core(draft.id, &pool)
            .await
            .expect("get")
            .expect("row exists");
        assert!(fetched.is_application_draft);

        // Committing clears the flag and surfaces it in the list.
        let committed = document_library_commit_core(draft.id, &pool)
            .await
            .expect("commit")
            .expect("row exists");
        assert!(!committed.is_application_draft);

        let listed = document_library_list_core(Some("cv".to_string()), &pool)
            .await
            .expect("list");
        assert_eq!(listed.len(), 1, "committed draft appears in library list");
    }

    /// Updating a draft without passing the flag (the document editor saving a
    /// Review edit) must not un-draft it - COALESCE preserves the flag.
    #[tokio::test]
    async fn document_library_update_preserves_draft_flag_when_omitted() {
        let pool = test_pool().await;
        let templates = cv_templates_list_core(&pool).await.expect("list templates");
        let mut input = cv_input(templates[0].id);
        input.is_application_draft = Some(true);
        let draft = document_library_upsert_core(input, &pool)
            .await
            .expect("insert draft");

        // Editor-style save: same row, no draft flag supplied.
        let mut edit = cv_input(templates[0].id);
        edit.id = Some(draft.id);
        edit.is_application_draft = None;
        edit.label = Some("Edited in review".to_string());
        let updated = document_library_upsert_core(edit, &pool)
            .await
            .expect("update");

        assert!(
            updated.is_application_draft,
            "omitting the flag must not un-draft the row"
        );
        assert_eq!(updated.label.as_deref(), Some("Edited in review"));
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
    fn resolve_export_style_seeds_from_theme_then_overrides() {
        use crate::commands::tailoring::builtin_theme;
        let aurora = builtin_theme(Some(2));
        // No style_json → pure theme seed (Lato 10pt, accent green) — the
        // wrong-font regression guard.
        let seeded = resolve_export_style(None, &aurora);
        assert_eq!(seeded.font_family, "Lato");
        assert_eq!(seeded.font_size_pt, 10.0);
        assert_eq!(seeded.accent_color_hex, "#1B7464");
        assert_eq!(seeded.body_color_hex, None);
        // Explicit style_json fields override the seed; unspecified keep it.
        let json = r##"{"fontFamily":"Georgia","bodyColorHex":"#222222"}"##;
        let merged = resolve_export_style(Some(json), &aurora);
        assert_eq!(
            merged.font_family, "Georgia",
            "explicit font overrides seed"
        );
        assert_eq!(merged.font_size_pt, 10.0, "unspecified size keeps the seed");
        assert_eq!(merged.body_color_hex.as_deref(), Some("#222222"));
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
        assert_eq!(role.text, "Engineer\t2020 – 2023");
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

        for format in ["docx", "pdf"] {
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
    fn check_style_safety_is_quiet_on_the_safe_default() {
        assert!(check_style_safety_core(None).is_empty());
        let safe = r##"{"fontFamily":"Calibri","fontSizePt":11,"accentColorHex":"#333333"}"##;
        assert!(check_style_safety_core(Some(safe.to_string())).is_empty());
    }

    #[test]
    fn validate_theme_accepts_builtin_aurora() {
        let aurora = r##"{"id":2,"name":"Aurora","version":1,"tokens":{"accentHex":"#1B7464","mutedHex":"#666666","fontFamily":"Lato","baseSizePt":10,"fontWeight":400},"header":{"titleColor":"accent","contactLayout":"inline-pipe","ruleWeightPt":0.8,"ruleColor":"accent"},"sectionHeader":{"case":"upper","color":"accent","ruleWeightPt":0.8,"ruleColor":"accent"},"entry":{"companyColor":"accent","roleItalic":true,"showIndustry":true,"ruleWeightPt":0.4,"ruleColor":"muted"},"bullets":{"marker":"textbullet"}}"##;
        assert!(validate_theme_core(Some(aurora.to_string())).is_empty());
    }

    #[test]
    fn validate_theme_flags_bad_hex_and_enum() {
        let bad = r##"{"id":9,"name":"X","version":1,"tokens":{"accentHex":"teal","mutedHex":"#666666","fontFamily":"Lato","baseSizePt":10,"fontWeight":400},"header":{"titleColor":"rainbow","contactLayout":"inline-pipe","ruleWeightPt":0.8,"ruleColor":"accent"},"sectionHeader":{"case":"upper","color":"accent","ruleWeightPt":0.8,"ruleColor":"accent"},"entry":{"companyColor":"accent","roleItalic":true,"showIndustry":true,"ruleWeightPt":0.4,"ruleColor":"muted"},"bullets":{"marker":"textbullet"}}"##;
        let notes = validate_theme_core(Some(bad.to_string()));
        assert!(!notes.is_empty());
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

    #[test]
    fn photo_placement_defaults_and_roundtrips() {
        use super::PhotoPlacement;
        // Missing field → default AboveLeft.
        #[derive(serde::Deserialize)]
        struct Holder {
            #[serde(default)]
            placement: PhotoPlacement,
        }
        let h: Holder = serde_json::from_str("{}").unwrap();
        assert_eq!(h.placement, PhotoPlacement::AboveLeft);
        // snake_case round-trip for each variant.
        for (v, s) in [
            (PhotoPlacement::AboveLeft, "\"above_left\""),
            (PhotoPlacement::AboveCenter, "\"above_center\""),
            (PhotoPlacement::AboveRight, "\"above_right\""),
        ] {
            assert_eq!(serde_json::to_string(&v).unwrap(), s);
            assert_eq!(serde_json::from_str::<PhotoPlacement>(s).unwrap(), v);
        }
    }
}
