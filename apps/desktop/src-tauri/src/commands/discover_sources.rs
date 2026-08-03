// The discover source registry (ROADMAP §11).
//
// Which feeds exist and which of them are on - a different question from
// running a scan, and the only part of the discover group the user edits
// directly. Built-in rows are the ones the market plan may switch on and off;
// a user-added row is never touched by the plan and is the only kind that can
// be removed. Adding an RSS source goes through the same `require_https` guard
// the fetch layer applies, so a plaintext feed is refused at the point it would
// be stored rather than at the point it would be fetched.

use serde::Serialize;
use sqlx::{Row, SqlitePool};
use tauri::State;

use super::discover_fetch::require_https;
use super::url_parts::extract_host;
use crate::db::Db;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceListItem {
    pub id: i64,
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub source_type: Option<String>,
    pub url: Option<String>,
    pub slug: Option<String>,
    pub is_builtin: bool,
    pub is_enabled: bool,
    pub geo_tags_json: Option<String>,
    pub legality_note: Option<String>,
    pub last_scan_at: Option<String>,
    pub last_scan_json: Option<String>,
}

#[tauri::command]
pub async fn db_list_sources(db: State<'_, Db>) -> Result<Vec<SourceListItem>, String> {
    let rows = sqlx::query(
        "SELECT id, name, type, url, slug, is_builtin, is_enabled,
                geo_tags_json, legality_note, last_scan_at, last_scan_json
         FROM sources
         WHERE type != 'manual'
         ORDER BY is_builtin DESC, id",
    )
    .fetch_all(&db.pool)
    .await
    .map_err(|e| format!("db_list_sources: {e}"))?;

    Ok(rows
        .iter()
        .map(|r| SourceListItem {
            id: r.get("id"),
            name: r.get("name"),
            source_type: r.get("type"),
            url: r.get("url"),
            slug: r.get("slug"),
            is_builtin: r.get::<Option<i64>, _>("is_builtin").unwrap_or(0) == 1,
            is_enabled: r.get::<Option<i64>, _>("is_enabled").unwrap_or(0) == 1,
            geo_tags_json: r.get("geo_tags_json"),
            legality_note: r.get("legality_note"),
            last_scan_at: r.get("last_scan_at"),
            last_scan_json: r.get("last_scan_json"),
        })
        .collect())
}

