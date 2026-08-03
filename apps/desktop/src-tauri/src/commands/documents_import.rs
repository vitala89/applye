// Reading a CV, or a CV photo, out of a file the user picked. Split out of
// `documents`, which owns the library rows: nothing here touches the database
// and nothing here is a document yet. Both readers are deterministic and free -
// the parse into sections is the `cv-import` skill's job, one cached AI call
// later, and it never sees this module.
//
// The DOCX and PDF readers run untrusted, user-supplied files through third
// party parsers, so both go through `catch_parser_panic`.

use crate::commands::untrusted::catch_parser_panic;
use crate::db::stable_hash;
use base64::Engine as _;
use serde::Serialize;

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
/// its plain text. No parsing into sections happens here - that is the
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
pub(super) fn data_uri_to_bytes(uri: &str) -> Option<Vec<u8>> {
    let comma = uri.find(',')?;
    let b64 = &uri[comma + 1..];
    base64::engine::general_purpose::STANDARD.decode(b64).ok()
}

/// Reads a picked CV photo file and returns it as a base64 data URI for
/// inline storage/preview - no separate asset file, matches the
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
    let docx = catch_parser_panic("read_docx_text", || docx_rs::read_docx(&bytes))?
        .map_err(|e| format!("read_docx_text: {e}"))?;

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
    let text = catch_parser_panic("read_pdf_text", || pdf_extract::extract_text(path))?
        .map_err(|e| format!("read_pdf_text: {e}"))?;
    if text.trim().is_empty() {
        return Err("read_pdf_text: no extractable text found".into());
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

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
