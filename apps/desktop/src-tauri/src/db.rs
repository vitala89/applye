// Database layer — SQLite via sqlx (Phase 1).
// WAL mode, single shared connection pool, all queries async.
// The pool is held in Tauri managed state; all SQL lives in Rust (commands/*).

use std::path::Path;

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::SqlitePool;

/// Shared database handle stored in Tauri state.
pub struct Db {
    pub pool: SqlitePool,
}

impl Db {
    /// Open (or create) `applye.db` in the app-data directory, enable WAL +
    /// foreign keys, and run all pending migrations. Idempotent across launches.
    pub async fn init(app_data_dir: &Path) -> Result<Self, String> {
        // Tauri's sandbox / a fresh install may not have the dir yet.
        std::fs::create_dir_all(app_data_dir).map_err(|e| format!("create app data dir: {e}"))?;

        let path = app_data_dir.join("applye.db");

        let options = SqliteConnectOptions::new()
            .filename(&path)
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal)
            .foreign_keys(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await
            .map_err(|e| format!("open database: {e}"))?;

        // Migrations are embedded at compile time from ./migrations.
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .map_err(|e| format!("run migrations: {e}"))?;

        Ok(Self { pool })
    }
}

/// Stable, dependency-free hash of normalized text (FNV-1a, 64-bit, hex).
///
/// Used for `jd_hash` dedupe and future cache keys. Deterministic across runs
/// and machines (unlike `DefaultHasher`), which is what the UNIQUE index needs.
/// 0 tokens — plain code.
pub fn stable_hash(input: &str) -> String {
    let normalized = normalize_text(input);
    const FNV_OFFSET: u64 = 0xcbf29ce484222325;
    const FNV_PRIME: u64 = 0x100000001b3;
    let mut hash = FNV_OFFSET;
    for byte in normalized.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    format!("{hash:016x}")
}

/// Lowercase + collapse all whitespace so trivially different pastes of the
/// same job (extra spaces, line breaks, casing) hash identically.
fn normalize_text(input: &str) -> String {
    input
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}
