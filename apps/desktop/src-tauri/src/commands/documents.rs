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
            // "photo" has no plain LaTeX representation in this string-templated renderer.
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
}

impl Default for CvStyle {
    fn default() -> Self {
        Self {
            font_family: Self::default_font_family(),
            font_size_pt: Self::default_font_size_pt(),
            accent_color_hex: Self::default_accent_color_hex(),
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

    if !ATS_SAFE_FONTS.contains(&style.font_family.trim().to_lowercase().as_str()) {
        notes.push(StyleNote {
            kind: "font_ats_risk".to_string(),
            detail: style.font_family.clone(),
        });
    }
    if !(9.0..=13.0).contains(&style.font_size_pt) {
        notes.push(StyleNote {
            kind: "size_out_of_range".to_string(),
            detail: format!("{}", style.font_size_pt),
        });
    }
    if is_low_print_contrast(&style.accent_color_hex) {
        notes.push(StyleNote {
            kind: "color_readability_risk".to_string(),
            detail: style.accent_color_hex.clone(),
        });
    }
    notes
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
    let content_json = doc
        .content_json
        .ok_or_else(|| "cv_document_export: document has no content".to_string())?;
    match format {
        "docx" => {
            crate::commands::tailoring::md_to_docx_bytes(&cv_content_to_markdown(&content_json)?)
        }
        "pdf" => {
            crate::commands::tailoring::md_to_pdf_bytes(&cv_content_to_markdown(&content_json)?)
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
    let content_json = doc
        .content_json
        .ok_or_else(|| "cover_letter_document_export: document has no content".to_string())?;
    match format {
        "docx" => crate::commands::tailoring::md_to_docx_bytes(&cover_letter_content_to_markdown(
            &content_json,
        )?),
        "pdf" => crate::commands::tailoring::md_to_pdf_bytes(&cover_letter_content_to_markdown(
            &content_json,
        )?),
        other => Err(format!(
            "cover_letter_document_export: unsupported format '{other}'"
        )),
    }
}

fn cover_letter_content_to_markdown(content_json: &str) -> Result<String, String> {
    let parsed: serde_json::Value = serde_json::from_str(content_json)
        .map_err(|e| format!("cover_letter_content_to_markdown: invalid json: {e}"))?;

    let mut md = String::new();

    if let Some(addr) = parsed.get("address") {
        if let Some(name) = addr.get("recipientName").and_then(|v| v.as_str()) {
            if !name.is_empty() {
                md.push_str(&format!("{name}\n"));
            }
        }
        if let Some(comp) = addr.get("company").and_then(|v| v.as_str()) {
            if !comp.is_empty() {
                md.push_str(&format!("{comp}\n"));
            }
        }
        if let Some(street) = addr.get("street").and_then(|v| v.as_str()) {
            if !street.is_empty() {
                md.push_str(&format!("{street}\n"));
            }
        }
        let pc = addr
            .get("postalCode")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let city = addr.get("city").and_then(|v| v.as_str()).unwrap_or("");
        if !pc.is_empty() || !city.is_empty() {
            md.push_str(&format!("{pc} {city}\n").trim());
        }
        if let Some(country) = addr.get("country").and_then(|v| v.as_str()) {
            if !country.is_empty() {
                md.push_str(&format!("{country}\n"));
            }
        }
    }

    if !md.is_empty() {
        md.push_str("\n");
    }

    if let Some(date) = parsed.get("date").and_then(|v| v.as_str()) {
        if !date.is_empty() {
            md.push_str(&format!("{date}\n\n"));
        }
    }

    if let Some(subject) = parsed.get("subject").and_then(|v| v.as_str()) {
        if !subject.is_empty() {
            md.push_str(&format!("**{subject}**\n\n"));
        }
    }

    if let Some(greeting) = parsed.get("greeting").and_then(|v| v.as_str()) {
        if !greeting.is_empty() {
            md.push_str(&format!("{greeting}\n\n"));
        }
    }

    if let Some(paras) = parsed.get("bodyParagraphs").and_then(|v| v.as_array()) {
        for para in paras {
            if let Some(p_str) = para.as_str() {
                if !p_str.is_empty() {
                    md.push_str(&format!("{p_str}\n\n"));
                }
            }
        }
    }

    let closing = parsed.get("closing").and_then(|v| v.as_str()).unwrap_or("");
    let sig = parsed
        .get("signature")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if !closing.is_empty() {
        md.push_str(&format!("{closing}\n\n"));
    }
    if !sig.is_empty() {
        md.push_str(&format!("{sig}\n"));
    }

    Ok(md)
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
