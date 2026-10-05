//! Local database backup (`VACUUM INTO`) and the pending-restore install that
//! runs before the shared pool exists.
//!
//! Backup files contain the SQLite database only. API keys stay in the OS
//! keychain and are never read here. Errors are stable codes; database
//! contents are not logged.

mod swap;
mod validate;

use std::path::{Path, PathBuf};

use sqlx::SqlitePool;

pub use swap::{open_database, take_notice};
pub use validate::DatabaseBackupError;

use swap::{is_reserved_restore_name, remove_sidecars, LIVE_DB, PARTIAL, PENDING};

/// Write a WAL-consistent copy of the open database to `target`.
///
/// `VACUUM INTO` builds a new file from the committed database, including
/// frames that are still in the WAL. The live file is not copied directly.
pub async fn backup_database_to(
    pool: &SqlitePool,
    target: &Path,
    live_db: &Path,
) -> Result<(), DatabaseBackupError> {
    let partial = partial_beside(target).ok_or(DatabaseBackupError::BackupFailed)?;
    if would_clobber_live(target, live_db) {
        return Err(DatabaseBackupError::BackupFailed);
    }
    let parent = target.parent().filter(|path| path.is_dir());
    if parent.is_none() {
        return Err(DatabaseBackupError::BackupFailed);
    }
    if partial.exists() {
        std::fs::remove_file(&partial).map_err(|_| DatabaseBackupError::BackupFailed)?;
    }

    let partial_path = path_string(&partial).map_err(|_| DatabaseBackupError::BackupFailed)?;
    if let Err(error) = sqlx::query("VACUUM INTO ?")
        .bind(partial_path)
        .execute(pool)
        .await
    {
        log::warn!("database backup failed");
        let _ = error;
        let _ = std::fs::remove_file(&partial);
        return Err(DatabaseBackupError::BackupFailed);
    }

    if target.exists() {
        std::fs::remove_file(target).map_err(|_| {
            let _ = std::fs::remove_file(&partial);
            DatabaseBackupError::BackupFailed
        })?;
    }
    std::fs::rename(&partial, target).map_err(|_| {
        let _ = std::fs::remove_file(&partial);
        DatabaseBackupError::BackupFailed
    })?;
    Ok(())
}

/// Copy `source` into app data and validate that copy. The live database and
/// the selected file are left unchanged.
pub async fn prepare_restore(source: &Path, app_data: &Path) -> Result<(), DatabaseBackupError> {
    if !source.is_file() {
        return Err(DatabaseBackupError::Invalid);
    }
    std::fs::create_dir_all(app_data).map_err(|_| DatabaseBackupError::RestoreFailed)?;
    let live = app_data.join(LIVE_DB);
    if same_file(source, &live) || is_inside_restore_state(source, app_data) {
        return Err(DatabaseBackupError::Invalid);
    }

    let partial = app_data.join(PARTIAL);
    if partial.exists() {
        std::fs::remove_file(&partial).map_err(|_| DatabaseBackupError::RestoreFailed)?;
    }
    std::fs::copy(source, &partial).map_err(|_| DatabaseBackupError::Invalid)?;

    let validation = validate::validate_applye_file(&partial).await;
    remove_sidecars(&partial);
    if let Err(error) = validation {
        let _ = std::fs::remove_file(&partial);
        return Err(error);
    }

    let pending = app_data.join(PENDING);
    if pending.exists() {
        std::fs::remove_file(&pending).map_err(|_| DatabaseBackupError::RestoreFailed)?;
    }
    std::fs::rename(&partial, &pending).map_err(|_| DatabaseBackupError::RestoreFailed)?;
    Ok(())
}

fn partial_beside(target: &Path) -> Option<PathBuf> {
    let mut name = target.file_name()?.to_os_string();
    name.push(".applye-partial");
    Some(target.with_file_name(name))
}

fn path_string(path: &Path) -> Result<String, ()> {
    path.to_str().map(str::to_string).ok_or(())
}

