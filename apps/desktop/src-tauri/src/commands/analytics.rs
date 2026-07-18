//! Analytics facts — the raw, per-application signals the Analytics screen
//! needs to draw its funnel, KPIs, and trend. All aggregation math (bucketing,
//! conversion %, deltas, low-data thresholds) lives in the frontend pure module
//! `@applye/core` `computeAnalytics`, so this command stays a thin, honest read:
//! it emits one row per application enriched with the cumulative-funnel signals
//! that are cheapest to compute in SQL (status history + interview-stage
//! existence), plus the raw follow-up-draft timestamps.

use serde::Serialize;
use tauri::State;

use crate::db::Db;

/// One application, reduced to the signals the funnel needs. `reached_*` are
/// cumulative: an application that reached `offer` also counts as having
/// reached `interview`. They are derived from history + stage existence, not
/// only the current status, so an offer that was later rejected still counts as
/// an offer that happened.
#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsApplication {
    /// Current status literal: saved/applied/interview/offer/rejected/cancelled.
    pub status: Option<String>,
    /// When the application was actually sent. NULL for saved-but-never-applied.
    pub applied_at: Option<String>,
    /// Best-effort "entered the pipeline" timestamp: first `saved` transition,
    /// else the applied date, else the last mutation. Used to place saved-only
    /// applications on the period timeline.
    pub saved_at: Option<String>,
    /// Reached an interview stage at any point (status, history, or a logged
    /// interview stage).
    pub reached_interview: bool,
    /// Received an offer at any point (current status or history).
    pub reached_offer: bool,
    /// Archived applications are hidden from the active Tracker but still
    /// happened — analytics counts them.
    pub archived: bool,
    /// Latest ATS-fit score (0..100) for this application's job, or NULL when
    /// the job was never scored (scoring is opt-in AI).
    pub score: Option<f64>,
    /// When the employer first responded — the earliest `interview`/`offer`
    /// status transition. NULL when no response was ever recorded. Paired with
    /// `applied_at` this gives time-to-response.
    pub first_response_at: Option<String>,
}

/// A follow-up draft timestamp. NOTE: Applye never sends mail (it hands off to
/// `mailto:`), so this marks a follow-up that was *drafted*, not confirmed
/// sent — the closest local signal for follow-up effort.
#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsFollowup {
    pub created_at: Option<String>,
}

/// Everything the Analytics screen needs, in one round trip. The dataset is a
/// single local user's own applications, so returning every row is cheap and
/// lets the frontend switch periods with no further calls.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsFacts {
    pub applications: Vec<AnalyticsApplication>,
    pub followups: Vec<AnalyticsFollowup>,
}

#[tauri::command]
pub async fn db_analytics_facts(db: State<'_, Db>) -> Result<AnalyticsFacts, String> {
    db_analytics_facts_core(&db.pool).await
}

