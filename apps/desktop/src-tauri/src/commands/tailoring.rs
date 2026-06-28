// CV tailoring — cache CRUD for 3-pass results + DOCX/PDF export.
// Cache key: input_hash covers all inputs for a given pass (including upstream
// pass results), so a different pass-1 output invalidates the pass-2 cache.
// Export: DOCX via docx-rs (ATS-reliable); PDF via printpdf 0.7 (pure Rust).
// Files land in <app_data>/companies/<company>/cv/<hash12>.<ext>.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::db::Db;

// ── Tailoring cache ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TailoringCache {
    pub id: i64,
    pub job_id: i64,
    pub pass: i64,
    pub input_hash: String,
    pub result_md: String,
    pub changes_json: Option<String>,
    pub gaps_json: Option<String>,
    pub model_used: Option<String>,
    pub tokens_input: Option<i64>,
    pub tokens_output: Option<i64>,
    pub created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTailoringInput {
    pub job_id: i64,
    pub pass: i64,
    pub input_hash: String,
    pub result_md: String,
    pub changes_json: String,
    pub gaps_json: String,
    pub model_used: String,
    pub tokens_input: i64,
    pub tokens_output: i64,
}

#[tauri::command]
pub async fn tailoring_cache_get(
    job_id: i64,
    pass: i64,
    input_hash: String,
    db: State<'_, Db>,
) -> Result<Option<TailoringCache>, String> {
    sqlx::query_as::<_, TailoringCache>(
        "SELECT * FROM tailoring_cache WHERE job_id=? AND pass=? AND input_hash=? LIMIT 1",
    )
    .bind(job_id)
    .bind(pass)
    .bind(&input_hash)
    .fetch_optional(&db.pool)
    .await
    .map_err(|e| format!("tailoring_cache_get: {e}"))
}

#[tauri::command]
pub async fn tailoring_cache_save(
    input: SaveTailoringInput,
    db: State<'_, Db>,
) -> Result<TailoringCache, String> {
    sqlx::query(
        "INSERT INTO tailoring_cache
           (job_id, pass, input_hash, result_md, changes_json, gaps_json,
            model_used, tokens_input, tokens_output, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(job_id, pass, input_hash) DO UPDATE SET
           result_md     = excluded.result_md,
           changes_json  = excluded.changes_json,
           gaps_json     = excluded.gaps_json,
           model_used    = excluded.model_used,
           tokens_input  = excluded.tokens_input,
           tokens_output = excluded.tokens_output,
           created_at    = excluded.created_at",
    )
    .bind(input.job_id)
    .bind(input.pass)
    .bind(&input.input_hash)
    .bind(&input.result_md)
    .bind(&input.changes_json)
    .bind(&input.gaps_json)
    .bind(&input.model_used)
    .bind(input.tokens_input)
    .bind(input.tokens_output)
    .execute(&db.pool)
    .await
    .map_err(|e| format!("tailoring_cache_save: {e}"))?;

    sqlx::query_as::<_, TailoringCache>(
        "SELECT * FROM tailoring_cache WHERE job_id=? AND pass=? AND input_hash=? LIMIT 1",
    )
    .bind(input.job_id)
    .bind(input.pass)
    .bind(&input.input_hash)
    .fetch_one(&db.pool)
    .await
    .map_err(|e| format!("tailoring_cache_save reload: {e}"))
}

// ── Generated docs ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedDoc {
    pub id: i64,
    pub job_id: i64,
    pub doc_type: String,
    pub export_format: String,
    pub input_hash: String,
    pub file_path: String,
    pub created_at: Option<String>,
}

#[tauri::command]
pub async fn generated_doc_get(
    job_id: i64,
    input_hash: String,
    export_format: String,
    db: State<'_, Db>,
) -> Result<Option<GeneratedDoc>, String> {
    fetch_generated_doc(job_id, &input_hash, &export_format, &db).await
}

async fn fetch_generated_doc(
    job_id: i64,
    input_hash: &str,
    export_format: &str,
    db: &Db,
) -> Result<Option<GeneratedDoc>, String> {
    sqlx::query_as::<_, GeneratedDoc>(
        "SELECT * FROM generated_docs
         WHERE job_id=? AND input_hash=? AND export_format=? AND doc_type='cv' LIMIT 1",
    )
    .bind(job_id)
    .bind(input_hash)
    .bind(export_format)
    .fetch_optional(&db.pool)
    .await
    .map_err(|e| format!("generated_doc_get: {e}"))
}

