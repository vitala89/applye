//! Read-only checks for an untrusted SQLite file before it can replace the
//! live Applye database. Nothing here renames or deletes `applye.db`.

use std::collections::HashMap;
use std::path::Path;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;

const SQLITE_HEADER: &[u8; 16] = b"SQLite format 3\0";

/// Why a backup or restore stopped. The string form is an IPC code, mapped to
/// translated copy in the desktop app. It never includes database contents.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DatabaseBackupError {
    BackupFailed,
    Invalid,
    Corrupt,
    NotApplye,
    Newer,
    Incompatible,
    RestoreFailed,
    /// The previous database could not be put back. Startup must stop.
    RollbackFailed,
}

impl DatabaseBackupError {
    pub fn code(self) -> &'static str {
        match self {
            Self::BackupFailed => "backup_failed",
            Self::Invalid => "restore_invalid",
            Self::Corrupt => "restore_corrupt",
            Self::NotApplye => "restore_not_applye",
            Self::Newer => "restore_newer",
            Self::Incompatible => "restore_incompatible",
            Self::RestoreFailed => "restore_failed",
            Self::RollbackFailed => "restore_failed",
        }
    }
}

/// Confirm `path` is a regular SQLite file this build of Applye can open.
///
/// The connection is read-only. Callers copy an untrusted file into app data
/// first, so a sidecar SQLite creates while checking does not land beside the
/// user's original backup.
pub async fn validate_applye_file(path: &Path) -> Result<(), DatabaseBackupError> {
    if !looks_like_sqlite_file(path)? {
        return Err(DatabaseBackupError::Invalid);
    }

    let options = SqliteConnectOptions::new()
        .filename(path)
        .read_only(true)
        .create_if_missing(false);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|_| DatabaseBackupError::Corrupt)?;

    let result = validate_open_pool(&pool).await;
    pool.close().await;
    result
}

fn looks_like_sqlite_file(path: &Path) -> Result<bool, DatabaseBackupError> {
    let meta = std::fs::metadata(path).map_err(|_| DatabaseBackupError::Invalid)?;
    if !meta.is_file() || meta.len() < SQLITE_HEADER.len() as u64 {
        return Ok(false);
    }
    let mut header = [0_u8; 16];
    let mut file = std::fs::File::open(path).map_err(|_| DatabaseBackupError::Invalid)?;
    std::io::Read::read_exact(&mut file, &mut header).map_err(|_| DatabaseBackupError::Invalid)?;
    Ok(&header == SQLITE_HEADER)
}

async fn validate_open_pool(pool: &SqlitePool) -> Result<(), DatabaseBackupError> {
    let checks: Vec<String> = sqlx::query_scalar("PRAGMA quick_check")
        .fetch_all(pool)
        .await
        .map_err(|_| DatabaseBackupError::Corrupt)?;
    let ok = checks.len() == 1 && checks.first().is_some_and(|row| row.trim() == "ok");
    if !ok {
        return Err(DatabaseBackupError::Corrupt);
    }

    let tables: Vec<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type = 'table'
         AND name IN ('_sqlx_migrations', 'settings', 'profile')",
    )
    .fetch_all(pool)
    .await
    .map_err(|_| DatabaseBackupError::NotApplye)?;
    if tables.len() != 3 {
        return Err(DatabaseBackupError::NotApplye);
    }

    check_migrations(pool).await
}

async fn check_migrations(pool: &SqlitePool) -> Result<(), DatabaseBackupError> {
    let rows: Vec<(i64, i64, Vec<u8>)> =
        sqlx::query_as("SELECT version, success, checksum FROM _sqlx_migrations ORDER BY version")
            .fetch_all(pool)
            .await
            .map_err(|_| DatabaseBackupError::NotApplye)?;
    if rows.is_empty() {
        return Err(DatabaseBackupError::NotApplye);
    }

    let embedded = embedded_checksums();
    let max_ours = embedded.keys().copied().max().unwrap_or(0);
    let min_ours = embedded.keys().copied().min().unwrap_or(1);
    let mut seen = Vec::with_capacity(rows.len());

    for (version, success, checksum) in rows {
        if version > max_ours {
            return Err(DatabaseBackupError::Newer);
        }
        if success == 0 {
            return Err(DatabaseBackupError::Incompatible);
        }
        match embedded.get(&version) {
            Some(expected) if expected == &checksum => seen.push(version),
            _ => return Err(DatabaseBackupError::Incompatible),
        }
    }

    if seen.first().copied() != Some(min_ours) {
        return Err(DatabaseBackupError::Incompatible);
    }
    if seen.windows(2).any(|pair| pair[1] != pair[0] + 1) {
        return Err(DatabaseBackupError::Incompatible);
    }
    Ok(())
}