#[tauri::command]
pub async fn db_set_source_enabled(
    source_id: i64,
    enabled: bool,
    db: State<'_, Db>,
) -> Result<(), String> {
    sqlx::query("UPDATE sources SET is_enabled = ? WHERE id = ?")
        .bind(if enabled { 1 } else { 0 })
        .bind(source_id)
        .execute(&db.pool)
        .await
        .map_err(|e| format!("db_set_source_enabled: {e}"))?;
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketSourceItem {
    pub id: i64,
    pub name: String,
    /// Host only, so the confirmation names exactly what will be contacted.
    pub host: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketSourcePlan {
    pub to_enable: Vec<MarketSourceItem>,
    pub to_disable: Vec<MarketSourceItem>,
}

/// What changing the market would do to the built-in sources. Read-only, and
/// it proposes only rows that would actually change, so the confirmation never
/// lists a source that is already in the right state.
///
/// Enable when the tags intersect the markets; disable when they do not AND the
/// source is not tagged worldwide. The two are disjoint, so a dual-tagged
/// source like Jobicy (`["us","worldwide"]`) is offered for enabling under a US
/// market and left alone under any other. User-added rows are never touched.
async fn market_source_plan(
    pool: &SqlitePool,
    markets: &[String],
) -> Result<MarketSourcePlan, String> {
    let rows = sqlx::query(
        "SELECT id, name, url, is_enabled, geo_tags_json
         FROM sources WHERE is_builtin = 1 ORDER BY id",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("db_market_source_plan: {e}"))?;

    let mut to_enable = Vec::new();
    let mut to_disable = Vec::new();
    for r in rows {
        let id: i64 = r.get("id");
        let name: String = r.get::<Option<String>, _>("name").unwrap_or_default();
        let url: String = r.get::<Option<String>, _>("url").unwrap_or_default();
        let enabled: bool = r.get::<i64, _>("is_enabled") != 0;
        let tags_json: Option<String> = r.get("geo_tags_json");
        let tags: Vec<String> = tags_json
            .as_deref()
            .and_then(|raw| serde_json::from_str::<Vec<String>>(raw).ok())
            .unwrap_or_default()
            .into_iter()
            .map(|t| t.to_lowercase())
            .collect();

        let item = MarketSourceItem {
            id,
            name,
            host: extract_host(&url).unwrap_or_default(),
        };
        let serves = tags.iter().any(|t| markets.contains(t));
        let worldwide = tags.iter().any(|t| t == "worldwide");
        if serves && !enabled {
            to_enable.push(item);
        } else if !serves && !worldwide && enabled {
            to_disable.push(item);
        }
    }
    // A market with no source of its own must not cost the user the sources
    // they already had: if there is nothing to enable, propose nothing at
    // all, disable list included. The Settings UI already renders nothing
    // for an empty plan.
    if to_enable.is_empty() {
        return Ok(MarketSourcePlan {
            to_enable: Vec::new(),
            to_disable: Vec::new(),
        });
    }
    Ok(MarketSourcePlan {
        to_enable,
        to_disable,
    })
}

/// Applies exactly the ids the user confirmed, in one transaction. `is_builtin`
/// is asserted in both statements so a stray id can never flip a user's own
/// source.
async fn apply_market_source_plan(
    pool: &SqlitePool,
    enable_ids: &[i64],
    disable_ids: &[i64],
) -> Result<(), String> {
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("db_apply_market_source_plan (begin): {e}"))?;
    for (ids, value) in [(enable_ids, 1), (disable_ids, 0)] {
        for id in ids {
            sqlx::query("UPDATE sources SET is_enabled = ? WHERE id = ? AND is_builtin = 1")
                .bind(value)
                .bind(id)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("db_apply_market_source_plan: {e}"))?;
        }
    }
    tx.commit()
        .await
        .map_err(|e| format!("db_apply_market_source_plan (commit): {e}"))
}

#[tauri::command]
pub async fn db_market_source_plan(
    markets: Vec<String>,
    db: State<'_, Db>,
) -> Result<MarketSourcePlan, String> {
    let markets: Vec<String> = markets.iter().map(|m| m.trim().to_lowercase()).collect();
    market_source_plan(&db.pool, &markets).await
}

#[tauri::command]
pub async fn db_apply_market_source_plan(
    enable_ids: Vec<i64>,
    disable_ids: Vec<i64>,
    db: State<'_, Db>,
) -> Result<(), String> {
    apply_market_source_plan(&db.pool, &enable_ids, &disable_ids).await
}

/// Add a user source: an RSS feed (url, https-only) or an ATS company board
/// (slug + ats_* type). Created enabled; never builtin.
#[tauri::command]
pub async fn db_add_source(
    name: String,
    source_type: String,
    url: Option<String>,
    slug: Option<String>,
    db: State<'_, Db>,
) -> Result<i64, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("db_add_source: name is required".to_string());
    }
    let (url, slug, note) = match source_type.as_str() {
        "rss" => {
            let url = url.unwrap_or_default().trim().to_string();
            require_https(&url)
                .map_err(|_| "db_add_source: RSS source needs an https:// feed URL".to_string())?;
            (
                url,
                None::<String>,
                "User-added RSS feed - public, machine-readable.",
            )
        }
        "ats_greenhouse" | "ats_lever" | "ats_ashby" | "ats_personio" => {
            let slug = slug.unwrap_or_default().trim().to_lowercase();
            if slug.is_empty() {
                return Err("db_add_source: ATS source needs a company slug".to_string());
            }
            (
                String::new(),
                Some(slug),
                "Tier 3 - public ATS JSON API, built for machine reading.",
            )
        }
        other => return Err(format!("db_add_source: unsupported source type: {other}")),
    };

    let id: i64 = sqlx::query_scalar(
        "INSERT INTO sources
           (name, type, url, slug, is_builtin, is_enabled, geo_tags_json, legality_note, created_at)
         VALUES (?, ?, ?, ?, 0, 1, '[\"worldwide\"]', ?, datetime('now'))
         RETURNING id",
    )
    .bind(&name)
    .bind(&source_type)
    .bind(&url)
    .bind(&slug)
    .bind(note)
    .fetch_one(&db.pool)
    .await
    .map_err(|e| format!("db_add_source: {e}"))?;
    Ok(id)
}

