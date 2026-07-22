// Import tracklist (Phase 6.4). One AI call total, made from the frontend via
// the `import-tracklist` skill for structure detection only. Everything
// here — file reading, status normalization, dedupe, insert — is
// deterministic Rust + SQL, 0 tokens.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

use crate::db::{stable_hash, Db};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFileContent {
    pub file_type: String,
    pub content: String,
}

/// Reads a tracklist file picked via the OS file dialog and converts it to a
/// compact text representation for the `import-tracklist` skill. XLSX is
/// converted to CSV-like text; CSV/JSON/plain text are read as-is.
#[tauri::command]
pub fn import_read_file(path: String) -> Result<ImportFileContent, String> {
    let lower = path.to_lowercase();
    if lower.ends_with(".xlsx") || lower.ends_with(".xls") {
        Ok(ImportFileContent {
            file_type: "xlsx".to_string(),
            content: read_xlsx_as_csv(&path)?,
        })
    } else if lower.ends_with(".json") {
        Ok(ImportFileContent {
            file_type: "json".to_string(),
            content: read_text(&path)?,
        })
    } else if lower.ends_with(".csv") {
        Ok(ImportFileContent {
            file_type: "csv".to_string(),
            content: read_text(&path)?,
        })
    } else {
        Ok(ImportFileContent {
            file_type: "text".to_string(),
            content: read_text(&path)?,
        })
    }
}

fn read_text(path: &str) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| format!("import_read_file: {e}"))
}

fn read_xlsx_as_csv(path: &str) -> Result<String, String> {
    use calamine::{open_workbook, Reader, Xlsx};

    let mut workbook: Xlsx<_> =
        open_workbook(path).map_err(|e| format!("read_xlsx_as_csv: open: {e}"))?;
    let sheet_name = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| "read_xlsx_as_csv: workbook has no sheets".to_string())?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|e| format!("read_xlsx_as_csv: {e}"))?;

    let mut out = String::new();
    for row in range.rows() {
        let line = row
            .iter()
            .map(|cell| cell.to_string().replace(',', " "))
            .collect::<Vec<_>>()
            .join(",");
        out.push_str(&line);
        out.push('\n');
    }
    Ok(out)
}

/// One row as extracted by the `import-tracklist` skill. `status` is
/// whatever raw text the skill found in that column — normalization happens
/// in `normalize_status`, never in the AI call.
#[derive(Debug, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImportRawRow {
    pub company: Option<String>,
    pub role: Option<String>,
    pub status: Option<String>,
    pub applied_at: Option<String>,
    pub notes: Option<String>,
    pub tech_stack: Option<String>,
    pub source_url: Option<String>,
    pub contact_name: Option<String>,
    pub contact_role: Option<String>,
    pub contact_channel: Option<String>,
    pub next_action: Option<String>,
    pub next_action_at: Option<String>,
    pub salary_range: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreviewRow {
    pub company: String,
    pub role: String,
    pub status: String,
    pub applied_at: Option<String>,
    pub notes: Option<String>,
    pub tech_stack: Option<String>,
    pub source_url: Option<String>,
    pub contact_name: Option<String>,
    pub contact_role: Option<String>,
    pub contact_channel: Option<String>,
    pub next_action: Option<String>,
    pub next_action_at: Option<String>,
    pub salary_range: Option<String>,
    pub is_duplicate: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub inserted: i64,
    pub skipped_duplicate: i64,
}

/// Sent/Applied/Submitted -> applied; In progress/Interview/Screening ->
/// interview; Rejected/Declined/No -> rejected; Offer/Accepted -> offer;
/// else -> saved. A final/terminal outcome wins over an in-between one when
/// a row's text mentions both (e.g. "Interview - Rejected" -> rejected).
fn normalize_status(raw: &str) -> &'static str {
    let s = raw.trim().to_lowercase();
    if s.is_empty() {
        return "saved";
    }
    if s == "no"
        || s.contains("no response")
        || s.contains("ghost")
        || s.contains("reject")
        || s.contains("declin")
    {
        "rejected"
    } else if s.contains("offer") || s.contains("accept") {
        "offer"
    } else if s.contains("interview") || s.contains("screening") || s.contains("in progress") {
        "interview"
    } else if s.contains("sent") || s.contains("applied") || s.contains("submit") {
        "applied"
    } else {
        "saved"
    }
}

async fn is_duplicate_company_role(
    pool: &SqlitePool,
    company: &str,
    role: &str,
) -> Result<bool, sqlx::Error> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM jobs WHERE lower(company) = lower(?) AND lower(title) = lower(?)",
    )
    .bind(company)
    .bind(role)
    .fetch_one(pool)
    .await?;
    Ok(count > 0)
}

