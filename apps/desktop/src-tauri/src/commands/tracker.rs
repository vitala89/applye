// Job Tracker: read-only reporting over applications + jobs + status_history,
// and a generic report exporter (PDF via printpdf, CSV passthrough). 0 tokens.
// This is the Agentur fuer Arbeit "Eigenbemuehungen" report (ROADMAP §9):
// one implementation, no duplication.

use crate::db::Db;
use serde::Serialize;
use std::path::PathBuf;
use tauri::{Manager, State};

/// One row of the tracker table: applications JOIN jobs, latest update from
/// status_history, and the first two interview_stages dates (interview #1 /
/// follow-up #2). All deterministic SQL, no AI. Mirrors the user's real xlsx
/// tracker 1:1 (19 fields) — see ROADMAP §9 + §12.
#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TrackerRow {
    pub id: i64,
    pub job_id: Option<i64>,
    pub applied_at: Option<String>,
    pub company: Option<String>,
    pub title: Option<String>,
    pub tech_stack: Option<String>,
    pub location: Option<String>,
    pub source_url: Option<String>,
    pub contact_name: Option<String>,
    pub contact_role: Option<String>,
    pub contact_channel: Option<String>,
    pub method: Option<String>,
    pub interview_1_at: Option<String>,
    pub follow_up_2_at: Option<String>,
    pub status: Option<String>,
    pub next_action: Option<String>,
    pub next_action_at: Option<String>,
    pub salary_range: Option<String>,
    pub contract_type: Option<String>,
    pub blue_card_eligible: Option<bool>,
    pub eor_provider: Option<String>,
    pub notes: Option<String>,
    pub last_update: Option<String>,
}

#[tauri::command]
pub async fn db_tracker_rows(db: State<'_, Db>) -> Result<Vec<TrackerRow>, String> {
    sqlx::query_as::<_, TrackerRow>(
        "SELECT
           a.id,
           a.job_id,
           a.applied_at,
           j.company,
           j.title,
           j.tech_stack,
           j.location,
           a.source_url,
           a.contact_name,
           a.contact_role,
           a.contact_channel,
           a.application_method AS method,
           (SELECT scheduled_at FROM interview_stages
              WHERE application_id = a.id AND stage_order = 1
              ORDER BY id LIMIT 1) AS interview_1_at,
           (SELECT scheduled_at FROM interview_stages
              WHERE application_id = a.id AND stage_order = 2
              ORDER BY id LIMIT 1) AS follow_up_2_at,
           a.status,
           a.next_action,
           a.next_action_at,
           a.salary_range,
           a.contract_type,
           j.blue_card_eligible,
           a.eor_provider,
           a.notes,
           (SELECT MAX(sh.changed_at) FROM status_history sh
              WHERE sh.application_id = a.id) AS last_update
         FROM applications a
         JOIN jobs j ON j.id = a.job_id
         ORDER BY a.applied_at DESC, a.id DESC",
    )
    .fetch_all(&db.pool)
    .await
    .map_err(|e| format!("db_tracker_rows: {e}"))
}

/// Write a report the frontend has already laid out (the Agentur PDF as plain
/// lines, or a CSV) to a Documents/Applye/reports file and return its path.
/// PDF uses printpdf; CSV is written verbatim. The frontend reveals the file.
#[tauri::command]
pub async fn export_report(
    content: String,
    format: String,
    file_base: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let dir = reports_dir(&app)?;
    let safe = file_base
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>();
    let path = dir.join(format!("{safe}.{format}"));

    let bytes = match format.as_str() {
        "csv" => content.into_bytes(),
        "pdf" => text_to_pdf_bytes(&content)?,
        other => return Err(format!("unsupported report format: {other}")),
    };
    std::fs::write(&path, &bytes).map_err(|e| format!("write report: {e}"))?;
    Ok(path.to_string_lossy().to_string())
}

fn reports_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("report dir: {e}"))?;
    let dir = base.join("Applye").join("reports");
    std::fs::create_dir_all(&dir).map_err(|e| format!("create report dir: {e}"))?;
    Ok(dir)
}

/// Render plain report text to PDF. Lines beginning with "# " / "## " are
/// headings; everything else is monospace-width body (so padded table columns
/// line up). Mirrors the CV PDF renderer; pure Rust, no fonts to bundle.
fn text_to_pdf_bytes(content: &str) -> Result<Vec<u8>, String> {
    use printpdf::*;

    let (doc, page1, layer1) = PdfDocument::new("Applye report", Mm(210.0), Mm(297.0), "Layer 1");
    let font_bold = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| format!("pdf font bold: {e}"))?;
    let font_mono = doc
        .add_builtin_font(BuiltinFont::Courier)
        .map_err(|e| format!("pdf font: {e}"))?;

    let margin = Mm(16.0_f32);
    let top_y = 281.0_f32;
    let mut y = top_y;
    let mut cur_page = page1;
    let mut cur_layer = layer1;

    for line in content.lines() {
        if y < 16.0_f32 {
            let (p, l) = doc.add_page(Mm(210.0_f32), Mm(297.0_f32), "Layer 1");
            cur_page = p;
            cur_layer = l;
            y = top_y;
        }
        let layer = doc.get_page(cur_page).get_layer(cur_layer);
        if let Some(text) = line.strip_prefix("# ") {
            layer.use_text(text, 15.0_f32, margin, Mm(y), &font_bold);
            y -= 9.0_f32;
        } else if let Some(text) = line.strip_prefix("## ") {
            layer.use_text(text, 11.0_f32, margin, Mm(y), &font_bold);
            y -= 7.0_f32;
        } else if line.is_empty() {
            y -= 4.0_f32;
        } else {
            layer.use_text(line, 8.0_f32, margin, Mm(y), &font_mono);
            y -= 4.6_f32;
        }
    }

    let mut buf = Vec::new();
    doc.save(&mut std::io::BufWriter::new(&mut buf))
        .map_err(|e| format!("pdf save: {e}"))?;
    Ok(buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The official Agentur report layout (ROADMAP §9): heading, period,
    /// applicant, generated date, then the date/company/position/method/
    /// status/contact table. Renders to valid, non-empty PDF bytes.
    #[test]
    fn renders_official_report_layout_to_valid_pdf() {
        let content = "# Nachweise über Bewerbungsbemühungen\n\
             Period: All time\n\
             Name: Jane Doe\n\
             Generated on: 2026-07-02\n\
             \n\
             ## Job Tracker\n\
             #   Date Applied Company             Role                Method      Status     Contact\n\
             1   2026-06-01   Acme Robotics       Backend Engineer    email       applied    Jane Doe — jane@acme.example";

        let bytes = text_to_pdf_bytes(content).expect("render pdf");
        assert!(!bytes.is_empty());
        assert!(bytes.starts_with(b"%PDF"), "output must be a valid PDF");
    }

    /// Long reports that overflow one page must still render (verifies the
    /// pagination branch used once a real tracker has many rows).
    #[test]
    fn paginates_long_reports() {
        let mut content = String::from("# Report\n");
        for i in 0..200 {
            content.push_str(&format!("row {i}\n"));
        }
        let bytes = text_to_pdf_bytes(&content).expect("render pdf");
        assert!(bytes.starts_with(b"%PDF"));
    }
}
