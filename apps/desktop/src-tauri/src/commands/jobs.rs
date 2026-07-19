use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::{stable_hash, Db};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: i64,
    pub company: Option<String>,
    pub title: Option<String>,
    pub jd_text: Option<String>,
    pub jd_hash: Option<String>,
    pub source: Option<String>,
    pub location: Option<String>,
    pub language: Option<String>,
    pub salary_min: Option<i64>,
    pub blue_card_eligible: Option<bool>,
    pub hard_filter_passed: Option<bool>,
    pub legitimacy_tier: Option<String>,
    pub legitimacy_notes: Option<String>,
    pub imported_from: Option<String>,
    pub discover_dismissed: Option<bool>,
    pub discover_shown_at: Option<String>,
    pub tech_stack: Option<String>,
    pub created_at: Option<String>,
}

/// Payload from the frontend. `jd_hash` is intentionally NOT accepted — it is
/// always computed in Rust from `jd_text` so dedupe stays authoritative.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobInput {
    pub company: Option<String>,
    pub title: Option<String>,
    pub jd_text: String,
    pub source: Option<String>,
    pub location: Option<String>,
    pub language: Option<String>,
    pub salary_min: Option<i64>,
    pub blue_card_eligible: Option<bool>,
    pub hard_filter_passed: Option<bool>,
    pub tech_stack: Option<String>,
}

#[tauri::command]
pub async fn db_list_jobs(db: State<'_, Db>) -> Result<Vec<Job>, String> {
    // Discover-scanned jobs stay out of My Jobs until the user saves them
    // (saving creates an application row). Everything else is always listed.
    sqlx::query_as::<_, Job>(
        "SELECT * FROM jobs j
         WHERE COALESCE(j.imported_from, '') != 'discover_scan'
            OR EXISTS(SELECT 1 FROM applications a WHERE a.job_id = j.id)
         ORDER BY j.created_at DESC, j.id DESC",
    )
    .fetch_all(&db.pool)
    .await
    .map_err(|e| format!("db_list_jobs: {e}"))
}

/// One row per job for the My Jobs table: the job's columns plus its latest
/// score and current application status (correlated subqueries, 0 tokens).
/// Read-only; sort/filter/search happen client-side over this small local list.
#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct JobOverview {
    pub id: i64,
    pub company: Option<String>,
    pub title: Option<String>,
    pub source: Option<String>,
    pub location: Option<String>,
    pub legitimacy_tier: Option<String>,
    pub created_at: Option<String>,
    pub score: Option<f64>,
    pub status: Option<String>,
}

#[tauri::command]
pub async fn db_list_jobs_overview(db: State<'_, Db>) -> Result<Vec<JobOverview>, String> {
    sqlx::query_as::<_, JobOverview>(
        "SELECT
           j.id, j.company, j.title, j.source, j.location,
           j.legitimacy_tier, j.created_at,
           (SELECT sc.score FROM scoring_cache sc
              WHERE sc.job_id = j.id ORDER BY sc.id DESC LIMIT 1) AS score,
           (SELECT a.status FROM applications a
              WHERE a.job_id = j.id ORDER BY a.id DESC LIMIT 1) AS status
         FROM jobs j
         WHERE COALESCE(j.imported_from, '') != 'discover_scan'
            OR EXISTS(SELECT 1 FROM applications a WHERE a.job_id = j.id)
         ORDER BY j.created_at DESC, j.id DESC",
    )
    .fetch_all(&db.pool)
    .await
    .map_err(|e| format!("db_list_jobs_overview: {e}"))
}

#[tauri::command]
pub async fn db_get_job(id: i64, db: State<'_, Db>) -> Result<Option<Job>, String> {
    sqlx::query_as::<_, Job>("SELECT * FROM jobs WHERE id = ?")
        .bind(id)
        .fetch_optional(&db.pool)
        .await
        .map_err(|e| format!("db_get_job: {e}"))
}

