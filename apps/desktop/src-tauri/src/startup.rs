// Startup diagnostics and the one graceful exit path for a failed launch.
//
// Tauri v2 runs `Builder::setup` from inside `RuntimeRunEvent::Ready`, which on
// macOS is dispatched from `applicationDidFinishLaunching` - an `extern "C"`
// Objective-C callback. A panic there cannot unwind, so Rust turns it into
// `panic_cannot_unwind` -> `abort()`. The process dies with SIGABRT before any
// window is shown, the panic message goes to a stderr that a Finder-launched
// app discards, and macOS then offers "reopen its windows" on every following
// launch - each retry crashing the same way.
//
// That is exactly what shipped 0.29.0 and 0.29.2 did on a real install: four
// SIGABRTs in a row, `abort() called`, no message anywhere on disk.
//
// So this module does two things:
//   1. `install_panic_hook` writes every panic to a file before the process
//      dies, including panics raised before the Tauri app handle exists.
//   2. `fail` turns a fatal setup error into a native error dialog and a clean
//      `exit(1)` instead of an abort, so the user sees the reason and macOS
//      never enters the reopen loop.

use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Runtime};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

/// File the panic hook appends to, next to the `tauri-plugin-log` output.
const CRASH_LOG_FILE: &str = "startup-crash.log";

/// Log directory, resolved without an app handle because the panic hook has to
/// exist before `Builder::build` runs. Mirrors what `PathResolver::app_log_dir`
/// would return for the `dev.applye.app` identifier.
fn log_dir() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var_os("HOME")?;
        Some(PathBuf::from(home).join("Library/Logs/dev.applye.app"))
    }
    #[cfg(target_os = "windows")]
    {
        let local = std::env::var_os("LOCALAPPDATA")?;
        Some(PathBuf::from(local).join("dev.applye.app").join("logs"))
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let base = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))?;
        Some(base.join("dev.applye.app").join("logs"))
    }
}

/// Append one line to the crash log. Best effort: a launch that is already
/// failing must not fail harder because the log could not be written.
fn append(line: &str) {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let entry = format!("[unix {seconds}] {line}\n");

    eprintln!("{entry}");

    let Some(dir) = log_dir() else { return };
    if create_dir_all(&dir).is_err() {
        return;
    }
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join(CRASH_LOG_FILE))
    {
        let _ = file.write_all(entry.as_bytes());
    }
}

/// Record a panic on disk before the process dies, then run the default hook.
///
/// Install this first thing in `run()`: the panic that has to be caught can
/// happen inside Tauri's own window creation, before the setup closure runs.
pub fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown location".into());
        append(&format!("panic at {location}: {info}"));
        previous(info);
    }));
}

/// Abandon the launch with a visible reason instead of a panic.
///
/// Shows a native error dialog from a worker thread - a modal from the main
/// thread would deadlock the event loop that has to display it - and then exits
/// with code 1. Callers return `Ok(())` afterwards: returning `Err` would put us
/// back on Tauri's `panic!` path.
///
/// The window is deliberately left alone. Closing it ends the app before the
/// dialog can appear, and hiding it hands the app to AppKit's automatic
/// termination, which quits it silently with status 0 - both were measured.
/// Leaving it up is safe: a command whose state was never managed returns an
/// `InvokeError` to the frontend rather than panicking.
pub fn fail<R: Runtime>(app: &AppHandle<R>, stage: &str, detail: &str) {
    let summary = format!("startup failed at {stage}: {detail}");
    log::error!("{summary}");
    append(&summary);

    let app = app.clone();
    let stage = stage.to_string();
    let detail = detail.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message(format!(
                "Applye could not start.\n\n{stage}\n\n{detail}\n\nDetails were written to the {CRASH_LOG_FILE} file in the Applye log folder."
            ))
            .kind(MessageDialogKind::Error)
            .title("Applye")
            .blocking_show();
        app.exit(1);
    });
}