/// Remove a user-added source. Builtin sources can only be disabled.
#[tauri::command]
pub async fn db_remove_source(source_id: i64, db: State<'_, Db>) -> Result<(), String> {
    let result = sqlx::query("DELETE FROM sources WHERE id = ? AND is_builtin = 0")
        .bind(source_id)
        .execute(&db.pool)
        .await
        .map_err(|e| format!("db_remove_source: {e}"))?;
    if result.rows_affected() == 0 {
        return Err("db_remove_source: source not found or builtin".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::discover::tests::test_pool;
    use super::*;

    #[tokio::test]
    async fn the_plan_proposes_only_real_changes() {
        let pool = test_pool().await;
        // test_pool runs the migrations, which seed eleven built-in sources - and
        // several are ua-tagged. Clear them so the fixtures below are the whole
        // world for this test.
        sqlx::query("DELETE FROM sources")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO sources (id, name, type, url, is_builtin, is_enabled, geo_tags_json) VALUES
               (100, 'DOU', 'rss', 'https://jobs.dou.ua/x', 1, 0, '[\"ua\"]'),
               (101, 'Djinni', 'rss', 'https://djinni.co/x', 1, 1, '[\"ua\"]'),
               (102, 'Habr', 'rss', 'https://career.habr.com/x', 1, 1, '[\"ru\"]'),
               (103, 'Remotive', 'api', 'https://remotive.com/x', 1, 1, '[\"worldwide\"]'),
               (104, 'Jobicy', 'rss', 'https://jobicy.com/x', 1, 1, '[\"us\",\"worldwide\"]'),
               (105, 'Mine', 'rss', 'https://example.com/x', 0, 1, '[\"de\"]')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let plan = market_source_plan(&pool, &["ua".to_string()])
            .await
            .unwrap();

        // Only the disabled Ukrainian source is worth enabling; Djinni is already on.
        assert_eq!(
            plan.to_enable.iter().map(|s| s.id).collect::<Vec<_>>(),
            vec![100]
        );
        assert_eq!(plan.to_enable[0].host, "jobs.dou.ua");
        // Habr is another market. Remotive and Jobicy carry worldwide, so they are
        // left alone; source 105 is user-added and is never touched.
        assert_eq!(
            plan.to_disable.iter().map(|s| s.id).collect::<Vec<_>>(),
            vec![102]
        );
    }

    #[tokio::test]
    async fn applying_the_plan_touches_only_builtin_rows() {
        let pool = test_pool().await;
        // test_pool runs the migrations, which seed eleven built-in sources - and
        // several are ua-tagged. Clear them so the fixtures below are the whole
        // world for this test.
        sqlx::query("DELETE FROM sources")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO sources (id, name, type, url, is_builtin, is_enabled, geo_tags_json) VALUES
               (200, 'DOU', 'rss', 'https://jobs.dou.ua/x', 1, 0, '[\"ua\"]'),
               (201, 'Habr', 'rss', 'https://career.habr.com/x', 1, 1, '[\"ru\"]'),
               (202, 'Mine', 'rss', 'https://example.com/x', 0, 1, '[\"de\"]')",
        )
        .execute(&pool)
        .await
        .unwrap();

        apply_market_source_plan(&pool, &[200], &[201, 202])
            .await
            .unwrap();

        let enabled: Vec<(i64, i64)> =
            sqlx::query_as("SELECT id, is_enabled FROM sources ORDER BY id")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(enabled, vec![(200, 1), (201, 0), (202, 1)]);
    }

    #[tokio::test]
    async fn a_market_with_no_source_of_its_own_proposes_nothing() {
        let pool = test_pool().await;
        sqlx::query("DELETE FROM sources")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO sources (id, name, type, url, is_builtin, is_enabled, geo_tags_json) VALUES
               (300, 'Habr', 'rss', 'https://career.habr.com/x', 1, 1, '[\"ru\"]'),
               (301, 'Remotive', 'api', 'https://remotive.com/x', 1, 1, '[\"worldwide\"]')",
        )
        .execute(&pool)
        .await
        .unwrap();

        // No source is tagged "gb", so there is nothing to gain and the user must
        // not lose Habr for it.
        let plan = market_source_plan(&pool, &["gb".to_string()])
            .await
            .unwrap();
        assert!(plan.to_enable.is_empty());
        assert!(plan.to_disable.is_empty());
    }
}
