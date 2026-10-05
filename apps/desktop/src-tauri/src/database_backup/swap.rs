//! Install a pending restore before the live pool exists, and put the previous
//! database back when that install cannot be opened.

use std::path::{Path, PathBuf};

use crate::db::Db;

use super::validate::DatabaseBackupError;

pub(crate) const LIVE_DB: &str = "applye.db";
pub(crate) const PENDING: &str = "applye.restore.pending.sqlite";
pub(crate) const PARTIAL: &str = "applye.restore.incoming.partial";

pub(crate) fn is_reserved_restore_name(name: &str) -> bool {
    matches!(
        name,
        LIVE_DB | PENDING | PARTIAL | ROLLBACK_DIR | PHASE | NOTICE
    )
}
const ROLLBACK_DIR: &str = "applye.restore.rollback";
const PHASE: &str = "applye.restore.phase";
const NOTICE: &str = "applye.restore.notice";
const PHASE_INSTALLED: &str = "installed";

/// Open the live database, installing a pending restore first when one exists.
///
/// A failed install puts the previous files back and still opens that database.
/// The only hard failure is a restore that cannot be undone.
pub async fn open_database(app_data: &Path) -> Result<Db, String> {
    std::fs::create_dir_all(app_data).map_err(|error| format!("create app data dir: {error}"))?;
    let _ = std::fs::remove_file(app_data.join(PARTIAL));
    heal_interrupted_restore(app_data).map_err(|_| fatal_message())?;

    if phase_is_installed(app_data) {
        return finish_installed(app_data).await;
    }

    let pending = app_data.join(PENDING);
    if pending.is_file() {
        match super::validate::validate_applye_file(&pending).await {
            Ok(()) => {
                remove_sidecars(&pending);
                match swap_pending(app_data) {
                    Ok(()) => return finish_installed(app_data).await,
                    Err(DatabaseBackupError::RollbackFailed) => return Err(fatal_message()),
                    Err(error) => write_notice(app_data, &format!("failed:{}", error.code())),
                }
            }
            Err(error) => {
                let _ = std::fs::remove_file(&pending);
                remove_sidecars(&pending);
                write_notice(app_data, &format!("failed:{}", error.code()));
            }
        }
    }

    Db::init(app_data).await
}

pub fn take_notice(app_data: &Path) -> Option<String> {
    let path = app_data.join(NOTICE);
    let text = std::fs::read_to_string(&path).ok()?;
    let _ = std::fs::remove_file(&path);
    let text = text.trim();
    if text == "restored" || is_known_failure(text) {
        Some(text.to_string())
    } else {
        None
    }
}

pub(crate) fn write_notice(app_data: &Path, notice: &str) {
    if notice != "restored" && !is_known_failure(notice) {
        return;
    }
    let _ = std::fs::write(app_data.join(NOTICE), notice);
}

fn is_known_failure(notice: &str) -> bool {
    matches!(
        notice,
        "failed:backup_failed"
            | "failed:restore_invalid"
            | "failed:restore_corrupt"
            | "failed:restore_not_applye"
            | "failed:restore_newer"
            | "failed:restore_incompatible"
            | "failed:restore_failed"
    )
}

fn fatal_message() -> String {
    "The database restore failed, and the previous database could not be put back. \
     A copy may still be in the Applye data folder under applye.restore.rollback."
        .to_string()
}

async fn finish_installed(app_data: &Path) -> Result<Db, String> {
    match Db::init(app_data).await {
        Ok(db) => {
            write_notice(app_data, "restored");
            if commit_restore(app_data).is_err() {
                log::warn!("could not remove the temporary database rollback");
            }
            Ok(db)
        }
        Err(error) => {
            log::error!("restored database did not open: {error}");
            rollback_installed(app_data).map_err(|_| fatal_message())?;
            write_notice(app_data, "failed:restore_failed");
            Db::init(app_data).await
        }
    }
}

