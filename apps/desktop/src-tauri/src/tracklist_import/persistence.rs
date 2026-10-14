//! Job and application rows created by a confirmed tracklist import.

use sqlx::SqlitePool;

use super::ImportRawRow;

pub(crate) async fn company_role_exists(
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

pub(crate) struct ImportedRow<'a> {
    pub company: &'a str,
    pub role: &'a str,
    pub status: &'a str,
    pub jd_hash: &'a str,
    pub imported_from: &'a str,
    pub row: &'a ImportRawRow,
    pub followup_days_after_apply: i64,
}

pub(crate) async fn insert_imported(pool: &SqlitePool, row: ImportedRow<'_>) -> Result<(), String> {
    let job_res = sqlx::query(
        "INSERT INTO jobs
           (company, title, jd_hash, source, hard_filter_passed,
            legitimacy_tier, imported_from, tech_stack, created_at)
         VALUES (?, ?, ?, 'import', 1, 'green', ?, ?, datetime('now'))",
    )
    .bind(row.company)
    .bind(row.role)
    .bind(row.jd_hash)
    .bind(row.imported_from)
    .bind(&row.row.tech_stack)
    .execute(pool)
    .await
    .map_err(|e| format!("import_confirm: insert job: {e}"))?;

    let job_id = job_res.last_insert_rowid();
    let applied_at = row.row.applied_at.clone();

    let app_res = sqlx::query(
        "INSERT INTO applications
           (job_id, status, applied_at, notes, source_url, contact_name,
            contact_role, contact_channel, next_action, next_action_at,
            salary_range, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
    )
    .bind(job_id)
    .bind(row.status)
    .bind(&applied_at)
    .bind(&row.row.notes)
    .bind(&row.row.source_url)
    .bind(&row.row.contact_name)
    .bind(&row.row.contact_role)
    .bind(&row.row.contact_channel)
    .bind(&row.row.next_action)
    .bind(&row.row.next_action_at)
    .bind(&row.row.salary_range)
    .execute(pool)
    .await
    .map_err(|e| format!("import_confirm: insert application: {e}"))?;

    if row.status == "applied" {
        if let Some(applied) = &applied_at {
            sqlx::query(
                "UPDATE applications SET follow_up_at = date(?, '+' || ? || ' days') WHERE id = ?",
            )
            .bind(applied)
            .bind(row.followup_days_after_apply)
            .bind(app_res.last_insert_rowid())
            .execute(pool)
            .await
            .map_err(|e| format!("import_confirm: set follow_up_at: {e}"))?;
        }
    }

    Ok(())
}