async fn upsert_generated_doc(
    job_id: i64,
    input_hash: &str,
    export_format: &str,
    file_path: &str,
    db: &Db,
) -> Result<GeneratedDoc, String> {
    sqlx::query(
        "INSERT OR REPLACE INTO generated_docs
           (job_id, doc_type, export_format, input_hash, file_path, created_at)
         VALUES (?, 'cv', ?, ?, ?, datetime('now'))",
    )
    .bind(job_id)
    .bind(export_format)
    .bind(input_hash)
    .bind(file_path)
    .execute(&db.pool)
    .await
    .map_err(|e| format!("generated_doc upsert: {e}"))?;

    sqlx::query_as::<_, GeneratedDoc>(
        "SELECT * FROM generated_docs
         WHERE job_id=? AND doc_type='cv' AND export_format=? AND input_hash=? LIMIT 1",
    )
    .bind(job_id)
    .bind(export_format)
    .bind(input_hash)
    .fetch_one(&db.pool)
    .await
    .map_err(|e| format!("generated_doc reload: {e}"))
}

/// Kebab-case slug: non-alphanum → hyphen, collapse runs, cap at max_len.
fn readable_slug(s: &str, max_len: usize) -> String {
    let mut out = String::new();
    let mut last_hyphen = true;
    for c in s.chars() {
        if c.is_alphanumeric() {
            out.push(c);
            last_hyphen = false;
        } else if !last_hyphen {
            out.push('-');
            last_hyphen = true;
        }
    }
    let out = out.trim_end_matches('-');
    let cap = out
        .char_indices()
        .nth(max_len)
        .map(|(i, _)| i)
        .unwrap_or(out.len());
    out[..cap].to_string()
}

fn cv_dir(app: &AppHandle, company: &str, title: &str) -> Result<std::path::PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let src = if !company.is_empty() {
        company
    } else if !title.is_empty() {
        title
    } else {
        "Other"
    };
    let dir = base
        .join("companies")
        .join(readable_slug(src, 40))
        .join("cv");
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {e}"))?;
    Ok(dir)
}

fn cv_filename(title: &str, company: &str, hash: &str, ext: &str) -> String {
    let src = if !title.is_empty() {
        title
    } else if !company.is_empty() {
        company
    } else {
        "CV"
    };
    let slug = readable_slug(src, 48);
    let suffix = &hash[..8.min(hash.len())];
    format!("{slug}_{suffix}.{ext}")
}

// ── DOCX export ──────────────────────────────────────────────────────────────

fn md_to_docx_bytes(content_md: &str) -> Result<Vec<u8>, String> {
    use docx_rs::*;

    let mut doc = Docx::new();

    for line in content_md.lines() {
        let para = if let Some(text) = line.strip_prefix("# ") {
            Paragraph::new()
                .add_run(Run::new().add_text(text).bold())
                .style("Heading1")
        } else if let Some(text) = line.strip_prefix("## ") {
            Paragraph::new()
                .add_run(Run::new().add_text(text).bold())
                .style("Heading2")
        } else if let Some(text) = line.strip_prefix("### ") {
            Paragraph::new()
                .add_run(Run::new().add_text(text))
                .style("Heading3")
        } else if let Some(text) = line.strip_prefix("- ").or_else(|| line.strip_prefix("* ")) {
            Paragraph::new()
                .add_run(Run::new().add_text(text))
                .style("ListParagraph")
        } else {
            Paragraph::new().add_run(Run::new().add_text(line))
        };
        doc = doc.add_paragraph(para);
    }

    let mut buf = Vec::new();
    doc.build()
        .pack(std::io::Cursor::new(&mut buf))
        .map_err(|e| format!("docx pack: {e}"))?;
    Ok(buf)
}

#[tauri::command]
pub async fn export_docx(
    job_id: i64,
    content_md: String,
    company: String,
    job_title: String,
    input_hash: String,
    app: AppHandle,
    db: State<'_, Db>,
) -> Result<GeneratedDoc, String> {
    if let Some(doc) = fetch_generated_doc(job_id, &input_hash, "docx", &db).await? {
        if std::path::Path::new(&doc.file_path).exists() {
            return Ok(doc);
        }
    }

    let bytes = md_to_docx_bytes(&content_md)?;
    let dir = cv_dir(&app, &company, &job_title)?;
    let path = dir.join(cv_filename(&job_title, &company, &input_hash, "docx"));
    std::fs::write(&path, &bytes).map_err(|e| format!("write docx: {e}"))?;

    upsert_generated_doc(
        job_id,
        &input_hash,
        "docx",
        path.to_str().unwrap_or(""),
        &db,
    )
    .await
}

