// CLI bridge mode - run a coding CLI the user already has installed and
// already pays for (Claude Code, Codex, Gemini CLI) as a one-shot subprocess,
// instead of calling a provider HTTP API with an API key.
//
// Why this exists: a user on a Claude Pro / ChatGPT Plus / Gemini subscription
// has no reason to also buy API credit. In CLI mode Applye stores no key, and
// the request never leaves the machine except through the CLI the user already
// trusts and authenticated themselves.
//
// Safety rules this module holds to:
//   - No shell. Every process is spawned with a fixed argv via tokio::process,
//     so nothing in a job description or profile can ever be interpreted as a
//     shell command.
//   - The prompt goes in over stdin, never as an argv element: prompts are far
//     larger than the OS argv limit and would leak into `ps` output.
//   - The working directory is a scratch temp dir, never the user's files, and
//     Codex additionally runs in its read-only sandbox.
//   - Timeout + kill, so a hung CLI cannot wedge the app.
//   - stderr is surfaced in errors (CLIs print auth/rate-limit problems there)
//     but is truncated, and no environment or key material is ever logged.
//
// Flags were verified against current vendor docs (2026-07):
//   claude  - docs.claude.com/en/docs/claude-code/cli-reference
//             `-p` print mode, `--output-format json`, `--model`,
//             `--system-prompt`, prompt accepted on stdin.
//   codex   - developers.openai.com/codex/noninteractive
//             `codex exec -` reads the whole prompt from stdin and prints only
//             the final agent message to stdout (progress goes to stderr).
//   gemini  - github.com/google-gemini/gemini-cli docs/cli/headless.md
//             `--output-format json` -> `{ response, stats }`, `-p` prompt.
// Re-verify these before changing them; do not edit them from memory.

use super::{AiRequest, AiResponse};
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

/// Generous: a quality-tier tailoring run through a subscription CLI is much
/// slower than the same call against the API.
const CLI_TIMEOUT: Duration = Duration::from_secs(600);
/// stderr is only ever used for diagnostics; keep error strings bounded.
const STDERR_LIMIT: usize = 2000;

/// One CLI's reply, normalised to the same shape the API path returns.
#[derive(Debug)]
struct CliReply {
    text: String,
    tokens_input: u32,
    tokens_output: u32,
    cached_tokens: u32,
}

trait CliAdapter {
    /// The executable name (e.g. "claude").
    fn command(&self) -> &str;
    /// Human-readable name for error messages.
    fn label(&self) -> &str;
    /// Headless invocation args for a one-shot prompt.
    fn build_args(&self, req: &AiRequest) -> Vec<String>;
    /// What to write to the child's stdin.
    fn build_stdin(&self, req: &AiRequest) -> String;
    /// Extract the reply text (and usage, when the CLI reports it) from stdout.
    fn parse_output(&self, raw: &str) -> Result<CliReply, String>;
}

// ---------------------------------------------------------------------------
// Claude Code
// ---------------------------------------------------------------------------

struct ClaudeCli;

impl CliAdapter for ClaudeCli {
    fn command(&self) -> &str {
        "claude"
    }
    fn label(&self) -> &str {
        "Claude Code"
    }
    fn build_args(&self, req: &AiRequest) -> Vec<String> {
        // `--system-prompt` *replaces* Claude Code's coding-assistant identity,
        // which is what we want: the skill prompt is the whole instruction and
        // a coding-agent preamble would pollute the JSON we ask for back.
        let mut args = vec![
            "-p".to_string(),
            "--output-format".to_string(),
            "json".to_string(),
            "--system-prompt".to_string(),
            req.system_prompt.clone(),
        ];
        if !req.model.trim().is_empty() {
            args.push("--model".to_string());
            args.push(req.model.clone());
        }
        args
    }
    fn build_stdin(&self, req: &AiRequest) -> String {
        req.user_prompt.clone()
    }
    fn parse_output(&self, raw: &str) -> Result<CliReply, String> {
        let val: Value = serde_json::from_str(raw.trim())
            .map_err(|e| format!("Claude Code returned output this app could not parse: {e}"))?;
        if val
            .get("is_error")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            return Err(format!(
                "Claude Code reported an error: {}",
                val.get("result")
                    .and_then(Value::as_str)
                    .unwrap_or("no detail")
            ));
        }
        let text = val
            .get("result")
            .and_then(Value::as_str)
            .ok_or_else(|| "Claude Code returned no result text.".to_string())?
            .to_string();
        let usage = val.get("usage");
        Ok(CliReply {
            text,
            tokens_input: usage_u32(usage, "input_tokens"),
            tokens_output: usage_u32(usage, "output_tokens"),
            cached_tokens: usage_u32(usage, "cache_read_input_tokens"),
        })
    }
}

