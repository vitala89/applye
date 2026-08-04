// Assisted install of a coding CLI (Settings -> AI provider).
//
// Split out of `cli.rs`, which was over its size budget while answering three
// different questions: how to run a CLI, whether one is installed, and how to
// install it. This file is only the third, and it is the only part of the CLI
// bridge that changes the user's machine rather than reading it.
//
// The safety rules it holds to, unchanged by the move:
//
// - Only the packages in `NPM_PACKAGES` are ever installed. `provider` comes
//   from the frontend, so it is matched against that list and refused if it is
//   not on it - it is never interpolated into a command line.
// - `npm` is resolved to an absolute path first, and the install runs without a
//   shell, so nothing in the environment can substitute a different binary.
// - stderr is truncated before it reaches the UI, because an npm failure can
//   emit megabytes.

use crate::ai::cli::{resolve_binary, truncate_stderr};
use serde::Serialize;
use std::process::Stdio;
use std::time::Duration;
use tokio::process::Command;

/// An install downloads and compiles packages; be generous but still bounded.
const INSTALL_TIMEOUT: Duration = Duration::from_secs(600);

/// The npm package that provides each CLI.
///
/// This mapping is the security boundary for the install command: the package
/// name is chosen here from a fixed list keyed on the app's own provider id,
/// and is **never** taken from the caller. There is no code path that can make
/// Applye install an arbitrary package, and nothing is ever passed to a shell.
const NPM_PACKAGES: &[(&str, &str)] = &[
    ("claude", "@anthropic-ai/claude-code"),
    ("openai", "@openai/codex"),
];

pub(super) fn npm_package_for(provider: &str) -> Option<&'static str> {
    NPM_PACKAGES
        .iter()
        .find(|(id, _)| *id == provider)
        .map(|(_, pkg)| *pkg)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliInstallResult {
    pub ok: bool,
    /// The exact command that was run, so the UI never has to describe it
    /// second-hand and the user can repeat it in a terminal.
    pub command: String,
    /// Human-readable outcome or failure reason.
    pub message: String,
    /// npm itself is missing, so the user needs Node.js before anything else.
    /// Worth distinguishing: it is the one failure the user cannot fix from
    /// inside Applye, and it is the *likeliest* failure for the non-technical
    /// user this button exists for.
    pub needs_node: bool,
}

/// Installs the CLI for `provider` with npm.
///
/// This is a real, system-modifying action, so it is only ever reached from an
/// explicit click, it reports the exact command it runs, and it never guesses:
/// an unknown provider is refused rather than passed through to npm.
///
/// Installing does **not** sign the user in. The CLIs authenticate against the
/// user's own account interactively, which cannot be done from here; the UI
/// says so on success rather than letting the user discover it at the first
/// failed task.
#[tauri::command]
pub async fn cli_install(provider: String) -> CliInstallResult {
    let Some(package) = npm_package_for(&provider) else {
        return CliInstallResult {
            ok: false,
            command: String::new(),
            message: format!("'{provider}' is not a CLI Applye can install."),
            needs_node: false,
        };
    };
    let command = format!("npm install -g {package}");

    let Some(npm) = resolve_binary("npm") else {
        return CliInstallResult {
            ok: false,
            command,
            message: "npm was not found. These CLIs are installed with npm, which comes with Node.js - install Node.js from nodejs.org, then try again.".to_string(),
            needs_node: true,
        };
    };

    let child = match Command::new(&npm)
        .args(["install", "-g", package])
        .current_dir(std::env::temp_dir())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            return CliInstallResult {
                ok: false,
                command,
                message: format!("Could not start npm: {e}"),
                needs_node: false,
            }
        }
    };

    let output = match tokio::time::timeout(INSTALL_TIMEOUT, child.wait_with_output()).await {
        Ok(Ok(o)) => o,
        Ok(Err(e)) => {
            return CliInstallResult {
                ok: false,
                command,
                message: format!("npm failed to run: {e}"),
                needs_node: false,
            }
        }
        Err(_) => {
            return CliInstallResult {
                ok: false,
                command,
                message: format!(
                    "The install did not finish within {} minutes and was stopped.",
                    INSTALL_TIMEOUT.as_secs() / 60
                ),
                needs_node: false,
            }
        }
    };

    if output.status.success() {
        return CliInstallResult {
            ok: true,
            command,
            message: String::new(),
            needs_node: false,
        };
    }

    let stderr = truncate_stderr(&String::from_utf8_lossy(&output.stderr));
    // A global install into a system Node needs write access the app does not
    // have. Naming the cause is the difference between a user fixing it and a
    // user giving up on a wall of npm output.
    let message = if stderr.contains("EACCES") || stderr.contains("permission denied") {
        format!(
            "npm does not have permission to install globally on this machine. Run `{command}` yourself in a terminal (it may need administrator rights)."
        )
    } else if stderr.is_empty() {
        "npm exited with an error and printed nothing.".to_string()
    } else {
        stderr
    };
    CliInstallResult {
        ok: false,
        command,
        message,
        needs_node: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn every_supported_provider_has_an_install_package() {
        for (provider, _, _) in [
            ("claude", "claude", "Claude Code"),
            ("openai", "codex", "Codex CLI"),
        ] {
            assert!(
                npm_package_for(provider).is_some(),
                "no install package for {provider}"
            );
        }
    }

    #[tokio::test]
    async fn install_refuses_a_provider_that_is_not_on_the_list() {
        // The package name must never come from the caller. Anything not in
        // NPM_PACKAGES is refused before npm is reached at all.
        for attempt in ["deepseek", "left-pad", "../evil", "claude; rm -rf /"] {
            let result = cli_install(attempt.to_string()).await;
            assert!(!result.ok, "{attempt} should be refused");
            assert!(
                result.command.is_empty(),
                "{attempt} must not produce a command"
            );
        }
    }

    #[test]
    fn install_packages_are_the_official_vendor_ones() {
        assert_eq!(npm_package_for("claude"), Some("@anthropic-ai/claude-code"));
        assert_eq!(npm_package_for("openai"), Some("@openai/codex"));
    }
}