/// Put a half-moved database back, and drop a rollback directory only after
/// the new database is already in place and the install phase has been cleared.
pub(crate) fn heal_interrupted_restore(dir: &Path) -> Result<(), DatabaseBackupError> {
    let live = dir.join(LIVE_DB);
    let rollback_db = dir.join(ROLLBACK_DIR).join(LIVE_DB);
    if !live.exists() && rollback_db.is_file() {
        rollback_installed(dir)?;
        return Ok(());
    }
    if !live.exists() && !rollback_db.is_file() && phase_is_installed(dir) {
        return clear_phase(dir);
    }
    if live.exists() && rollback_db.is_file() && !phase_is_installed(dir) {
        std::fs::remove_dir_all(dir.join(ROLLBACK_DIR))
            .map_err(|_| DatabaseBackupError::RollbackFailed)?;
    }
    Ok(())
}

pub(crate) fn swap_pending(dir: &Path) -> Result<(), DatabaseBackupError> {
    let pending = dir.join(PENDING);
    if !pending.is_file() {
        return Err(DatabaseBackupError::RestoreFailed);
    }
    move_live_to_rollback(dir)?;
    if write_phase(dir).is_err() {
        rollback_installed(dir)?;
        return Err(DatabaseBackupError::RestoreFailed);
    }
    if let Err(error) = std::fs::rename(&pending, dir.join(LIVE_DB)) {
        log::warn!("database restore could not install the pending file");
        let _ = error;
        rollback_installed(dir)?;
        return Err(DatabaseBackupError::RestoreFailed);
    }
    remove_sidecars(&dir.join(LIVE_DB));
    Ok(())
}

fn move_live_to_rollback(dir: &Path) -> Result<(), DatabaseBackupError> {
    let rollback = dir.join(ROLLBACK_DIR);
    if rollback.exists() {
        std::fs::remove_dir_all(&rollback).map_err(|_| DatabaseBackupError::RestoreFailed)?;
    }
    std::fs::create_dir(&rollback).map_err(|_| DatabaseBackupError::RestoreFailed)?;

    let live = dir.join(LIVE_DB);
    let pairs = live_pairs(&live, &rollback);
    let mut moved: Vec<(PathBuf, PathBuf)> = Vec::new();
    for (from, to) in pairs {
        if !from.exists() {
            continue;
        }
        if std::fs::rename(&from, &to).is_err() {
            for (moved_from, moved_to) in moved.iter().rev() {
                let _ = std::fs::rename(moved_to, moved_from);
            }
            let _ = std::fs::remove_dir_all(&rollback);
            return Err(DatabaseBackupError::RestoreFailed);
        }
        moved.push((from, to));
    }
    Ok(())
}

pub(crate) fn rollback_installed(dir: &Path) -> Result<(), DatabaseBackupError> {
    let live = dir.join(LIVE_DB);
    for path in [&live, &sidecar(&live, "-wal"), &sidecar(&live, "-shm")] {
        if path.exists() {
            std::fs::remove_file(path).map_err(|_| DatabaseBackupError::RollbackFailed)?;
        }
    }

    let rollback = dir.join(ROLLBACK_DIR);
    for (live_path, rollback_path) in live_pairs(&live, &rollback) {
        if rollback_path.exists() {
            std::fs::rename(&rollback_path, &live_path)
                .map_err(|_| DatabaseBackupError::RollbackFailed)?;
        }
    }
    if rollback.exists() {
        std::fs::remove_dir_all(&rollback).map_err(|_| DatabaseBackupError::RollbackFailed)?;
    }
    clear_phase(dir)
}

fn commit_restore(dir: &Path) -> Result<(), DatabaseBackupError> {
    clear_phase(dir)?;
    let rollback = dir.join(ROLLBACK_DIR);
    if rollback.exists() {
        std::fs::remove_dir_all(&rollback).map_err(|_| DatabaseBackupError::RestoreFailed)?;
    }
    Ok(())
}