// ---------------------------------------------------------------------------
// Codex CLI
// ---------------------------------------------------------------------------

struct CodexCli;

impl CliAdapter for CodexCli {
    fn command(&self) -> &str {
        "codex"
    }
    fn label(&self) -> &str {
        "Codex CLI"
    }
    fn build_args(&self, req: &AiRequest) -> Vec<String> {
        // `-` = take the whole prompt from stdin. Plain (non-`--json`) mode
        // prints only the final agent message to stdout, which is exactly the
        // one thing we want; progress noise goes to stderr.
        let mut args = vec![
            "exec".to_string(),
            "-".to_string(),
            // The scratch cwd is deliberately not a git repo, and Codex refuses
            // to run outside one unless told the environment is safe.
            "--skip-git-repo-check".to_string(),
            // Applye only ever wants text back. Read-only is Codex's default,
            // but stating it means a changed default cannot grant write access.
            "--sandbox".to_string(),
            "read-only".to_string(),
        ];
        if !req.model.trim().is_empty() {
            args.push("--model".to_string());
            args.push(req.model.clone());
        }
        args
    }
    fn build_stdin(&self, req: &AiRequest) -> String {
        join_prompt(req)
    }
    fn parse_output(&self, raw: &str) -> Result<CliReply, String> {
        let text = raw.trim();
        if text.is_empty() {
            return Err("Codex CLI returned an empty reply.".to_string());
        }
        Ok(CliReply {
            text: text.to_string(),
            // Codex does not report usage on the plain-text path.
            tokens_input: 0,
            tokens_output: 0,
            cached_tokens: 0,
        })
    }
}

// ---------------------------------------------------------------------------
// Gemini CLI
// ---------------------------------------------------------------------------

struct GeminiCli;

