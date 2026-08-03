// Phase 6.7: deterministic, 0-token diagnostics. Every check here is local -
// keychain presence, SQLite read/write, the sqlx migration ledger, bundled
// Tauri capabilities, filesystem writability. Nothing here calls the network
// or an AI provider. Whether a stored key actually WORKS is a separate,
// explicitly user-triggered action (Settings' "Test connection") - this
// report only ever says "stored" or "not stored yet", never "valid".

use std::path::Path;

use serde::Serialize;
use tauri::{Manager, State};

use crate::db::Db;
use crate::keys::KeyStore;

const REQUIRED_CAPABILITIES: &[&str] = &["core:default", "dialog:default", "updater:default"];
const CAPABILITIES_JSON: &str = include_str!("../../capabilities/default.json");

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheckItem {
    pub key: String,
    pub label: String,
    /// "ok" | "warn" | "fail"
    pub status: String,
    pub detail: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub items: Vec<HealthCheckItem>,
    /// Worst status across `items` - "ok" | "warn" | "fail".
    pub overall: String,
}

fn item(key: &str, label: &str, status: &str, detail: impl Into<String>) -> HealthCheckItem {
    HealthCheckItem {
        key: key.to_string(),
        label: label.to_string(),
        status: status.to_string(),
        detail: detail.into(),
    }
}

fn worst(items: &[HealthCheckItem]) -> String {
    if items.iter().any(|i| i.status == "fail") {
        "fail".to_string()
    } else if items.iter().any(|i| i.status == "warn") {
        "warn".to_string()
    } else {
        "ok".to_string()
    }
}

/// A harmless no-op write (a column set to itself) inside a transaction that
/// is always rolled back - proves the DB file/WAL is actually writable
/// without leaving any trace.
async fn check_database(pool: &sqlx::SqlitePool) -> HealthCheckItem {
    if sqlx::query_scalar::<_, i64>("SELECT 1")
        .fetch_one(pool)
        .await
        .is_err()
    {
        return item(
            "database",
            "Database",
            "fail",
            "Cannot read the local database.",
        );
    }

    let Ok(mut tx) = pool.begin().await else {
        return item(
            "database",
            "Database",
            "fail",
            "Cannot open a database transaction.",
        );
    };
    let write_ok =
        sqlx::query("UPDATE settings SET health_check_seen = health_check_seen WHERE id = 1")
            .execute(&mut *tx)
            .await;
    let _ = tx.rollback().await;

    match write_ok {
        Ok(_) => item("database", "Database", "ok", "Readable and writable."),
        Err(e) => item(
            "database",
            "Database",
            "fail",
            format!("Database is not writable: {e}"),
        ),
    }
}

/// sqlx records one row per migration with a `success` flag - the ledger it
/// keeps for itself is the ground truth for "did every migration apply
/// cleanly", cheaper and more honest than re-deriving it from table shape.
async fn check_migrations(pool: &sqlx::SqlitePool) -> HealthCheckItem {
    let failed: Result<i64, _> =
        sqlx::query_scalar("SELECT COUNT(*) FROM _sqlx_migrations WHERE success = 0")
            .fetch_one(pool)
            .await;
    match failed {
        Ok(0) => item(
            "migrations",
            "Database migrations",
            "ok",
            "All migrations applied cleanly.",
        ),
        Ok(n) => item(
            "migrations",
            "Database migrations",
            "fail",
            format!("{n} migration(s) failed to apply."),
        ),
        Err(e) => item(
            "migrations",
            "Database migrations",
            "warn",
            format!("Could not read the migration ledger: {e}"),
        ),
    }
}

/// Presence only, from the OS keychain - never a network call. CLI mode
/// needs no stored key at all.
async fn check_api_key(ai_mode: &str, provider: &str) -> HealthCheckItem {
    if ai_mode == "cli" {
        // "No key needed" was true but useless: it reported ok even when the
        // configured CLI was missing or broken, so health said fine and the
        // first real task failed. Check that the CLI actually runs.
        return match crate::ai::cli_probe::cli_health(provider).await {
            Ok(version) => item(
                "api_key",
                "AI provider CLI",
                "ok",
                format!("CLI mode - {version}. No stored key needed."),
            ),
            Err(reason) => item("api_key", "AI provider CLI", "error", reason),
        };
    }
    match KeyStore::get_key(provider) {
        Ok(Some(_)) => item(
            "api_key",
            "AI provider key",
            "ok",
            format!(
                "A key is stored for {provider} (not tested yet - use \"Test connection\" in Settings to verify it works)."
            ),
        ),
        Ok(None) => item(
            "api_key",
            "AI provider key",
            "warn",
            format!("No key stored for {provider} yet. AI features are unavailable until one is added in Settings."),
        ),
        Err(e) => item(
            "api_key",
            "AI provider key",
            "warn",
            format!("Could not read the OS keychain: {e}"),
        ),
    }
}