#[tauri::command]
pub async fn db_upsert_job(job: JobInput, db: State<'_, Db>) -> Result<Job, String> {
    // jd_hash is the dedupe key (0 tokens). Re-pasting the same JD updates in place.
    let jd_hash = stable_hash(&job.jd_text);

    sqlx::query(
        "INSERT INTO jobs
           (company, title, jd_text, jd_hash, source, location, language,
            salary_min, blue_card_eligible, hard_filter_passed, tech_stack, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(jd_hash) DO UPDATE SET
           company            = excluded.company,
           title              = excluded.title,
           source             = excluded.source,
           location           = excluded.location,
           language           = excluded.language,
           salary_min         = excluded.salary_min,
           blue_card_eligible = excluded.blue_card_eligible,
           hard_filter_passed = excluded.hard_filter_passed,
           tech_stack         = excluded.tech_stack",
    )
    .bind(&job.company)
    .bind(&job.title)
    .bind(&job.jd_text)
    .bind(&jd_hash)
    .bind(&job.source)
    .bind(&job.location)
    .bind(&job.language)
    .bind(job.salary_min)
    .bind(job.blue_card_eligible)
    .bind(job.hard_filter_passed)
    .bind(&job.tech_stack)
    .execute(&db.pool)
    .await
    .map_err(|e| format!("db_upsert_job: {e}"))?;

    sqlx::query_as::<_, Job>("SELECT * FROM jobs WHERE jd_hash = ?")
        .bind(&jd_hash)
        .fetch_one(&db.pool)
        .await
        .map_err(|e| format!("db_upsert_job (reload): {e}"))
}

/// Deletes a job and every row that transitively references it. There is no
/// `ON DELETE CASCADE` in the schema (see migrations) and `foreign_keys` is
/// ON (db.rs), so a bare `DELETE FROM jobs` would fail the moment any child
/// row exists — which is the normal case for any scored/applied-to job.
/// Deletes bottom-up inside one transaction: deepest dependents first
/// (interview_prep -> interview_stages -> application-scoped tables ->
/// applications), then everything hanging directly off the job, then the
/// job itself. This is a hard, irreversible delete — the frontend must
/// confirm with the user before calling this.
#[tauri::command]
pub async fn db_delete_job(id: i64, db: State<'_, Db>) -> Result<(), String> {
    db_delete_job_core(id, &db.pool).await
}

async fn db_delete_job_core(id: i64, pool: &sqlx::SqlitePool) -> Result<(), String> {
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("db_delete_job (begin): {e}"))?;

    sqlx::query(
        "DELETE FROM interview_prep WHERE stage_id IN (
           SELECT id FROM interview_stages WHERE application_id IN (
             SELECT id FROM applications WHERE job_id = ?
           )
         )",
    )
    .bind(id)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("db_delete_job (interview_prep): {e}"))?;

    sqlx::query(
        "DELETE FROM interview_stages WHERE application_id IN (
           SELECT id FROM applications WHERE job_id = ?
         )",
    )
    .bind(id)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("db_delete_job (interview_stages): {e}"))?;

    for table in [
        "application_comments",
        "pitches",
        "company_research",
        "status_history",
    ] {
        sqlx::query(&format!(
            "DELETE FROM {table} WHERE application_id IN (
               SELECT id FROM applications WHERE job_id = ?
             )"
        ))
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("db_delete_job ({table}): {e}"))?;
    }

    sqlx::query("DELETE FROM applications WHERE job_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("db_delete_job (applications): {e}"))?;

    for table in [
        "portal_answers",
        "tailoring_cache",
        "generated_docs",
        "scoring_cache",
    ] {
        sqlx::query(&format!("DELETE FROM {table} WHERE job_id = ?"))
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("db_delete_job ({table}): {e}"))?;
    }

    sqlx::query("DELETE FROM jobs WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("db_delete_job (jobs): {e}"))?;

    tx.commit()
        .await
        .map_err(|e| format!("db_delete_job (commit): {e}"))
}

