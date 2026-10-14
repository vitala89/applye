//! Native shell effects. Opening or revealing a file is presentation, not a
//! Tailoring workflow. Containment and export provenance live in `exported_paths`.

use tauri::{AppHandle, Manager, State};

use crate::exported_paths::ExportedPaths;

#[tauri::command]
pub fn open_file(
    app: AppHandle,
    exported: State<'_, ExportedPaths>,
    path: String,
) -> Result<(), String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let path = crate::exported_paths::resolve_openable(&base, &exported, &path)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("open_file: {e}"))?;
    // `cmd /C start` on Windows is the one launcher that re-parses its
    // arguments, so it is the only place a metacharacter in a filename could
    // matter. Two things keep it safe: every name Applye writes goes through
    // `readable_slug` (alphanumeric plus hyphen, nothing else survives), and
    // the containment check above means no path from outside that folder ever
    // reaches here. The empty `""` is `start`'s title argument - without it,
    // `start` treats a quoted path as the window title and opens nothing.
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &path.to_string_lossy().to_string()])
        .spawn()
        .map_err(|e| format!("open_file: {e}"))?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("open_file: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn reveal_in_folder(
    app: AppHandle,
    exported: State<'_, ExportedPaths>,
    path: String,
) -> Result<(), String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let path = crate::exported_paths::resolve_openable(&base, &exported, &path)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .args([std::ffi::OsStr::new("-R"), path.as_os_str()])
        .spawn()
        .map_err(|e| format!("reveal_in_folder: {e}"))?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(format!("/select,{}", path.to_string_lossy()))
        .spawn()
        .map_err(|e| format!("reveal_in_folder: {e}"))?;
    #[cfg(target_os = "linux")]
    {
        let parent = path.parent().unwrap_or(path.as_path());
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| format!("reveal_in_folder: {e}"))?;
    }
    Ok(())
}