fn would_clobber_live(target: &Path, live: &Path) -> bool {
    if same_file(target, live) {
        return true;
    }
    let Some(name) = target.file_name().and_then(|value| value.to_str()) else {
        return false;
    };
    if !is_reserved_restore_name(name) {
        return false;
    }
    let Some(live_dir) = live.parent() else {
        return false;
    };
    let Some(target_dir) = target.parent() else {
        return false;
    };
    canonicalize_dir(target_dir) == canonicalize_dir(live_dir)
        && canonicalize_dir(live_dir).is_some()
}

fn is_inside_restore_state(source: &Path, app_data: &Path) -> bool {
    let Ok(source) = std::fs::canonicalize(source) else {
        return false;
    };
    let Ok(root) = std::fs::canonicalize(app_data) else {
        return false;
    };
    source.starts_with(&root) && source != root.join(LIVE_DB)
}

fn same_file(left: &Path, right: &Path) -> bool {
    match (canonicalize_existing(left), canonicalize_existing(right)) {
        (Some(left), Some(right)) => left == right,
        _ => match (
            left.parent(),
            right.parent(),
            left.file_name(),
            right.file_name(),
        ) {
            (Some(left_dir), Some(right_dir), Some(left_name), Some(right_name)) => {
                canonicalize_dir(left_dir) == canonicalize_dir(right_dir)
                    && canonicalize_dir(left_dir).is_some()
                    && left_name == right_name
            }
            _ => false,
        },
    }
}

fn canonicalize_existing(path: &Path) -> Option<PathBuf> {
    std::fs::canonicalize(path).ok()
}