#[cfg(test)]
mod delete_tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::SqlitePool;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .expect("open in-memory sqlite");
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await
            .expect("enable foreign keys");
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("run migrations");
        pool
    }

    async fn seed_full_job_graph(pool: &SqlitePool) -> i64 {
        let job_id: i64 = sqlx::query_scalar(
            "INSERT INTO jobs (jd_text, jd_hash, created_at) VALUES ('jd', 'hash-1', datetime('now')) RETURNING id",
        )
        .fetch_one(pool)
        .await
        .expect("insert job");

        let application_id: i64 = sqlx::query_scalar(
            "INSERT INTO applications (job_id, status, updated_at)
             VALUES (?, 'applied', datetime('now')) RETURNING id",
        )
        .bind(job_id)
        .fetch_one(pool)
        .await
        .expect("insert application");

        let stage_id: i64 = sqlx::query_scalar(
            "INSERT INTO interview_stages (application_id, stage_order, status)
             VALUES (?, 1, 'upcoming') RETURNING id",
        )
        .bind(application_id)
        .fetch_one(pool)
        .await
        .expect("insert interview_stages");

        sqlx::query("INSERT INTO interview_prep (stage_id, format) VALUES (?, 'qa')")
            .bind(stage_id)
            .execute(pool)
            .await
            .expect("insert interview_prep");

        sqlx::query("INSERT INTO status_history (application_id, status, changed_at) VALUES (?, 'applied', datetime('now'))")
            .bind(application_id)
            .execute(pool)
            .await
            .expect("insert status_history");

        sqlx::query("INSERT INTO application_comments (application_id, comment_text, created_at) VALUES (?, 'hi', datetime('now'))")
            .bind(application_id)
            .execute(pool)
            .await
            .expect("insert application_comments");

        sqlx::query(
            "INSERT INTO pitches (application_id, language, pitch_text) VALUES (?, 'en', 'pitch')",
        )
        .bind(application_id)
        .execute(pool)
        .await
        .expect("insert pitches");

        sqlx::query("INSERT INTO company_research (application_id, summary) VALUES (?, 'summary')")
            .bind(application_id)
            .execute(pool)
            .await
            .expect("insert company_research");

        sqlx::query("INSERT INTO scoring_cache (job_id, score) VALUES (?, 80)")
            .bind(job_id)
            .execute(pool)
            .await
            .expect("insert scoring_cache");

        sqlx::query("INSERT INTO tailoring_cache (job_id, pass, input_hash, result_md) VALUES (?, 1, 'h', 'md')")
            .bind(job_id)
            .execute(pool)
            .await
            .expect("insert tailoring_cache");

        sqlx::query("INSERT INTO generated_docs (job_id, doc_type, export_format, input_hash, file_path) VALUES (?, 'cv', 'pdf', 'h', '/tmp/x.pdf')")
            .bind(job_id)
            .execute(pool)
            .await
            .expect("insert generated_docs");

        sqlx::query(
            "INSERT INTO portal_answers (job_id, profile_hash, input_hash) VALUES (?, 'p', 'h')",
        )
        .bind(job_id)
        .execute(pool)
        .await
        .expect("insert portal_answers");

        job_id
    }

    /// Deleting a fully-populated job graph must not hit the foreign-key
    /// constraint (foreign_keys=ON) and must leave zero orphaned rows in any
    /// dependent table.
    #[tokio::test]
    async fn deletes_job_and_every_dependent_row() {
        let pool = test_pool().await;
        let job_id = seed_full_job_graph(&pool).await;

        db_delete_job_core(job_id, &pool).await.expect("delete job");

        let job: Option<i64> = sqlx::query_scalar("SELECT id FROM jobs WHERE id = ?")
            .bind(job_id)
            .fetch_optional(&pool)
            .await
            .unwrap();
        assert!(job.is_none());

        for table in [
            "scoring_cache",
            "applications",
            "generated_docs",
            "tailoring_cache",
            "portal_answers",
        ] {
            let count: i64 =
                sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table} WHERE job_id = ?"))
                    .bind(job_id)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(count, 0, "{table} still has rows for deleted job");
        }

        let orphan_stages: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM interview_stages")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(orphan_stages, 0);

        let orphan_prep: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM interview_prep")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(orphan_prep, 0);
    }

    /// Deleting a job with no applications/scoring/etc. at all is a no-op
    /// beyond removing the `jobs` row — must not error.
    #[tokio::test]
    async fn deletes_job_with_no_dependents() {
        let pool = test_pool().await;
        let job_id: i64 = sqlx::query_scalar(
            "INSERT INTO jobs (jd_text, jd_hash, created_at) VALUES ('jd', 'hash-bare', datetime('now')) RETURNING id",
        )
        .fetch_one(&pool)
        .await
        .expect("insert job");

        db_delete_job_core(job_id, &pool).await.expect("delete job");

        let job: Option<i64> = sqlx::query_scalar("SELECT id FROM jobs WHERE id = ?")
            .bind(job_id)
            .fetch_optional(&pool)
            .await
            .unwrap();
        assert!(job.is_none());
    }
}
