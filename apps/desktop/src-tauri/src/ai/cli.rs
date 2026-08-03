// CLI bridge mode - run a coding CLI the user already has installed and
// already pays for (Claude Code, Codex CLI) as a one-shot subprocess, instead
// of calling a provider HTTP API with an API key.
//
// Why this exists: a user on a Claude Pro or ChatGPT Plus subscription has no
// reason to also buy API credit. In CLI mode Applye stores no key, and
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
// Re-verify these before changing them; do not edit them from memory.
//
// Gemini CLI was supported here and has been removed: on 2026-06-18 Google
// stopped it serving Google AI Pro, AI Ultra and free individual accounts,
// leaving only enterprise Code Assist licences and API-key auth - i.e. exactly
// not the audience this mode exists for. Its replacement, Antigravity CLI
// (`agy`), installs via `curl | bash` rather than npm and is a different
// binary, so it is a new adapter if it is ever wanted, not a rename.

use super::{AiRequest, AiResponse};

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
pub(super) struct CliReply {
    text: String,
    tokens_input: u32,
    tokens_output: u32,
    cached_tokens: u32,
}

pub(super) trait CliAdapter {
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
            let detail = val
                .get("result")
                .and_then(Value::as_str)
                .unwrap_or("no detail");
            return Err(format!(
                "Claude Code reported an error: {detail}{}",
                sign_in_hint(detail, "claude")
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

/// The one repair a user has to make themselves, appended to the CLI's own
/// words when the CLI says the session is not authenticated.
///
/// Applye cannot fix this for them: CLI bridge mode exists precisely because
/// the user authenticates the CLI against their own subscription, outside the
/// app, and there is no key here to refresh. Without the hint the message is
/// accurate and still leaves the user with nowhere to go - the expired session
/// reads as an Applye failure, and the resume import stays broken for as long
/// as it takes them to guess otherwise.
fn sign_in_hint(detail: &str, command: &str) -> String {
    let d = detail.to_ascii_lowercase();
    let is_auth = d.contains("authenticate")
        || d.contains("oauth")
        || d.contains("unauthorized")
        || d.contains("log in")
        || d.contains("login")
        || d.contains("sign in");
    if is_auth {
        format!(" Run `{command}` in a terminal and sign in, then try again.")
    } else {
        String::new()
    }
}

fn usage_u32(usage: Option<&Value>, key: &str) -> u32 {
    usage
        .and_then(|u| u.get(key))
        .and_then(Value::as_u64)
        .unwrap_or(0) as u32
}

pub(super) fn adapter_for(provider: &str) -> Result<Box<dyn CliAdapter + Send + Sync>, String> {
    match provider {
        // Provider ids are this app's ids (see AiProvider), not vendor names.
        "claude" => Ok(Box::new(ClaudeCli)),
        "openai" | "codex" => Ok(Box::new(CodexCli)),
        // Withdrawn, not forgotten: on 2026-06-18 Google stopped Gemini CLI
        // serving Google AI Pro, AI Ultra and free individual accounts, which
        // is exactly who CLI bridge mode is for (only enterprise Code Assist
        // licences and API-key auth still work). The successor is Antigravity
        // CLI (`agy`) - a different binary with a different install path, so
        // it would be a new adapter, not a rename of this one.
        // Ref: github.com/google-gemini/gemini-cli discussions/28017
        "gemini" => Err(
            "Google withdrew Gemini CLI for personal accounts on 18 June 2026, so it can no longer run Applye's tasks. Choose Claude Code or Codex CLI, or switch to API mode."
                .to_string(),
        ),
        other => Err(format!(
            "Provider '{other}' has no CLI bridge. CLI mode supports Claude Code and Codex CLI."
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
pub(super) fn resolve_binary(name: &str) -> Option<PathBuf> {
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

pub(super) fn truncate_stderr(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.len() <= STDERR_LIMIT {
        return trimmed.to_string();
    }
    format!("{}…", &trimmed[..STDERR_LIMIT])
}

/// Why a CLI that exited non-zero failed, in the user's words where possible.
///
/// stderr is checked first because that is where a CLI that fails to *start* a
/// session (bad flag, missing binary behind a wrapper) writes. But Claude Code
/// in `-p --output-format json` mode reports a failed *session* - expired
/// OAuth, rate limit, API error - as its normal JSON on **stdout**, exits 1 and
/// writes nothing to stderr at all. Reading only stderr turned every one of
/// those into "no error output", which named neither the cause nor the fix and
/// reached the onboarding resume step as "Couldn't parse that resume".
///
/// The adapter's own parser already knows how to pull that reason out, and its
/// error text already names the CLI, so it is returned as-is.
fn failure_message(
    adapter: &dyn CliAdapter,
    code: Option<i32>,
    stdout: &str,
    stderr: &str,
) -> String {
    if !stderr.is_empty() {
        return format!(
            "{} exited with an error: {stderr}{}",
            adapter.label(),
            sign_in_hint(stderr, adapter.command())
        );
    }
    if !stdout.trim().is_empty() {
        return match adapter.parse_output(stdout) {
            Err(detail) => detail,
            // A reply that parses cleanly alongside a failed exit status says
            // nothing usable, so report the status rather than the reply.
            Ok(_) => exit_status_message(adapter, code),
        };
    }
    exit_status_message(adapter, code)
}

fn exit_status_message(adapter: &dyn CliAdapter, code: Option<i32>) -> String {
    match code {
        Some(c) => format!(
            "{} exited with status {c} and printed no error. Run `{}` in a terminal to check it is installed and signed in.",
            adapter.label(),
            adapter.command()
        ),
        None => format!(
            "{} was stopped before it answered.",
            adapter.label()
        ),
    }
}

pub(super) fn not_installed_error(adapter: &dyn CliAdapter) -> String {
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
        return Err(failure_message(
            &*adapter,
            output.status.code(),
            &stdout,
            &stderr,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::cli_install::npm_package_for;
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
    fn claude_output_yields_text_and_usage() {
        let raw = r#"{"type":"result","is_error":false,"result":"hello",
            "usage":{"input_tokens":10,"output_tokens":4,"cache_read_input_tokens":7}}"#;
        let reply = ClaudeCli.parse_output(raw).unwrap();
        assert_eq!(reply.text, "hello");
        assert_eq!(reply.tokens_input, 10);
        assert_eq!(reply.tokens_output, 4);
        assert_eq!(reply.cached_tokens, 7);
    }

    // Regression: Claude Code answers a failed session with its normal JSON on
    // stdout, exit 1 and an empty stderr. Reading stderr alone reported "no
    // error output" and threw the reason away - which is how an expired OAuth
    // session reached the user as "Couldn't parse that resume". This payload is
    // a real one, trimmed, from `claude -p --output-format json` after the
    // session expired.
    #[test]
    fn a_failed_claude_session_reports_what_claude_said_not_the_exit_code() {
        let stdout = r#"{"is_error":true,"terminal_reason":"api_error","subtype":"success",
            "result":"Failed to authenticate: OAuth session expired and could not be refreshed"}"#;

        let msg = failure_message(&ClaudeCli, Some(1), stdout, "");

        assert!(msg.contains("OAuth session expired"), "{msg}");
        assert!(!msg.contains("no error"), "{msg}");
        // Applye holds no key in CLI mode, so signing the CLI in is the user's
        // to do and the message has to say so.
        assert!(msg.contains("Run `claude` in a terminal"), "{msg}");
    }

    #[test]
    fn a_codex_auth_failure_on_stderr_gets_the_same_hint() {
        let msg = failure_message(&CodexCli, Some(1), "", "stream error: unauthorized");
        assert!(msg.contains("Run `codex` in a terminal"), "{msg}");
    }

    #[test]
    fn a_failure_that_is_not_about_auth_gets_no_sign_in_hint() {
        let msg = failure_message(
            &ClaudeCli,
            Some(1),
            r#"{"is_error":true,"result":"rate limit"}"#,
            "",
        );
        assert!(msg.contains("rate limit"), "{msg}");
        assert!(!msg.contains("sign in"), "{msg}");
    }

    #[test]
    fn stderr_still_wins_when_the_cli_fails_before_it_answers() {
        let msg = failure_message(&ClaudeCli, Some(2), "", "error: unknown option '--nope'");
        assert!(msg.contains("--nope"), "{msg}");
    }

    #[test]
    fn a_silent_failure_names_the_status_and_what_to_try() {
        let msg = failure_message(&CodexCli, Some(127), "", "");
        assert!(msg.contains("127"), "{msg}");
        assert!(msg.contains("codex"), "{msg}");
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

    #[test]
    fn gemini_is_refused_with_the_reason_rather_than_a_generic_message() {
        // Google stopped Gemini CLI serving personal accounts on 2026-06-18.
        // A user whose settings still say `cli` + `gemini` must be told what
        // actually happened, not left with "unsupported provider".
        let err = match adapter_for("gemini") {
            Err(e) => e,
            Ok(_) => panic!("gemini must no longer resolve to a CLI adapter"),
        };
        assert!(err.contains("18 June 2026"), "{err}");
        assert!(err.contains("Codex CLI"), "{err}");
        // And it must not be offered for install either.
        assert_eq!(npm_package_for("gemini"), None);
    }

    #[test]
    fn not_installed_error_names_the_command() {
        let msg = not_installed_error(&ClaudeCli);
        assert!(msg.contains("claude"), "{msg}");
        assert!(msg.contains("Claude Code"), "{msg}");
    }
}