/// Deterministic preview: normalize status, check for an existing job with
/// the same company + role. Nothing is written yet.
#[tauri::command]
pub async fn import_preview(
    rows: Vec<ImportRawRow>,
    db: State<'_, Db>,
) -> Result<Vec<ImportPreviewRow>, String> {
    import_preview_core(rows, &db.pool).await
}

async fn import_preview_core(
    rows: Vec<ImportRawRow>,
    pool: &SqlitePool,
) -> Result<Vec<ImportPreviewRow>, String> {
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let company = row.company.unwrap_or_default().trim().to_string();
        let role = row.role.unwrap_or_default().trim().to_string();
        if company.is_empty() || role.is_empty() {
            continue;
        }
        let status = normalize_status(row.status.as_deref().unwrap_or(""));
        let is_duplicate = is_duplicate_company_role(pool, &company, &role)
            .await
            .map_err(|e| format!("import_preview: {e}"))?;
        out.push(ImportPreviewRow {
            company,
            role,
            status: status.to_string(),
            applied_at: row.applied_at,
            notes: row.notes,
            tech_stack: row.tech_stack,
            source_url: row.source_url,
            contact_name: row.contact_name,
            contact_role: row.contact_role,
            contact_channel: row.contact_channel,
            next_action: row.next_action,
            next_action_at: row.next_action_at,
            salary_range: row.salary_range,
            is_duplicate,
        });
    }
    Ok(out)
}

/// Inserts the user-confirmed rows: a `jobs` row for every row, plus an
/// `applications` row carrying its normalized status (every normalized
/// status, including "saved", is itself a pipeline stage in this app). Rows
/// that turn out to be duplicates at insert time (re-checked here, not
/// trusted from the earlier preview) are skipped, not inserted twice.
#[tauri::command]
pub async fn import_confirm(
    rows: Vec<ImportRawRow>,
    imported_from: String,
    followup_days_after_apply: i64,
    db: State<'_, Db>,
) -> Result<ImportResult, String> {
    import_confirm_core(rows, &imported_from, followup_days_after_apply, &db.pool).await
}