fn live_pairs(live: &Path, rollback: &Path) -> Vec<(PathBuf, PathBuf)> {
    let names = [LIVE_DB, "applye.db-wal", "applye.db-shm"];
    names
        .into_iter()
        .map(|name| {
            let from = if name == LIVE_DB {
                live.to_path_buf()
            } else {
                rollback_sidecar(live, name)
            };
            (from, rollback.join(name))
        })
        .collect()
}

fn rollback_sidecar(live: &Path, name: &str) -> PathBuf {
    let suffix = name.trim_start_matches(LIVE_DB);
    sidecar(live, suffix)
}

fn sidecar(db: &Path, suffix: &str) -> PathBuf {
    let mut name = db.file_name().unwrap_or_default().to_os_string();
    name.push(suffix);
    db.with_file_name(name)
}

pub(crate) fn remove_sidecars(db: &Path) {
    let _ = std::fs::remove_file(sidecar(db, "-wal"));
    let _ = std::fs::remove_file(sidecar(db, "-shm"));
}

fn phase_is_installed(dir: &Path) -> bool {
    std::fs::read_to_string(dir.join(PHASE))
        .ok()
        .is_some_and(|text| text.trim() == PHASE_INSTALLED)
}

fn write_phase(dir: &Path) -> Result<(), DatabaseBackupError> {
    std::fs::write(dir.join(PHASE), PHASE_INSTALLED).map_err(|_| DatabaseBackupError::RestoreFailed)
}

fn clear_phase(dir: &Path) -> Result<(), DatabaseBackupError> {
    let path = dir.join(PHASE);
    if path.exists() {
        std::fs::remove_file(path).map_err(|_| DatabaseBackupError::RollbackFailed)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicU64, Ordering};

    use super::*;

    fn scratch() -> PathBuf {
        static N: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "applye-swap-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn read(path: &Path) -> Vec<u8> {
        std::fs::read(path).unwrap()
    }

    #[test]
    fn missing_pending_file_does_not_move_the_live_database() {
        let dir = scratch();
        std::fs::write(dir.join(LIVE_DB), b"OLD").unwrap();
        assert_eq!(swap_pending(&dir), Err(DatabaseBackupError::RestoreFailed));
        assert_eq!(read(&dir.join(LIVE_DB)), b"OLD");
        assert!(!dir.join(ROLLBACK_DIR).exists());
    }

    #[test]
    fn swap_moves_wal_sidecars_and_rollback_puts_them_back() {
        let dir = scratch();
        std::fs::write(dir.join(LIVE_DB), b"OLD").unwrap();
        std::fs::write(dir.join("applye.db-wal"), b"WAL").unwrap();
        std::fs::write(dir.join("applye.db-shm"), b"SHM").unwrap();
        std::fs::write(dir.join(PENDING), b"NEW").unwrap();

        swap_pending(&dir).unwrap();
        assert_eq!(read(&dir.join(LIVE_DB)), b"NEW");
        assert!(!dir.join("applye.db-wal").exists());
        assert!(!dir.join("applye.db-shm").exists());
        assert_eq!(read(&dir.join(ROLLBACK_DIR).join("applye.db-wal")), b"WAL");

        rollback_installed(&dir).unwrap();
        assert_eq!(read(&dir.join(LIVE_DB)), b"OLD");
        assert_eq!(read(&dir.join("applye.db-wal")), b"WAL");
        assert_eq!(read(&dir.join("applye.db-shm")), b"SHM");
        assert!(!dir.join(ROLLBACK_DIR).exists());
    }

    #[test]
    fn interrupted_swap_restores_the_previous_database() {
        let dir = scratch();
        std::fs::create_dir(dir.join(ROLLBACK_DIR)).unwrap();
        std::fs::write(dir.join(ROLLBACK_DIR).join(LIVE_DB), b"ORIGINAL").unwrap();
        heal_interrupted_restore(&dir).unwrap();
        assert_eq!(read(&dir.join(LIVE_DB)), b"ORIGINAL");
        assert!(!dir.join(ROLLBACK_DIR).exists());
    }
}