// ── PDF export ───────────────────────────────────────────────────────────────

fn md_to_pdf_bytes(content_md: &str) -> Result<Vec<u8>, String> {
    use printpdf::*;

    let (doc, page1, layer1) = PdfDocument::new("Tailored CV", Mm(210.0), Mm(297.0), "Layer 1");

    let font_bold = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| format!("pdf font bold: {e}"))?;
    let font_reg = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| format!("pdf font: {e}"))?;

    let margin = Mm(18.0_f32);
    let indent = Mm(21.0_f32);
    let top_y = 277.0_f32;
    let mut y: f32 = top_y;
    let mut cur_page = page1;
    let mut cur_layer = layer1;

    for line in content_md.lines() {
        if y < 18.0_f32 {
            let (p, l) = doc.add_page(Mm(210.0_f32), Mm(297.0_f32), "Layer 1");
            cur_page = p;
            cur_layer = l;
            y = top_y;
        }
        let layer = doc.get_page(cur_page).get_layer(cur_layer);

        if let Some(text) = line.strip_prefix("# ") {
            y -= 4.0_f32;
            layer.use_text(text, 16.0_f32, margin, Mm(y), &font_bold);
            y -= 9.0_f32;
        } else if let Some(text) = line.strip_prefix("## ") {
            y -= 2.0_f32;
            layer.use_text(text, 13.0_f32, margin, Mm(y), &font_bold);
            y -= 7.0_f32;
        } else if let Some(text) = line.strip_prefix("### ") {
            layer.use_text(text, 11.0_f32, margin, Mm(y), &font_bold);
            y -= 6.0_f32;
        } else if let Some(text) = line.strip_prefix("- ").or_else(|| line.strip_prefix("* ")) {
            let bullet = format!("- {text}");
            layer.use_text(&bullet, 10.0_f32, indent, Mm(y), &font_reg);
            y -= 5.5_f32;
        } else if line.is_empty() {
            y -= 3.0_f32;
        } else {
            layer.use_text(line, 10.0_f32, margin, Mm(y), &font_reg);
            y -= 5.5_f32;
        }
    }

    let mut buf = Vec::new();
    doc.save(&mut std::io::BufWriter::new(&mut buf))
        .map_err(|e| format!("pdf save: {e}"))?;
    Ok(buf)
}

#[tauri::command]
pub async fn export_pdf(
    job_id: i64,
    content_md: String,
    company: String,
    job_title: String,
    input_hash: String,
    app: AppHandle,
    db: State<'_, Db>,
) -> Result<GeneratedDoc, String> {
    if let Some(doc) = fetch_generated_doc(job_id, &input_hash, "pdf", &db).await? {
        if std::path::Path::new(&doc.file_path).exists() {
            return Ok(doc);
        }
    }

    let bytes = md_to_pdf_bytes(&content_md)?;
    let dir = cv_dir(&app, &company, &job_title)?;
    let path = dir.join(cv_filename(&job_title, &company, &input_hash, "pdf"));
    std::fs::write(&path, &bytes).map_err(|e| format!("write pdf: {e}"))?;

    upsert_generated_doc(job_id, &input_hash, "pdf", path.to_str().unwrap_or(""), &db).await
}

// ── File reveal / open ───────────────────────────────────────────────────────

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("open_file: {e}"))?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &path])
        .spawn()
        .map_err(|e| format!("open_file: {e}"))?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("open_file: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn reveal_in_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .args(["-R", &path])
        .spawn()
        .map_err(|e| format!("reveal_in_folder: {e}"))?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(format!("/select,{path}"))
        .spawn()
        .map_err(|e| format!("reveal_in_folder: {e}"))?;
    #[cfg(target_os = "linux")]
    {
        let parent = std::path::Path::new(&path)
            .parent()
            .and_then(|p| p.to_str())
            .unwrap_or(&path);
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| format!("reveal_in_folder: {e}"))?;
    }
    Ok(())
}