/// Static check against the capabilities file bundled into the binary at
/// compile time - no filesystem access, no Tauri runtime call.
fn check_capabilities() -> HealthCheckItem {
    let missing: Vec<&str> = REQUIRED_CAPABILITIES
        .iter()
        .filter(|cap| !CAPABILITIES_JSON.contains(*cap))
        .copied()
        .collect();
    if missing.is_empty() {
        item(
            "capabilities",
            "App permissions",
            "ok",
            "All required capabilities are declared.",
        )
    } else {
        item(
            "capabilities",
            "App permissions",
            "fail",
            format!("Missing required capabilities: {}", missing.join(", ")),
        )
    }
}

/// Writes then deletes a tiny probe file - the same shape of check
/// `export_report`/CV export ultimately depend on, just without leaving
/// anything behind.
fn probe_writable(dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    let probe = dir.join(".health_check_probe");
    std::fs::write(&probe, b"ok").map_err(|e| format!("{} is not writable: {e}", dir.display()))?;
    let _ = std::fs::remove_file(&probe);
    Ok(())
}

fn check_export_dir(app: &tauri::AppHandle) -> HealthCheckItem {
    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir());
    let Ok(base) = base else {
        return item(
            "export_dir",
            "Export folder",
            "fail",
            "Could not resolve a Documents or app-data folder.",
        );
    };
    let dir = base.join("Applye");
    match probe_writable(&dir) {
        Ok(()) => item(
            "export_dir",
            "Export folder",
            "ok",
            format!("{} is writable.", dir.display()),
        ),
        Err(e) => item("export_dir", "Export folder", "fail", e),
    }
}

#[tauri::command]
pub async fn health_check(
    app: tauri::AppHandle,
    db: State<'_, Db>,
) -> Result<HealthReport, String> {
    let (ai_mode, provider): (Option<String>, Option<String>) =
        sqlx::query_as("SELECT ai_mode, provider FROM settings WHERE id = 1")
            .fetch_one(&db.pool)
            .await
            .map_err(|e| format!("health_check settings: {e}"))?;

    let items = vec![
        check_database(&db.pool).await,
        check_migrations(&db.pool).await,
        check_api_key(
            ai_mode.as_deref().unwrap_or("api"),
            provider.as_deref().unwrap_or("claude"),
        )
        .await,
        check_capabilities(),
        check_export_dir(&app),
    ];
    let overall = worst(&items);
    Ok(HealthReport { items, overall })
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

    #[tokio::test]
    async fn database_check_ok_on_fresh_db() {
        let pool = test_pool().await;
        let result = check_database(&pool).await;
        assert_eq!(result.status, "ok");
    }

    #[tokio::test]
    async fn database_write_probe_leaves_no_trace() {
        let pool = test_pool().await;
        let before: i64 = sqlx::query_scalar("SELECT health_check_seen FROM settings WHERE id = 1")
            .fetch_one(&pool)
            .await
            .unwrap();
        check_database(&pool).await;
        let after: i64 = sqlx::query_scalar("SELECT health_check_seen FROM settings WHERE id = 1")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(before, after);
    }

    #[tokio::test]
    async fn migrations_check_ok_when_ledger_is_clean() {
        let pool = test_pool().await;
        let result = check_migrations(&pool).await;
        assert_eq!(result.status, "ok");
    }

    #[tokio::test]
    async fn cli_mode_checks_the_cli_instead_of_the_keychain() {
        // Never reads the keychain in CLI mode; the verdict follows whether
        // the CLI actually runs on this machine, which is what the user will
        // hit on their first task.
        let result = check_api_key("cli", "claude").await;
        assert!(
            matches!(result.status.as_str(), "ok" | "error"),
            "{result:?}"
        );
        assert_eq!(result.label, "AI provider CLI");
    }

    #[tokio::test]
    async fn cli_mode_with_an_unsupported_provider_is_an_error() {
        let result = check_api_key("cli", "deepseek").await;
        assert_eq!(result.status, "error");
    }

    #[test]
    fn capabilities_check_passes_against_the_bundled_file() {
        let result = check_capabilities();
        assert_eq!(result.status, "ok");
    }

    #[test]
    fn writable_dir_probe_succeeds_and_cleans_up() {
        let dir = std::env::temp_dir().join(format!("applye-health-test-{}", std::process::id()));
        probe_writable(&dir).expect("writable");
        assert!(!dir.join(".health_check_probe").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn unwritable_dir_probe_fails() {
        // A path nested under a file (not a directory) can never be created.
        let blocker =
            std::env::temp_dir().join(format!("applye-health-blocker-{}", std::process::id()));
        std::fs::write(&blocker, b"x").unwrap();
        let dir = blocker.join("nested");
        assert!(probe_writable(&dir).is_err());
        let _ = std::fs::remove_file(&blocker);
    }

    #[test]
    fn worst_picks_fail_over_warn_over_ok() {
        let items = vec![
            item("a", "A", "ok", ""),
            item("b", "B", "warn", ""),
            item("c", "C", "fail", ""),
        ];
        assert_eq!(worst(&items), "fail");
        assert_eq!(worst(&items[..2]), "warn");
        assert_eq!(worst(&items[..1]), "ok");
    }
}