impl CliAdapter for GeminiCli {
    fn command(&self) -> &str {
        "gemini"
    }
    fn label(&self) -> &str {
        "Gemini CLI"
    }
    fn build_args(&self, req: &AiRequest) -> Vec<String> {
        // Gemini CLI has no system-prompt flag on the headless path, so the
        // skill prompt is folded into the single prompt sent over stdin.
        let mut args = vec!["--output-format".to_string(), "json".to_string()];
        if !req.model.trim().is_empty() {
            args.push("--model".to_string());
            args.push(req.model.clone());
        }
        args
    }
    fn build_stdin(&self, req: &AiRequest) -> String {
        join_prompt(req)
    }
    fn parse_output(&self, raw: &str) -> Result<CliReply, String> {
        let val: Value = serde_json::from_str(raw.trim())
            .map_err(|e| format!("Gemini CLI returned output this app could not parse: {e}"))?;
        if let Some(err) = val.get("error") {
            let msg = err
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("no detail");
            return Err(format!("Gemini CLI reported an error: {msg}"));
        }
        let text = val
            .get("response")
            .and_then(Value::as_str)
            .ok_or_else(|| "Gemini CLI returned no response text.".to_string())?
            .to_string();
        // `stats` groups per-model token counts; sum whatever is present rather
        // than assuming one fixed model key.
        let (tin, tout, cached) = gemini_tokens(val.get("stats"));
        Ok(CliReply {
            text,
            tokens_input: tin,
            tokens_output: tout,
            cached_tokens: cached,
        })
    }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/// For CLIs without a system-prompt flag: one prompt, stable prefix first so
/// the vendor's own prompt caching still has a chance at it.
fn join_prompt(req: &AiRequest) -> String {
    if req.system_prompt.trim().is_empty() {
        return req.user_prompt.clone();
    }
    format!("{}\n\n{}", req.system_prompt, req.user_prompt)
}

fn usage_u32(usage: Option<&Value>, key: &str) -> u32 {
    usage
        .and_then(|u| u.get(key))
        .and_then(Value::as_u64)
        .unwrap_or(0) as u32
}

/// Walks `stats` for any nested `tokens` object and sums prompt/candidates/
/// cached counts. The exact nesting has changed between Gemini CLI releases,
/// so this reads defensively and reports zeros rather than failing the call.
fn gemini_tokens(stats: Option<&Value>) -> (u32, u32, u32) {
    let mut totals = (0u32, 0u32, 0u32);
    fn walk(val: &Value, totals: &mut (u32, u32, u32)) {
        match val {
            Value::Object(map) => {
                for (key, child) in map {
                    match key.as_str() {
                        "prompt" | "promptTokenCount" | "input" => {
                            totals.0 += child.as_u64().unwrap_or(0) as u32
                        }
                        "candidates" | "candidatesTokenCount" | "output" => {
                            totals.1 += child.as_u64().unwrap_or(0) as u32
                        }
                        "cached" | "cachedContentTokenCount" => {
                            totals.2 += child.as_u64().unwrap_or(0) as u32
                        }
                        _ => walk(child, totals),
                    }
                }
            }
            Value::Array(items) => items.iter().for_each(|i| walk(i, totals)),
            _ => {}
        }
    }
    if let Some(stats) = stats {
        walk(stats, &mut totals);
    }
    totals
}

fn adapter_for(provider: &str) -> Result<Box<dyn CliAdapter + Send + Sync>, String> {
    match provider {
        // Provider ids are this app's ids (see AiProvider), not vendor names.
        "claude" => Ok(Box::new(ClaudeCli)),
        "openai" | "codex" => Ok(Box::new(CodexCli)),
        "gemini" => Ok(Box::new(GeminiCli)),
        other => Err(format!(
            "Provider '{other}' has no CLI bridge. CLI mode supports Claude Code, Codex CLI and Gemini CLI."
        )),
    }
}

/// Directories a GUI app has to look in itself. A Tauri app launched from
/// Finder or the Dock inherits a minimal PATH (`/usr/bin:/bin:/usr/sbin:/sbin`)
/// and never sees the shell rc files where these CLIs put themselves, so a
/// bare `Command::new("claude")` fails for users whose CLI works fine in a
/// terminal. These are the standard install locations for the three CLIs and
/// for the package managers that ship them.
fn extra_bin_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/bin"),
        PathBuf::from("/bin"),
    ];
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        for rel in [
            ".local/bin",
            ".claude/local",
            ".codex/bin",
            ".bun/bin",
            ".deno/bin",
            ".cargo/bin",
            ".volta/bin",
            ".npm-global/bin",
            "node_modules/.bin",
        ] {
            dirs.push(home.join(rel));
        }
    }
    dirs
}