async fn import_confirm_core(
    rows: Vec<ImportRawRow>,
    imported_from: &str,
    followup_days_after_apply: i64,
    pool: &SqlitePool,
) -> Result<ImportResult, String> {
    let mut inserted = 0i64;
    let mut skipped_duplicate = 0i64;

    for (i, row) in rows.into_iter().enumerate() {
        let company = row.company.unwrap_or_default().trim().to_string();
        let role = row.role.unwrap_or_default().trim().to_string();
        if company.is_empty() || role.is_empty() {
            continue;
        }

        if is_duplicate_company_role(pool, &company, &role)
            .await
            .map_err(|e| format!("import_confirm: dup check: {e}"))?
        {
            skipped_duplicate += 1;
            continue;
        }

        let status = normalize_status(row.status.as_deref().unwrap_or(""));
        let applied_at = row.applied_at.clone();
        let notes = row.notes.clone();

        // No real JD text exists for an imported row — hash the row's own
        // identity (plus its position, in case two rows are literally
        // identical) so jd_hash stays unique without colliding across rows.
        let jd_hash = stable_hash(&format!(
            "import#{i}|{company}|{role}|{status}|{applied_at:?}|{notes:?}"
        ));

        let job_res = sqlx::query(
            "INSERT INTO jobs
               (company, title, jd_hash, source, hard_filter_passed,
                legitimacy_tier, imported_from, tech_stack, created_at)
             VALUES (?, ?, ?, 'import', 1, 'green', ?, ?, datetime('now'))",
        )
        .bind(&company)
        .bind(&role)
        .bind(&jd_hash)
        .bind(imported_from)
        .bind(&row.tech_stack)
        .execute(pool)
        .await
        .map_err(|e| format!("import_confirm: insert job: {e}"))?;

        let job_id = job_res.last_insert_rowid();

        let app_res = sqlx::query(
            "INSERT INTO applications
               (job_id, status, applied_at, notes, source_url, contact_name,
                contact_role, contact_channel, next_action, next_action_at,
                salary_range, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
        )
        .bind(job_id)
        .bind(status)
        .bind(&applied_at)
        .bind(&notes)
        .bind(&row.source_url)
        .bind(&row.contact_name)
        .bind(&row.contact_role)
        .bind(&row.contact_channel)
        .bind(&row.next_action)
        .bind(&row.next_action_at)
        .bind(&row.salary_range)
        .execute(pool)
        .await
        .map_err(|e| format!("import_confirm: insert application: {e}"))?;

        if status == "applied" {
            if let Some(applied) = &applied_at {
                sqlx::query(
                    "UPDATE applications SET follow_up_at = date(?, '+' || ? || ' days') WHERE id = ?",
                )
                .bind(applied)
                .bind(followup_days_after_apply)
                .bind(app_res.last_insert_rowid())
                .execute(pool)
                .await
                .map_err(|e| format!("import_confirm: set follow_up_at: {e}"))?;
            }
        }

        inserted += 1;
    }

    Ok(ImportResult {
        inserted,
        skipped_duplicate,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_csv_json_and_text_files_by_extension() {
        let dir = std::env::temp_dir().join(format!(
            "applye-import-test-{:?}",
            std::thread::current().id()
        ));
        std::fs::create_dir_all(&dir).unwrap();

        let csv_path = dir.join("jobs.csv");
        std::fs::write(&csv_path, "Company,Role\nAcme,Engineer\n").unwrap();
        let csv = import_read_file(csv_path.to_string_lossy().to_string()).unwrap();
        assert_eq!(csv.file_type, "csv");
        assert!(csv.content.contains("Acme,Engineer"));

        let json_path = dir.join("jobs.json");
        std::fs::write(&json_path, r#"[{"company":"Acme"}]"#).unwrap();
        let json = import_read_file(json_path.to_string_lossy().to_string()).unwrap();
        assert_eq!(json.file_type, "json");

        let txt_path = dir.join("jobs.txt");
        std::fs::write(&txt_path, "Acme - Engineer - Applied").unwrap();
        let text = import_read_file(txt_path.to_string_lossy().to_string()).unwrap();
        assert_eq!(text.file_type, "text");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn normalizes_documented_status_examples() {
        assert_eq!(normalize_status("Sent"), "applied");
        assert_eq!(normalize_status("Applied"), "applied");
        assert_eq!(normalize_status("Submitted"), "applied");
        assert_eq!(normalize_status("In progress"), "interview");
        assert_eq!(normalize_status("Interview"), "interview");
        assert_eq!(normalize_status("Screening"), "interview");
        assert_eq!(normalize_status("Rejected"), "rejected");
        assert_eq!(normalize_status("Declined"), "rejected");
        assert_eq!(normalize_status("No"), "rejected");
        assert_eq!(normalize_status("Offer"), "offer");
        assert_eq!(normalize_status("Accepted"), "offer");
        assert_eq!(normalize_status(""), "saved");
        assert_eq!(normalize_status("Something else entirely"), "saved");
    }

    #[test]
    fn terminal_outcome_wins_over_interview_mention() {
        assert_eq!(normalize_status("Interview - Rejected"), "rejected");
    }

    #[test]
    fn short_ambiguous_words_do_not_false_positive() {
        // "no" must not match inside unrelated words like "None"/"Notes".
        assert_eq!(normalize_status("None yet"), "saved");
        assert_eq!(normalize_status("Notes pending"), "saved");
    }

    mod pipeline {
        use super::super::*;
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

        fn row(company: &str, role: &str, status: &str, applied_at: Option<&str>) -> ImportRawRow {
            ImportRawRow {
                company: Some(company.to_string()),
                role: Some(role.to_string()),
                status: Some(status.to_string()),
                applied_at: applied_at.map(|s| s.to_string()),
                notes: Some("from import".to_string()),
                ..Default::default()
            }
        }

        #[tokio::test]
        async fn preview_flags_no_existing_duplicates_on_empty_db() {
            let pool = test_pool().await;
            let rows = vec![row("Acme Robotics", "Backend Engineer", "Submitted", None)];
            let preview = import_preview_core(rows, &pool).await.unwrap();
            assert_eq!(preview.len(), 1);
            assert!(!preview[0].is_duplicate);
            assert_eq!(preview[0].status, "applied");
        }

        /// The 8 tracker-parity columns (jobs.tech_stack + the 7 applications
        /// fields from 0008_tracker_fields.sql) round-trip through import:
        /// what the skill detects in the xlsx ends up in the right column.
        #[tokio::test]
        async fn confirm_round_trips_tracker_fields() {
            let pool = test_pool().await;
            let rows = vec![ImportRawRow {
                company: Some("Acme Robotics".to_string()),
                role: Some("Backend Engineer".to_string()),
                status: Some("Submitted".to_string()),
                applied_at: Some("2026-06-01".to_string()),
                notes: Some("from xlsx".to_string()),
                tech_stack: Some("Rust, Postgres".to_string()),
                source_url: Some("https://boards.greenhouse.io/acme/jobs/1".to_string()),
                contact_name: Some("Jane Doe".to_string()),
                contact_role: Some("Recruiter".to_string()),
                contact_channel: Some("jane@acme.example".to_string()),
                next_action: Some("Follow up".to_string()),
                next_action_at: Some("2026-06-15".to_string()),
                salary_range: Some("70-80k EUR".to_string()),
            }];

            let result = import_confirm_core(rows, "import_xlsx", 7, &pool)
                .await
                .unwrap();
            assert_eq!(result.inserted, 1);

            let tech_stack: Option<String> = sqlx::query_scalar("SELECT tech_stack FROM jobs")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(tech_stack.as_deref(), Some("Rust, Postgres"));

            // The seven nullable application columns asserted below.
            type AppRow = (
                Option<String>,
                Option<String>,
                Option<String>,
                Option<String>,
                Option<String>,
                Option<String>,
                Option<String>,
            );
            let app: AppRow = sqlx::query_as(
                "SELECT source_url, contact_name, contact_role, contact_channel,
                        next_action, next_action_at, salary_range
                 FROM applications",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(
                app,
                (
                    Some("https://boards.greenhouse.io/acme/jobs/1".to_string()),
                    Some("Jane Doe".to_string()),
                    Some("Recruiter".to_string()),
                    Some("jane@acme.example".to_string()),
                    Some("Follow up".to_string()),
                    Some("2026-06-15".to_string()),
                    Some("70-80k EUR".to_string()),
                )
            );
        }

        #[tokio::test]
        async fn confirm_inserts_jobs_and_applications_with_imported_from() {
            let pool = test_pool().await;
            let rows = vec![
                row(
                    "Acme Robotics",
                    "Backend Engineer",
                    "Submitted",
                    Some("2026-06-01"),
                ),
                row("Globex Corp", "Frontend Engineer", "Screening", None),
            ];
            let result = import_confirm_core(rows, "import_csv", 7, &pool)
                .await
                .unwrap();
            assert_eq!(result.inserted, 2);
            assert_eq!(result.skipped_duplicate, 0);

            let imported_from: Vec<String> =
                sqlx::query_scalar("SELECT imported_from FROM jobs ORDER BY id")
                    .fetch_all(&pool)
                    .await
                    .unwrap();
            assert_eq!(imported_from, vec!["import_csv", "import_csv"]);

            let statuses: Vec<String> =
                sqlx::query_scalar("SELECT status FROM applications ORDER BY id")
                    .fetch_all(&pool)
                    .await
                    .unwrap();
            assert_eq!(statuses, vec!["applied", "interview"]);

            let follow_up_at: Option<String> = sqlx::query_scalar(
                "SELECT follow_up_at FROM applications WHERE status = 'applied'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(follow_up_at.as_deref(), Some("2026-06-08"));
        }

        #[tokio::test]
        async fn reimporting_the_same_rows_is_all_duplicates_no_double_insert() {
            let pool = test_pool().await;
            let rows = vec![row("Acme Robotics", "Backend Engineer", "Submitted", None)];
            let first = import_confirm_core(rows.clone(), "import_csv", 7, &pool)
                .await
                .unwrap();
            assert_eq!(first.inserted, 1);

            let preview = import_preview_core(rows.clone(), &pool).await.unwrap();
            assert!(preview[0].is_duplicate);

            let second = import_confirm_core(rows, "import_csv", 7, &pool)
                .await
                .unwrap();
            assert_eq!(second.inserted, 0);
            assert_eq!(second.skipped_duplicate, 1);

            let job_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM jobs")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(job_count, 1);
        }

        #[tokio::test]
        async fn row_missing_company_is_never_inserted() {
            let pool = test_pool().await;
            let rows = vec![ImportRawRow {
                company: None,
                role: Some("Backend Engineer".to_string()),
                status: Some("Applied".to_string()),
                applied_at: None,
                notes: None,
                ..Default::default()
            }];
            let result = import_confirm_core(rows, "import_csv", 7, &pool)
                .await
                .unwrap();
            assert_eq!(result.inserted, 0);
            let job_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM jobs")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(job_count, 0);
        }

        #[tokio::test]
        async fn imported_from_differs_per_source_format() {
            let pool = test_pool().await;
            for (i, source) in ["import_csv", "import_xlsx", "import_json", "import_text"]
                .iter()
                .enumerate()
            {
                let rows = vec![row(&format!("Company {i}"), "Role", "Applied", None)];
                import_confirm_core(rows, source, 7, &pool).await.unwrap();
            }
            let sources: Vec<String> =
                sqlx::query_scalar("SELECT imported_from FROM jobs ORDER BY id")
                    .fetch_all(&pool)
                    .await
                    .unwrap();
            assert_eq!(
                sources,
                vec!["import_csv", "import_xlsx", "import_json", "import_text"]
            );
        }
    }
}
