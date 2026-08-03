// Documents library (ROADMAP §16): the live, editable CV / Cover-Letter
// library - distinct from `generated_docs`, which stays the export journal.
// `content_json` is a serialized JSON string whose shape is locked as a typed
// contract in `libs/core` (`CvContent` for `doc_type = 'cv'`,
// `CoverLetterContent` for `doc_type = 'cover_letter'`) so the 1b/1c UI
// modules build against a stable structure. This module (1a) only stores and
// returns it opaquely, same convention as other `*_json` columns in this
// codebase (e.g. `scoring_cache.dimensions_json`).
//
// `applications.cv_path` / `cover_letter_path` stay the frozen apply-time
// snapshot and are never touched here.

use super::documents_blocks::{cover_letter_content_to_blocks, cv_content_to_blocks};
use super::documents_import::data_uri_to_bytes;
use super::documents_style::{CvStyle, PhotoPlacement};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;

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
/// `is_builtin = 0` - the five seeded presets are the only builtins and are
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

/// Localized section heading, mirroring the preview's
/// `t(sectionLabelKey(key))`. Only `en` and `de` define `cv_section_*` in the
/// i18n table (`translations.ts`); every other locale renders the English
/// label, so this table does the same: `de` → German, otherwise English.
pub(super) fn section_heading(key: &str, lang: Option<&str>) -> String {
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

/// Exports a library CV to a user-chosen path as DOCX or PDF. This is a
/// library export, distinct from the job-specific `generated_docs` journal
/// (`export_docx`/`export_pdf` in `commands::tailoring`) - it never touches
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

/// Effective export style - mirrors the TS load-time merge
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
    // seed - resolved together so the export matches the live preview's
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

    /// Insert then read back a `document_library` row - the round-trip
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
        // No style_json → pure theme seed (Lato 10pt, accent green) - the
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
}
