// The tailoring journal: what the 3-pass run produced, where it was written,
// and how the user opens it. Split out of `tailoring.rs`, which was 1578 lines
// against an 800 budget and held this alongside the pure block model both
// renderers read.
//
// Everything here touches SQLite, the filesystem or the shell, and nothing else
// in the tailoring group does. Cache key: `input_hash` covers all inputs for a
// given pass (including upstream pass results), so a different pass-1 output
// invalidates the pass-2 cache. Files land in
// `<app_data>/companies/<company>/cv/<hash12>.<ext>`, and `open_file` /
// `reveal_in_folder` refuse anything that does not resolve inside that root.

use super::exported_paths::ExportedPaths;
use super::tailoring_docx::md_to_docx_bytes;
use super::tailoring_pdf::md_to_pdf_bytes;
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

    let bytes = md_to_docx_bytes(&content_md, None)?;
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

    let bytes = md_to_pdf_bytes(&content_md, None)?;
    let dir = cv_dir(&app, &company, &job_title)?;
    let path = dir.join(cv_filename(&job_title, &company, &input_hash, "pdf"));
    std::fs::write(&path, &bytes).map_err(|e| format!("write pdf: {e}"))?;

    upsert_generated_doc(job_id, &input_hash, "pdf", path.to_str().unwrap_or(""), &db).await
}

// ── File reveal / open ───────────────────────────────────────────────────────

/// Resolves a path the frontend asked to open and refuses anything outside the
/// app's own data directory.
///
/// Both commands below hand the path to the OS launcher, which will happily
/// run an application bundle or a script, so a bug or a compromised renderer
/// must not be able to name an arbitrary file on disk.
///
/// A path qualifies one of two ways: it sits under the app's own data
/// directory - the `generated_docs.file_path` rows this guard was written for -
/// or Applye wrote it during this run, which is how the apply wizard's exports
/// qualify. Those go wherever the save dialog pointed, usually Downloads, and
/// used to be refused by the very app that had just written them. See
/// `commands::exported_paths` for what is allowed to be remembered and why the
/// extension matters.
///
/// `canonicalize` on both sides is what makes the check meaningful: it
/// resolves `..` segments and follows symlinks, so a link inside the data
/// directory pointing at `/Applications/Something.app` fails the prefix test
/// rather than passing it.
fn resolve_app_owned_file(
    app: &AppHandle,
    exported: &ExportedPaths,
    path: &str,
) -> Result<std::path::PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    match resolve_within(&base, path) {
        Ok(inside) => Ok(inside),
        // Not under the data directory. It still qualifies if this run wrote
        // it; `resolve_exported` repeats the canonicalize and regular-file
        // checks rather than trusting the string it was handed.
        Err(outside) => resolve_exported(exported, path).map_err(|_| outside),
    }
}

/// The provenance half of the rule: a file Applye wrote during this run.
fn resolve_exported(exported: &ExportedPaths, path: &str) -> Result<std::path::PathBuf, String> {
    let target = std::path::Path::new(path)
        .canonicalize()
        .map_err(|e| format!("no such file: {e}"))?;
    if !target.is_file() {
        return Err("refused: not a regular file".to_string());
    }
    if !exported.contains(&target) {
        return Err("refused: that file is outside Applye's own document folder".to_string());
    }
    Ok(target)
}

/// The containment rule on its own, so it can be tested without an `AppHandle`.
fn resolve_within(base: &std::path::Path, path: &str) -> Result<std::path::PathBuf, String> {
    let base = base
        .canonicalize()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let target = std::path::Path::new(path)
        .canonicalize()
        .map_err(|e| format!("no such file: {e}"))?;
    if !target.starts_with(&base) {
        return Err("refused: that file is outside Applye's own document folder".to_string());
    }
    if !target.is_file() {
        return Err("refused: not a regular file".to_string());
    }
    Ok(target)
}

