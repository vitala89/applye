//! Thin IPC for the local database backup and the restore that restarts later.

use std::path::PathBuf;

use tauri::{AppHandle, Manager, State};

use crate::database_backup::{self, DatabaseBackupError};
use crate::db::Db;

#[tauri::command]
pub async fn backup_database(target_path: String, db: State<'_, Db>) -> Result<(), String> {
    let live = live_database_path(&db).await.map_err(code)?;
    database_backup::backup_database_to(&db.pool, std::path::Path::new(&target_path), &live)
        .await
        .map_err(code)
}

#[tauri::command]
pub async fn prepare_database_restore(source_path: String, app: AppHandle) -> Result<(), String> {
    let dir = app_data(&app)?;
    database_backup::prepare_restore(std::path::Path::new(&source_path), &dir)
        .await
        .map_err(code)
}

#[tauri::command]
pub async fn take_database_restore_notice(app: AppHandle) -> Result<Option<String>, String> {
    let dir = app_data(&app)?;
    Ok(database_backup::take_notice(&dir))
}

fn app_data(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|_| DatabaseBackupError::RestoreFailed.code().to_string())
}

async fn live_database_path(db: &Db) -> Result<PathBuf, DatabaseBackupError> {
    let path: Option<String> =
        sqlx::query_scalar("SELECT file FROM pragma_database_list WHERE name = 'main'")
            .fetch_one(&db.pool)
            .await
            .map_err(|_| DatabaseBackupError::BackupFailed)?;
    path.map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
        .ok_or(DatabaseBackupError::BackupFailed)
}

fn code(error: DatabaseBackupError) -> String {
    error.code().to_string()
}
