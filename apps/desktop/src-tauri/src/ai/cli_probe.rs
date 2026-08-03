// Which coding CLIs are installed, for the Settings screen.
//
// Split out of `cli.rs` alongside `cli_install`, which was over its size budget
// while answering three separate questions. This file is only "what is on this
// machine": it resolves each supported CLI's binary and asks it for a version,
// and it never runs a prompt.
//
// A probe must not hang Settings, so every `--version` call is bounded by its
// own short timeout rather than the long one an inference run gets.

use super::cli::{adapter_for, not_installed_error, resolve_binary, truncate_stderr};
use serde::Serialize;
use std::process::Stdio;
use std::time::Duration;
use tokio::process::Command;

/// A `--version` probe must not hang Settings; these CLIs answer in well under
/// a second when healthy.
const VERSION_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliStatus {
    /// The app's provider id ("claude" | "openai").
    pub provider: String,
    /// Executable name the app looks for.
    pub command: String,
    /// Human-readable CLI name.
    pub label: String,
    /// A file with this name exists on the search path.
    pub installed: bool,
    /// Absolute path when found - shown so a user can tell which install won.
    pub path: Option<String>,
    /// The file exists **and** actually ran. `installed` alone is not enough:
    /// the npm wrappers for these CLIs are small scripts that spawn a
    /// platform-specific binary, and if that binary is missing (a partial or
    /// interrupted `npm install`) the wrapper is still on the path and still
    /// looks perfectly healthy to a file-existence check. That exact case -
    /// `spawn .../codex-darwin-arm64/vendor/.../codex ENOENT` - showed a green
    /// tick in Settings and then failed on the first real scoring run.
    pub working: bool,
    /// Version string the CLI printed, when it ran.
    pub version: Option<String>,
    /// Why it did not run, when it did not.
    pub error: Option<String>,
}

/// Runs `<binary> --version` and reports what happened. This executes only a
/// binary the user installed and named themselves, with a fixed argument list
/// and no shell, in a scratch directory.
async fn probe_version(binary: &std::path::Path) -> Result<String, String> {
    let child = Command::new(binary)
        .arg("--version")
        .current_dir(std::env::temp_dir())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("could not be started: {e}"))?;

    let output = match tokio::time::timeout(VERSION_TIMEOUT, child.wait_with_output()).await {
        Ok(result) => result.map_err(|e| format!("failed while running: {e}"))?,
        Err(_) => {
            return Err(format!(
                "did not answer `--version` within {} seconds",
                VERSION_TIMEOUT.as_secs()
            ))
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = truncate_stderr(&String::from_utf8_lossy(&output.stderr));

    if !output.status.success() {
        return Err(if stderr.is_empty() {
            "exited with an error and printed nothing".to_string()
        } else {
            stderr
        });
    }
    // Some CLIs print a banner before the version; the first non-empty line is
    // the useful part.
    Ok(stdout
        .lines()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("unknown version")
        .trim()
        .to_string())
}

/// Whether the CLI for one provider is present and actually runs. Returns the
/// version on success and the reason on failure, so the health check can say
/// something useful rather than just "not ready".
pub async fn cli_health(provider: &str) -> Result<String, String> {
    let adapter = adapter_for(provider)?;
    let binary = resolve_binary(adapter.command()).ok_or_else(|| not_installed_error(&*adapter))?;
    probe_version(&binary)
        .await
        .map_err(|e| format!("{} {e}", adapter.label()))
}

/// Reports which of the supported CLIs are present **and runnable**, so Settings
/// can tell the user before they switch to CLI mode rather than letting them
/// discover it mid-task.
#[tauri::command]
pub async fn cli_probe() -> Vec<CliStatus> {
    let mut out = Vec::new();
    for (provider, command, label) in [
        ("claude", "claude", "Claude Code"),
        ("openai", "codex", "Codex CLI"),
    ] {
        let path = resolve_binary(command);
        let (working, version, error) = match &path {
            None => (false, None, None),
            Some(p) => match probe_version(p).await {
                Ok(v) => (true, Some(v), None),
                Err(e) => (false, None, Some(e)),
            },
        };
        out.push(CliStatus {
            provider: provider.to_string(),
            command: command.to_string(),
            label: label.to_string(),
            installed: path.is_some(),
            path: path.map(|p| p.display().to_string()),
            working,
            version,
            error,
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn probe_reports_all_three_supported_clis() {
        let statuses = cli_probe().await;
        assert_eq!(statuses.len(), 2);
        let providers: Vec<&str> = statuses.iter().map(|s| s.provider.as_str()).collect();
        assert_eq!(providers, vec!["claude", "openai"]);
        for s in &statuses {
            // Installed or not depends on the machine; the path must agree.
            assert_eq!(s.installed, s.path.is_some());
            // A CLI cannot be runnable without being present at all.
            assert!(!s.working || s.installed, "{s:?}");
            // Whichever way the probe went, it must say which: a working CLI
            // reports a version, a broken one reports why.
            if s.installed {
                assert_eq!(s.working, s.version.is_some(), "{s:?}");
                assert_eq!(!s.working, s.error.is_some(), "{s:?}");
            }
        }
    }

    #[tokio::test]
    async fn a_present_but_unrunnable_binary_reports_an_error_not_success() {
        // Stands in for the real failure this replaced: an npm wrapper that is
        // on the path but whose vendored binary is missing. A directory is
        // present on disk and cannot be executed, which is the same shape.
        let dir = std::env::temp_dir().join(format!("applye-probe-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("create dir");
        let err = probe_version(&dir).await.unwrap_err();
        assert!(!err.is_empty(), "a failure must explain itself");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