async fn db_analytics_facts_core(pool: &sqlx::SqlitePool) -> Result<AnalyticsFacts, String> {
    let applications = sqlx::query_as::<_, AnalyticsApplication>(
        "SELECT
           a.status,
           a.applied_at,
           COALESCE(
             (SELECT MIN(sh.changed_at) FROM status_history sh
                WHERE sh.application_id = a.id AND sh.status = 'saved'),
             a.applied_at,
             a.updated_at
           ) AS saved_at,
           (a.status IN ('interview', 'offer')
             OR EXISTS (SELECT 1 FROM interview_stages ist
                          WHERE ist.application_id = a.id)
             OR EXISTS (SELECT 1 FROM status_history sh
                          WHERE sh.application_id = a.id
                            AND sh.status IN ('interview', 'offer'))
           ) AS reached_interview,
           (a.status = 'offer'
             OR EXISTS (SELECT 1 FROM status_history sh
                          WHERE sh.application_id = a.id AND sh.status = 'offer')
           ) AS reached_offer,
           a.archived,
           sc.score AS score,
           (SELECT MIN(sh.changed_at) FROM status_history sh
              WHERE sh.application_id = a.id
                AND sh.status IN ('interview', 'offer')) AS first_response_at
         FROM applications a
         LEFT JOIN (
           SELECT job_id, MAX(id) AS max_id FROM scoring_cache GROUP BY job_id
         ) latest ON latest.job_id = a.job_id
         LEFT JOIN scoring_cache sc ON sc.id = latest.max_id
         ORDER BY a.applied_at ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("db_analytics_facts(applications): {e}"))?;

    let followups = sqlx::query_as::<_, AnalyticsFollowup>(
        "SELECT created_at FROM followup_drafts ORDER BY created_at ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("db_analytics_facts(followups): {e}"))?;

    Ok(AnalyticsFacts {
        applications,
        followups,
    })
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

    async fn insert_job(pool: &SqlitePool, tag: &str) -> i64 {
        sqlx::query_scalar(
            "INSERT INTO jobs (jd_text, jd_hash, created_at)
             VALUES ('jd', ?, datetime('now')) RETURNING id",
        )
        .bind(format!("hash-{tag}"))
        .fetch_one(pool)
        .await
        .expect("insert job")
    }

    /// Insert an application with an explicit status and applied date.
    async fn insert_app(pool: &SqlitePool, status: &str, applied_at: Option<&str>) -> i64 {
        let job_id = insert_job(pool, status).await;
        sqlx::query_scalar(
            "INSERT INTO applications (job_id, status, applied_at, updated_at)
             VALUES (?, ?, ?, datetime('now')) RETURNING id",
        )
        .bind(job_id)
        .bind(status)
        .bind(applied_at)
        .fetch_one(pool)
        .await
        .expect("insert application")
    }

    #[tokio::test]
    async fn empty_db_returns_empty_facts() {
        let pool = test_pool().await;
        let facts = db_analytics_facts_core(&pool).await.expect("facts");
        assert!(facts.applications.is_empty());
        assert!(facts.followups.is_empty());
    }

    #[tokio::test]
    async fn reached_interview_from_current_status() {
        let pool = test_pool().await;
        insert_app(&pool, "interview", Some("2026-06-01")).await;
        let facts = db_analytics_facts_core(&pool).await.expect("facts");
        assert_eq!(facts.applications.len(), 1);
        let a = &facts.applications[0];
        assert!(a.reached_interview, "status=interview implies reached");
        assert!(!a.reached_offer);
        assert_eq!(a.applied_at.as_deref(), Some("2026-06-01"));
    }

    #[tokio::test]
    async fn reached_interview_from_logged_stage() {
        let pool = test_pool().await;
        // Current status is only 'applied', but a stage was logged.
        let app_id = insert_app(&pool, "applied", Some("2026-06-02")).await;
        sqlx::query(
            "INSERT INTO interview_stages (application_id, stage_order, stage_type, status)
             VALUES (?, 1, 'hr_screen', 'scheduled')",
        )
        .bind(app_id)
        .execute(&pool)
        .await
        .expect("insert stage");
        let facts = db_analytics_facts_core(&pool).await.expect("facts");
        assert!(
            facts.applications[0].reached_interview,
            "a logged interview stage implies reached-interview even at status=applied"
        );
    }

    #[tokio::test]
    async fn offer_counts_even_after_later_rejection() {
        let pool = test_pool().await;
        // Application is currently 'rejected' but history shows an offer happened.
        let app_id = insert_app(&pool, "rejected", Some("2026-06-03")).await;
        sqlx::query(
            "INSERT INTO status_history (application_id, status, changed_at)
             VALUES (?, 'offer', '2026-06-10')",
        )
        .bind(app_id)
        .execute(&pool)
        .await
        .expect("insert history");
        let facts = db_analytics_facts_core(&pool).await.expect("facts");
        let a = &facts.applications[0];
        assert!(
            a.reached_offer,
            "a historical offer still counts as an offer"
        );
        assert!(
            a.reached_interview,
            "reaching offer implies having reached interview via history"
        );
    }

    #[tokio::test]
    async fn saved_only_application_has_no_applied_date_but_a_saved_at() {
        let pool = test_pool().await;
        insert_app(&pool, "saved", None).await;
        let facts = db_analytics_facts_core(&pool).await.expect("facts");
        let a = &facts.applications[0];
        assert!(a.applied_at.is_none());
        assert!(
            a.saved_at.is_some(),
            "saved_at falls back to updated_at when there is no applied date"
        );
        assert!(!a.reached_interview);
        assert!(!a.reached_offer);
    }

    #[tokio::test]
    async fn score_is_the_latest_for_the_job_or_null() {
        let pool = test_pool().await;
        // App with no scoring row -> NULL score.
        insert_app(&pool, "applied", Some("2026-06-01")).await;
        // App whose job has two scores -> the latest (highest id) wins.
        let job_id = insert_job(&pool, "scored").await;
        sqlx::query("INSERT INTO applications (job_id, status, applied_at) VALUES (?, 'applied', '2026-06-02')")
            .bind(job_id)
            .execute(&pool)
            .await
            .expect("insert app");
        for s in [61.0_f64, 82.0_f64] {
            sqlx::query("INSERT INTO scoring_cache (job_id, profile_hash, score) VALUES (?, ?, ?)")
                .bind(job_id)
                .bind(format!("ph-{s}"))
                .bind(s)
                .execute(&pool)
                .await
                .expect("insert score");
        }
        let facts = db_analytics_facts_core(&pool).await.expect("facts");
        let scored: Vec<_> = facts.applications.iter().filter_map(|a| a.score).collect();
        assert_eq!(scored, vec![82.0], "only the scored job, latest score");
    }

    #[tokio::test]
    async fn first_response_at_is_the_earliest_interview_or_offer_transition() {
        let pool = test_pool().await;
        let app_id = insert_app(&pool, "offer", Some("2026-06-01")).await;
        for (status, at) in [("interview", "2026-06-12"), ("offer", "2026-06-20")] {
            sqlx::query(
                "INSERT INTO status_history (application_id, status, changed_at) VALUES (?, ?, ?)",
            )
            .bind(app_id)
            .bind(status)
            .bind(at)
            .execute(&pool)
            .await
            .expect("insert history");
        }
        // An application with no response transition at all.
        insert_app(&pool, "applied", Some("2026-06-05")).await;
        let facts = db_analytics_facts_core(&pool).await.expect("facts");
        let with = facts.applications.iter().find(|a| a.first_response_at.is_some()).unwrap();
        assert_eq!(with.first_response_at.as_deref(), Some("2026-06-12"), "earliest response wins");
        assert!(facts.applications.iter().any(|a| a.first_response_at.is_none()));
    }

    #[tokio::test]
    async fn followups_are_returned_in_order() {
        let pool = test_pool().await;
        let app_id = insert_app(&pool, "applied", Some("2026-06-04")).await;
        for (i, ts) in ["2026-06-05", "2026-06-07"].iter().enumerate() {
            sqlx::query(
                "INSERT INTO followup_drafts (application_id, input_hash, body, created_at)
                 VALUES (?, ?, 'b', ?)",
            )
            .bind(app_id)
            .bind(format!("h{i}"))
            .bind(ts)
            .execute(&pool)
            .await
            .expect("insert followup");
        }
        let facts = db_analytics_facts_core(&pool).await.expect("facts");
        assert_eq!(facts.followups.len(), 2);
        assert_eq!(facts.followups[0].created_at.as_deref(), Some("2026-06-05"));
    }
}