fn canonicalize_dir(path: &Path) -> Option<PathBuf> {
    std::fs::canonicalize(path).ok()
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicU64, Ordering};

    use sqlx::sqlite::SqlitePoolOptions;

    use super::*;
    use crate::db::Db;

    fn scratch() -> PathBuf {
        static N: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "applye-backup-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    async fn migrated_with_marker(dir: &Path, marker: &str) -> Db {
        let db = Db::init(dir).await.unwrap();
        let updated = sqlx::query("UPDATE settings SET ui_language = ? WHERE id = 1")
            .bind(marker)
            .execute(&db.pool)
            .await
            .unwrap();
        assert_eq!(
            updated.rows_affected(),
            1,
            "settings row missing after migrate"
        );
        db
    }

    async fn language_of(db: &Db) -> String {
        sqlx::query_scalar("SELECT ui_language FROM settings WHERE id = 1")
            .fetch_one(&db.pool)
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn backup_is_a_valid_copy_including_uncheckpointed_wal_rows() {
        let dir = scratch();
        let db = migrated_with_marker(&dir, "before-wal").await;
        sqlx::query("PRAGMA wal_autocheckpoint = 0")
            .execute(&db.pool)
            .await
            .unwrap();
        sqlx::query("UPDATE settings SET ui_language = 'wal-marker' WHERE id = 1")
            .execute(&db.pool)
            .await
            .unwrap();
        assert!(dir.join("applye.db-wal").metadata().unwrap().len() > 0);

        let target = dir.join("backup.sqlite");
        backup_database_to(&db.pool, &target, &dir.join(LIVE_DB))
            .await
            .unwrap();
        db.pool.close().await;

        assert_eq!(validate::validate_applye_file(&target).await, Ok(()));
        let copy = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(&target)
                    .read_only(true),
            )
            .await
            .unwrap();
        let marker: String = sqlx::query_scalar("SELECT ui_language FROM settings WHERE id = 1")
            .fetch_one(&copy)
            .await
            .unwrap();
        assert_eq!(marker, "wal-marker");
        copy.close().await;
    }

    #[tokio::test]
    async fn backup_refuses_to_replace_the_live_database() {
        let dir = scratch();
        let db = migrated_with_marker(&dir, "stay").await;
        let live = dir.join(LIVE_DB);
        let error = backup_database_to(&db.pool, &live, &live).await;
        assert_eq!(error, Err(DatabaseBackupError::BackupFailed));
        assert_eq!(language_of(&db).await, "stay");
        db.pool.close().await;
    }

    #[tokio::test]
    async fn prepare_does_not_modify_the_selected_file() {
        let dir = scratch();
        let db = migrated_with_marker(&dir, "kept").await;
        db.pool.close().await;
        let source_dir = scratch();
        let source = source_dir.join("chosen.sqlite");
        std::fs::copy(dir.join(LIVE_DB), &source).unwrap();
        let before = std::fs::read(&source).unwrap();

        prepare_restore(&source, &dir).await.unwrap();

        assert_eq!(std::fs::read(&source).unwrap(), before);
        assert!(!source.with_file_name("chosen.sqlite-wal").exists());
        assert!(dir.join(PENDING).is_file());
        assert_eq!(std::fs::read(&dir.join(LIVE_DB)).unwrap(), before);
    }

    #[tokio::test]
    async fn current_schema_is_accepted_and_restore_replaces_the_database() {
        let dir = scratch();
        let db = migrated_with_marker(&dir, "original").await;
        db.pool.close().await;
        let source = scratch().join("backup.sqlite");
        std::fs::copy(dir.join(LIVE_DB), &source).unwrap();
        {
            let copy = SqlitePoolOptions::new()
                .connect_with(sqlx::sqlite::SqliteConnectOptions::new().filename(&source))
                .await
                .unwrap();
            sqlx::query("UPDATE settings SET ui_language = 'restored' WHERE id = 1")
                .execute(&copy)
                .await
                .unwrap();
            copy.close().await;
        }
        prepare_restore(&source, &dir).await.unwrap();
        let source_after = std::fs::read(&source).unwrap();

        let restored = open_database(&dir).await.unwrap();
        assert_eq!(language_of(&restored).await, "restored");
        restored.pool.close().await;
        assert_eq!(std::fs::read(&source).unwrap(), source_after);
        assert!(!dir.join(PENDING).exists());
        assert!(!dir.join("applye.restore.rollback").exists());
        assert_eq!(take_notice(&dir).as_deref(), Some("restored"));
    }

    #[tokio::test]
    async fn invalid_pending_file_leaves_the_live_database_unchanged() {
        let dir = scratch();
        let db = migrated_with_marker(&dir, "safe").await;
        db.pool.close().await;
        let before = std::fs::read(dir.join(LIVE_DB)).unwrap();
        std::fs::write(dir.join(PENDING), b"not a database").unwrap();

        let reopened = open_database(&dir).await.unwrap();
        assert_eq!(language_of(&reopened).await, "safe");
        reopened.pool.close().await;
        assert_eq!(std::fs::read(dir.join(LIVE_DB)).unwrap(), before);
        assert!(!dir.join(PENDING).exists());
        assert_eq!(take_notice(&dir).as_deref(), Some("failed:restore_invalid"));
    }

    #[tokio::test]
    async fn failed_open_after_swap_restores_the_previous_database() {
        let dir = scratch();
        let db = migrated_with_marker(&dir, "original").await;
        db.pool.close().await;
        let rollback = dir.join("applye.restore.rollback");
        std::fs::create_dir(&rollback).unwrap();
        std::fs::rename(dir.join(LIVE_DB), rollback.join(LIVE_DB)).unwrap();
        std::fs::write(dir.join(LIVE_DB), b"not a database").unwrap();
        std::fs::write(dir.join("applye.restore.phase"), b"installed").unwrap();

        let recovered = open_database(&dir).await.unwrap();
        assert_eq!(language_of(&recovered).await, "original");
        recovered.pool.close().await;
        assert!(!rollback.exists());
        assert_eq!(take_notice(&dir).as_deref(), Some("failed:restore_failed"));
    }
}
