//! Tracklist preview and confirm. File parsing is `files`, status mapping is
//! `domain`, and the job/application writes are `persistence`.

mod domain;
mod files;
mod persistence;

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::db::stable_hash;

pub use files::ImportFileContent;

/// One row as extracted by the `import-tracklist` skill. `status` is
/// whatever raw text the skill found in that column - normalization happens
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

pub(crate) fn read_file(path: &str) -> Result<ImportFileContent, String> {
    files::read_file(path)
}

pub(crate) async fn preview(
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
        let status = domain::normalize_status(row.status.as_deref().unwrap_or(""));
        let is_duplicate = persistence::company_role_exists(pool, &company, &role)
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

pub(crate) async fn confirm(
    rows: Vec<ImportRawRow>,
    imported_from: &str,
    followup_days_after_apply: i64,
    pool: &SqlitePool,
) -> Result<ImportResult, String> {
    let mut inserted = 0i64;
    let mut skipped_duplicate = 0i64;

    for (i, row) in rows.into_iter().enumerate() {
        let company = row.company.as_deref().unwrap_or("").trim().to_string();
        let role = row.role.as_deref().unwrap_or("").trim().to_string();
        if company.is_empty() || role.is_empty() {
            continue;
        }

        if persistence::company_role_exists(pool, &company, &role)
            .await
            .map_err(|e| format!("import_confirm: dup check: {e}"))?
        {
            skipped_duplicate += 1;
            continue;
        }

        let status = domain::normalize_status(row.status.as_deref().unwrap_or(""));
        let applied_at = row.applied_at.clone();
        let notes = row.notes.clone();

        // No real JD text exists for an imported row - hash the row's own
        // identity (plus its position, in case two rows are literally
        // identical) so jd_hash stays unique without colliding across rows.
        let jd_hash = stable_hash(&format!(
            "import#{i}|{company}|{role}|{status}|{applied_at:?}|{notes:?}"
        ));

        persistence::insert_imported(
            pool,
            persistence::ImportedRow {
                company: &company,
                role: &role,
                status,
                jd_hash: &jd_hash,
                imported_from,
                row: &row,
                followup_days_after_apply,
            },
        )
        .await?;

        inserted += 1;
    }

    Ok(ImportResult {
        inserted,
        skipped_duplicate,
    })
}

#[cfg(test)]
mod pipeline {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

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
        let preview = preview(rows, &pool).await.unwrap();
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

        let result = confirm(rows, "import_xlsx", 7, &pool).await.unwrap();
        assert_eq!(result.inserted, 1);

        let tech_stack: Option<String> = sqlx::query_scalar("SELECT tech_stack FROM jobs")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(tech_stack.as_deref(), Some("Rust, Postgres"));

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
        let result = confirm(rows, "import_csv", 7, &pool).await.unwrap();
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

        let follow_up_at: Option<String> =
            sqlx::query_scalar("SELECT follow_up_at FROM applications WHERE status = 'applied'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(follow_up_at.as_deref(), Some("2026-06-08"));
    }

    #[tokio::test]
    async fn reimporting_the_same_rows_is_all_duplicates_no_double_insert() {
        let pool = test_pool().await;
        let rows = vec![row("Acme Robotics", "Backend Engineer", "Submitted", None)];
        let first = confirm(rows.clone(), "import_csv", 7, &pool).await.unwrap();
        assert_eq!(first.inserted, 1);

        let preview = preview(rows.clone(), &pool).await.unwrap();
        assert!(preview[0].is_duplicate);

        let second = confirm(rows, "import_csv", 7, &pool).await.unwrap();
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
        let result = confirm(rows, "import_csv", 7, &pool).await.unwrap();
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
            confirm(rows, source, 7, &pool).await.unwrap();
        }
        let sources: Vec<String> = sqlx::query_scalar("SELECT imported_from FROM jobs ORDER BY id")
            .fetch_all(&pool)
            .await
            .unwrap();
        assert_eq!(
            sources,
            vec!["import_csv", "import_xlsx", "import_json", "import_text"]
        );
    }
}