#[tauri::command]
pub fn open_file(
    app: AppHandle,
    exported: State<'_, ExportedPaths>,
    path: String,
) -> Result<(), String> {
    let path = resolve_app_owned_file(&app, &exported, &path)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("open_file: {e}"))?;
    // `cmd /C start` on Windows is the one launcher that re-parses its
    // arguments, so it is the only place a metacharacter in a filename could
    // matter. Two things keep it safe: every name Applye writes goes through
    // `readable_slug` (alphanumeric plus hyphen, nothing else survives), and
    // the containment check above means no path from outside that folder ever
    // reaches here. The empty `""` is `start`'s title argument - without it,
    // `start` treats a quoted path as the window title and opens nothing.
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &path.to_string_lossy().to_string()])
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
pub fn reveal_in_folder(
    app: AppHandle,
    exported: State<'_, ExportedPaths>,
    path: String,
) -> Result<(), String> {
    let path = resolve_app_owned_file(&app, &exported, &path)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .args([std::ffi::OsStr::new("-R"), path.as_os_str()])
        .spawn()
        .map_err(|e| format!("reveal_in_folder: {e}"))?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(format!("/select,{}", path.to_string_lossy()))
        .spawn()
        .map_err(|e| format!("reveal_in_folder: {e}"))?;
    #[cfg(target_os = "linux")]
    {
        let parent = path.parent().unwrap_or(path.as_path());
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| format!("reveal_in_folder: {e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A scratch "app data dir" with one export inside it, plus a sibling
    /// directory standing in for the rest of the disk.
    fn containment_fixture() -> (std::path::PathBuf, std::path::PathBuf) {
        let root = std::env::temp_dir().join(format!("applye-contain-{}", std::process::id()));
        let inside = root.join("app-data").join("companies").join("acme");
        let outside = root.join("elsewhere");
        std::fs::create_dir_all(&inside).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(inside.join("cv.pdf"), b"%PDF-1.4").unwrap();
        std::fs::write(outside.join("payload.sh"), b"#!/bin/sh\n").unwrap();
        (root.join("app-data"), outside)
    }

    /// The reported bug: the apply wizard writes wherever the save dialog
    /// pointed - Downloads, in the report - and "Open file" then refused the
    /// file Applye had itself just written, saying it was "outside Applye's own
    /// document folder" directly beneath the path it had printed.
    #[test]
    fn allows_a_file_this_run_exported_outside_the_data_dir() {
        let (_, outside) = containment_fixture();
        let export = outside.join("tailored cv.pdf");
        std::fs::write(&export, b"%PDF-1.4").unwrap();
        let exported = ExportedPaths::default();

        let refused = resolve_exported(&exported, export.to_str().unwrap());
        assert!(refused.is_err(), "not written by us yet: {refused:?}");

        exported.remember(&export);
        let allowed = resolve_exported(&exported, export.to_str().unwrap());
        assert!(allowed.is_ok(), "got: {allowed:?}");
    }

    /// Provenance is the whole rule. Sitting next to a file we did write earns
    /// nothing, or the guard would be a directory allowance in disguise.
    #[test]
    fn refuses_a_neighbour_of_a_file_we_exported() {
        let (_, outside) = containment_fixture();
        let export = outside.join("tailored cv.pdf");
        std::fs::write(&export, b"%PDF-1.4").unwrap();
        let exported = ExportedPaths::default();
        exported.remember(&export);

        let neighbour = outside.join("payload.sh");
        let out = resolve_exported(&exported, neighbour.to_str().unwrap());
        assert!(out.is_err(), "got: {out:?}");
    }

    /// The export commands are callable by the renderer, so a compromised one
    /// could ask for a write to any path and then ask to open it. Only the
    /// extensions Applye exports are ever remembered, which keeps the OS
    /// launcher on documents rather than on anything it would run.
    #[test]
    fn refuses_an_executable_extension_even_after_writing_it() {
        let (_, outside) = containment_fixture();
        let script = outside.join("payload.command");
        std::fs::write(&script, b"#!/bin/sh\n").unwrap();
        let exported = ExportedPaths::default();

        exported.remember(&script);

        let out = resolve_exported(&exported, script.to_str().unwrap());
        assert!(out.is_err(), "got: {out:?}");
    }

    #[test]
    fn allows_a_file_inside_the_app_data_dir() {
        let (base, _) = containment_fixture();
        let target = base.join("companies").join("acme").join("cv.pdf");
        let out = resolve_within(&base, target.to_str().unwrap());
        assert!(out.is_ok(), "got: {out:?}");
    }

    #[test]
    fn refuses_a_file_outside_the_app_data_dir() {
        let (base, outside) = containment_fixture();
        let target = outside.join("payload.sh");
        let err = resolve_within(&base, target.to_str().unwrap())
            .expect_err("a path outside the data dir must be refused");
        assert!(err.contains("outside"), "got: {err}");
    }

    #[test]
    fn refuses_a_traversal_that_climbs_out() {
        let (base, _) = containment_fixture();
        // Syntactically "inside", but `..` walks it back out to the sibling.
        let target = base.join("companies/../../elsewhere/payload.sh");
        let err = resolve_within(&base, target.to_str().unwrap())
            .expect_err("`..` must not escape the data dir");
        assert!(err.contains("outside"), "got: {err}");
    }

    #[test]
    fn refuses_a_directory() {
        let (base, _) = containment_fixture();
        let target = base.join("companies").join("acme");
        let err = resolve_within(&base, target.to_str().unwrap())
            .expect_err("a directory is not an exported document");
        assert!(err.contains("not a regular file"), "got: {err}");
    }

    #[test]
    fn refuses_a_path_that_does_not_exist() {
        let (base, _) = containment_fixture();
        let target = base.join("companies").join("acme").join("missing.pdf");
        let err = resolve_within(&base, target.to_str().unwrap())
            .expect_err("a missing file must not be launched");
        assert!(err.contains("no such file"), "got: {err}");
    }
}