/// Resolves an executable name to an absolute path, searching PATH first and
/// then the GUI-launch fallbacks. Returns None when the CLI is not installed.
fn resolve_binary(name: &str) -> Option<PathBuf> {
    let exe_names: Vec<String> = if cfg!(windows) {
        vec![
            format!("{name}.cmd"),
            format!("{name}.exe"),
            name.to_string(),
        ]
    } else {
        vec![name.to_string()]
    };
    let path_dirs = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect::<Vec<_>>())
        .unwrap_or_default();
    for dir in path_dirs.into_iter().chain(extra_bin_dirs()) {
        for exe in &exe_names {
            let candidate = dir.join(exe);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn truncate_stderr(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.len() <= STDERR_LIMIT {
        return trimmed.to_string();
    }
    format!("{}…", &trimmed[..STDERR_LIMIT])
}

fn not_installed_error(adapter: &dyn CliAdapter) -> String {
    format!(
        "{} is not installed, or Applye cannot see it. Install `{}` and make sure it runs in a terminal, then try again. If it works in a terminal but not here, it is installed somewhere Applye does not look - reinstall it to a standard location such as /usr/local/bin.",
        adapter.label(),
        adapter.command()
    )
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub async fn run(req: &AiRequest) -> Result<AiResponse, String> {
    let adapter = adapter_for(&req.provider)?;
    let binary = resolve_binary(adapter.command()).ok_or_else(|| not_installed_error(&*adapter))?;

    let args = adapter.build_args(req);
    let stdin_data = adapter.build_stdin(req);

    let mut child = Command::new(&binary)
        .args(&args)
        // Never the user's own files: the CLI gets a scratch dir with nothing
        // in it, so even a tool-happy agent has nothing local to read.
        .current_dir(std::env::temp_dir())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // Kill the child if this future is dropped (window closed mid-run).
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Could not start {}: {e}", adapter.label()))?;

    // Write and drop stdin before waiting, or a CLI that reads to EOF hangs.
    {
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| format!("Could not write the prompt to {}.", adapter.label()))?;
        stdin
            .write_all(stdin_data.as_bytes())
            .await
            .map_err(|e| format!("Could not write the prompt to {}: {e}", adapter.label()))?;
        stdin
            .shutdown()
            .await
            .map_err(|e| format!("Could not finish writing to {}: {e}", adapter.label()))?;
    }

    let output = match tokio::time::timeout(CLI_TIMEOUT, child.wait_with_output()).await {
        Ok(result) => result.map_err(|e| format!("{} failed to run: {e}", adapter.label()))?,
        Err(_) => {
            return Err(format!(
                "{} did not answer within {} seconds and was stopped.",
                adapter.label(),
                CLI_TIMEOUT.as_secs()
            ))
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = truncate_stderr(&String::from_utf8_lossy(&output.stderr));

    if !output.status.success() {
        let detail = if stderr.is_empty() {
            "no error output".to_string()
        } else {
            stderr
        };
        return Err(format!(
            "{} exited with an error: {detail}",
            adapter.label()
        ));
    }

    let reply = adapter.parse_output(&stdout)?;
    Ok(AiResponse {
        text: reply.text,
        tokens_input: reply.tokens_input,
        tokens_output: reply.tokens_output,
        cached_tokens: reply.cached_tokens,
    })
}

// ---------------------------------------------------------------------------
// Detection, for Settings
// ---------------------------------------------------------------------------

/// A `--version` probe must not hang Settings; these CLIs answer in well under
/// a second when healthy.
const VERSION_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliStatus {
    /// The app's provider id ("claude" | "openai" | "gemini").
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
        ("gemini", "gemini", "Gemini CLI"),
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

// ---------------------------------------------------------------------------
// Assisted install
// ---------------------------------------------------------------------------

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
    ("gemini", "@google/gemini-cli"),
];

fn npm_package_for(provider: &str) -> Option<&'static str> {
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
    use crate::ai::AiMode;

    fn req(provider: &str, model: &str) -> AiRequest {
        AiRequest {
            mode: AiMode::Cli,
            provider: provider.to_string(),
            model: model.to_string(),
            system_prompt: "SYSTEM".to_string(),
            user_prompt: "USER".to_string(),
            language: None,
            max_tokens: None,
        }
    }

    #[test]
    fn unknown_provider_is_rejected_by_name() {
        let err = match adapter_for("deepseek") {
            Err(e) => e,
            Ok(_) => panic!("deepseek should have no CLI adapter"),
        };
        assert!(err.contains("deepseek"), "{err}");
    }

    #[test]
    fn claude_args_are_headless_json_with_system_prompt() {
        let args = ClaudeCli.build_args(&req("claude", "claude-sonnet-5"));
        assert_eq!(args[0], "-p");
        assert!(args.contains(&"--output-format".to_string()));
        assert!(args.contains(&"json".to_string()));
        assert!(args.contains(&"SYSTEM".to_string()));
        assert!(args.contains(&"claude-sonnet-5".to_string()));
        // The user prompt must never be an argv element.
        assert!(!args.contains(&"USER".to_string()));
        assert_eq!(ClaudeCli.build_stdin(&req("claude", "m")), "USER");
    }

    #[test]
    fn model_flag_is_omitted_when_model_is_blank() {
        let args = ClaudeCli.build_args(&req("claude", "  "));
        assert!(!args.contains(&"--model".to_string()));
    }

    #[test]
    fn codex_reads_prompt_from_stdin_in_a_read_only_sandbox() {
        let args = CodexCli.build_args(&req("openai", "gpt-5.6"));
        assert_eq!(args[0], "exec");
        assert_eq!(args[1], "-");
        assert!(args.contains(&"--skip-git-repo-check".to_string()));
        assert!(args.contains(&"read-only".to_string()));
        assert_eq!(CodexCli.build_stdin(&req("openai", "m")), "SYSTEM\n\nUSER");
    }

    #[test]
    fn gemini_asks_for_json_and_folds_the_system_prompt_in() {
        let args = GeminiCli.build_args(&req("gemini", "gemini-3-pro"));
        assert!(args.contains(&"--output-format".to_string()));
        assert_eq!(GeminiCli.build_stdin(&req("gemini", "m")), "SYSTEM\n\nUSER");
    }

    #[test]
    fn claude_output_yields_text_and_usage() {
        let raw = r#"{"type":"result","is_error":false,"result":"hello",
            "usage":{"input_tokens":10,"output_tokens":4,"cache_read_input_tokens":7}}"#;
        let reply = ClaudeCli.parse_output(raw).unwrap();
        assert_eq!(reply.text, "hello");
        assert_eq!(reply.tokens_input, 10);
        assert_eq!(reply.tokens_output, 4);
        assert_eq!(reply.cached_tokens, 7);
    }

    #[test]
    fn claude_error_result_becomes_an_error() {
        let raw = r#"{"is_error":true,"result":"rate limited"}"#;
        let err = ClaudeCli.parse_output(raw).unwrap_err();
        assert!(err.contains("rate limited"), "{err}");
    }

    #[test]
    fn codex_output_is_the_trimmed_final_message() {
        let reply = CodexCli.parse_output("  {\"score\":7}\n").unwrap();
        assert_eq!(reply.text, "{\"score\":7}");
        assert_eq!(reply.tokens_input, 0);
    }

    #[test]
    fn codex_empty_output_is_an_error() {
        assert!(CodexCli.parse_output("   \n").is_err());
    }

    #[test]
    fn gemini_output_yields_response_text_and_summed_tokens() {
        let raw = r#"{"response":"hi","stats":{"models":{"gemini-3-pro":
            {"tokens":{"prompt":12,"candidates":5,"cached":3}}}}}"#;
        let reply = GeminiCli.parse_output(raw).unwrap();
        assert_eq!(reply.text, "hi");
        assert_eq!(reply.tokens_input, 12);
        assert_eq!(reply.tokens_output, 5);
        assert_eq!(reply.cached_tokens, 3);
    }

    #[test]
    fn gemini_error_object_becomes_an_error() {
        let raw = r#"{"error":{"message":"quota exceeded"}}"#;
        let err = GeminiCli.parse_output(raw).unwrap_err();
        assert!(err.contains("quota exceeded"), "{err}");
    }

    #[test]
    fn gemini_missing_stats_reports_zero_rather_than_failing() {
        let reply = GeminiCli.parse_output(r#"{"response":"hi"}"#).unwrap();
        assert_eq!((reply.tokens_input, reply.tokens_output), (0, 0));
    }

    #[test]
    fn stderr_is_truncated_for_error_messages() {
        let long = "x".repeat(STDERR_LIMIT + 500);
        let out = truncate_stderr(&long);
        assert!(out.len() <= STDERR_LIMIT + 4);
        assert!(out.ends_with('…'));
    }

    #[test]
    fn a_missing_binary_resolves_to_none() {
        assert!(resolve_binary("applye-definitely-not-a-real-binary").is_none());
    }

    #[tokio::test]
    async fn probe_reports_all_three_supported_clis() {
        let statuses = cli_probe().await;
        assert_eq!(statuses.len(), 3);
        let providers: Vec<&str> = statuses.iter().map(|s| s.provider.as_str()).collect();
        assert_eq!(providers, vec!["claude", "openai", "gemini"]);
        for s in &statuses {
            // Installed or not depends on the machine; the path must agree.
            assert_eq!(s.installed, s.path.is_some());
            // A CLI cannot be runnable without being present at all.
            assert!(!(s.working && !s.installed), "{s:?}");
            // Whichever way the probe went, it must say which: a working CLI
            // reports a version, a broken one reports why.
            if s.installed {
                assert_eq!(s.working, s.version.is_some(), "{s:?}");
                assert_eq!(!s.working, s.error.is_some(), "{s:?}");
            }
        }
    }

    #[test]
    fn every_supported_provider_has_an_install_package() {
        for (provider, _, _) in [
            ("claude", "claude", "Claude Code"),
            ("openai", "codex", "Codex CLI"),
            ("gemini", "gemini", "Gemini CLI"),
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
        assert_eq!(npm_package_for("gemini"), Some("@google/gemini-cli"));
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

    #[test]
    fn not_installed_error_names_the_command() {
        let msg = not_installed_error(&ClaudeCli);
        assert!(msg.contains("claude"), "{msg}");
        assert!(msg.contains("Claude Code"), "{msg}");
    }
}
