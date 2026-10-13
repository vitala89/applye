//! Library-document export workflow. Turns one stored row into DOCX or PDF
//! bytes by calling the existing tailoring renderers. Writing the chosen path
//! and remembering it for Open/Reveal stays in the Tauri command, because that
//! step uses `ExportedPaths`.
//!
//! This is the library export, distinct from the job-specific `generated_docs`
//! journal. It never touches `applications.cv_path`.

use super::files::data_uri_to_bytes;
use super::persistence::{self, DocumentLibraryItem};
use crate::commands::documents_blocks::{cover_letter_content_to_blocks, cv_content_to_blocks};
use crate::commands::documents_style::{CvStyle, PhotoPlacement};

/// Effective export style - mirrors the TS load-time merge
/// `{ ...CV_STYLE_DEFAULT, ...themeStyleSeed(theme), ...styleJson }`: the theme
/// seed (font/size/weight/accent) is the base, and only the fields the user
/// actually persisted in `style_json` override it. Serde's field defaults can't
/// express "absent → theme seed" (they force Calibri/#333, which is exactly the
/// wrong-font bug), so this reads the raw JSON and overlays only present keys.
fn resolve_export_style(
    style_json: Option<&str>,
    theme: &crate::commands::tailoring_theme::CvTheme,
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

async fn load_document(
    id: i64,
    pool: &sqlx::SqlitePool,
    label: &str,
) -> Result<DocumentLibraryItem, String> {
    persistence::get(id, pool)
        .await?
        .ok_or_else(|| format!("{label}: document not found"))
}

pub(crate) async fn export_cv_bytes(
    id: i64,
    format: &str,
    pool: &sqlx::SqlitePool,
) -> Result<Vec<u8>, String> {
    let doc = load_document(id, pool, "cv_document_export").await?;
    // The user's style choices live in `style_json`, over the selected theme's
    // seed - resolved together so the export matches the live preview's
    // effective style. Read before moving `content_json` out of `doc`.
    let theme = crate::commands::tailoring_theme::builtin_theme(doc.theme_id);
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
            let page = crate::commands::tailoring_page::resolve_page(&style.page);
            if format == "docx" {
                crate::commands::tailoring_docx::render_blocks_docx(
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

pub(crate) async fn export_cover_letter_bytes(
    id: i64,
    format: &str,
    pool: &sqlx::SqlitePool,
) -> Result<Vec<u8>, String> {
    let doc = load_document(id, pool, "cover_letter_document_export").await?;
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
            let page = crate::commands::tailoring_page::resolve_page(&style.page);
            if format == "docx" {
                crate::commands::tailoring_docx::render_blocks_docx(
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

#[cfg(test)]
mod tests {
    use super::super::persistence::tests::{cv_input, test_pool};
    use super::super::persistence::{list_templates, upsert};
    use super::*;

    #[test]
    fn resolve_export_style_seeds_from_theme_then_overrides() {
        use crate::commands::tailoring_theme::builtin_theme;
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

    #[tokio::test]
    async fn cv_document_export_writes_docx_and_pdf_bytes() {
        let pool = test_pool().await;
        let templates = list_templates(&pool).await.expect("list templates");
        let mut input = cv_input(templates[0].id);
        input.content_json = Some(
            r#"{"sections":[{"key":"summary","order":0,"visible":true,"text":"Summary text."}]}"#
                .to_string(),
        );
        let doc = upsert(input, &pool).await.expect("insert");

        let dir = std::env::temp_dir().join(format!(
            "applye-cv-export-test-{:?}",
            std::thread::current().id()
        ));
        std::fs::create_dir_all(&dir).unwrap();

        for format in ["docx", "pdf"] {
            let save_path = dir.join(format!("cv.{format}"));
            let bytes = export_cv_bytes(doc.id, format, &pool)
                .await
                .expect("export bytes");
            std::fs::write(&save_path, &bytes).expect("write");
            assert!(!bytes.is_empty());
            assert!(save_path.exists());
        }

        let unsupported = export_cv_bytes(doc.id, "xyz", &pool).await;
        assert!(unsupported.is_err());

        std::fs::remove_dir_all(&dir).ok();
    }
}