fn embedded_checksums() -> HashMap<i64, Vec<u8>> {
    sqlx::migrate!("./migrations")
        .iter()
        .map(|migration| {
            (
                migration.version,
                migration.checksum.iter().copied().collect(),
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicU64, Ordering};

    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

    use super::*;

    fn embedded_version_checksum(version: i64) -> Vec<u8> {
        super::embedded_checksums()
            .remove(&version)
            .unwrap_or_else(|| panic!("migration {version} is not embedded"))
    }

    fn scratch() -> std::path::PathBuf {
        static N: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "applye-validate-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    async fn schema_only(path: &Path, version: i64, checksum: Vec<u8>, success: i64) {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(path)
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        sqlx::query("CREATE TABLE settings (id INTEGER PRIMARY KEY)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("CREATE TABLE profile (id INTEGER PRIMARY KEY)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "CREATE TABLE _sqlx_migrations (
                version BIGINT PRIMARY KEY,
                description TEXT NOT NULL,
                installed_on TEXT NOT NULL,
                success BOOLEAN NOT NULL,
                checksum BLOB NOT NULL,
                execution_time BIGINT NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO _sqlx_migrations
             (version, description, installed_on, success, checksum, execution_time)
             VALUES (?, 'test', '2020-01-01T00:00:00', ?, ?, 1)",
        )
        .bind(version)
        .bind(success)
        .bind(checksum)
        .execute(&pool)
        .await
        .unwrap();
        pool.close().await;
    }

    #[tokio::test]
    async fn rejects_a_non_sqlite_file() {
        let dir = scratch();
        let path = dir.join("notes.sqlite");
        std::fs::write(&path, b"this is not a database").unwrap();
        assert_eq!(
            validate_applye_file(&path).await,
            Err(DatabaseBackupError::Invalid)
        );
    }

    #[tokio::test]
    async fn rejects_an_arbitrary_sqlite_database() {
        let dir = scratch();
        let path = dir.join("other.sqlite");
        let pool = SqlitePoolOptions::new()
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(&path)
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        sqlx::query("CREATE TABLE notes (body TEXT)")
            .execute(&pool)
            .await
            .unwrap();
        pool.close().await;
        assert_eq!(
            validate_applye_file(&path).await,
            Err(DatabaseBackupError::NotApplye)
        );
    }

    #[tokio::test]
    async fn rejects_a_corrupt_sqlite_file() {
        let dir = scratch();
        let path = dir.join("broken.sqlite");
        schema_only(&path, 1, embedded_version_checksum(1), 1).await;
        let mut file = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(&path)
            .unwrap();
        use std::io::{Read, Seek, SeekFrom, Write};
        file.seek(SeekFrom::Start(28)).unwrap();
        let mut pages = [0_u8; 4];
        file.read_exact(&mut pages).unwrap();
        let pages = u32::from_be_bytes(pages).saturating_add(40);
        file.seek(SeekFrom::Start(28)).unwrap();
        file.write_all(&pages.to_be_bytes()).unwrap();
        assert_eq!(
            validate_applye_file(&path).await,
            Err(DatabaseBackupError::Corrupt)
        );
    }

    #[tokio::test]
    async fn accepts_an_older_migration_prefix() {
        let dir = scratch();
        let path = dir.join("old.sqlite");
        schema_only(&path, 1, embedded_version_checksum(1), 1).await;
        assert_eq!(validate_applye_file(&path).await, Ok(()));
    }

    #[tokio::test]
    async fn rejects_a_newer_migration_version() {
        let dir = scratch();
        let path = dir.join("new.sqlite");
        schema_only(&path, 1, embedded_version_checksum(1), 1).await;
        let pool = SqlitePoolOptions::new()
            .connect_with(SqliteConnectOptions::new().filename(&path).read_only(false))
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO _sqlx_migrations
             (version, description, installed_on, success, checksum, execution_time)
             VALUES (999999, 'future', '2020-01-01T00:00:00', 1, ?, 1)",
        )
        .bind(vec![1_u8, 2, 3])
        .execute(&pool)
        .await
        .unwrap();
        pool.close().await;
        assert_eq!(
            validate_applye_file(&path).await,
            Err(DatabaseBackupError::Newer)
        );
    }

    #[tokio::test]
    async fn rejects_a_checksum_mismatch() {
        let dir = scratch();
        let path = dir.join("fork.sqlite");
        schema_only(&path, 1, vec![9, 9, 9], 1).await;
        assert_eq!(
            validate_applye_file(&path).await,
            Err(DatabaseBackupError::Incompatible)
        );
    }
}
