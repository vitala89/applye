// CLI bridge mode — run claude/codex/gemini via tokio::process. A later phase.
// The trait is defined now so dispatch compiles and adding real adapters is
// additive. Exact headless CLI flags change and must be verified against
// current docs at build time — do NOT hard-code them from memory.

use super::{AiRequest, AiResponse};

#[allow(dead_code)]
pub trait CliAdapter {
    /// The executable name (e.g. "claude").
    fn command(&self) -> &str;
    /// Headless invocation args for a one-shot prompt.
    fn build_args(&self, prompt: &str) -> Vec<String>;
    /// Extract the reply text from the CLI's raw stdout.
    fn parse_output(&self, raw: &str) -> Result<String, String>;
}

/// Stub: CLI-bridge is not implemented yet. Keeps `ai_run` dispatch total.
pub async fn run(_req: &AiRequest) -> Result<AiResponse, String> {
    Err("CLI mode is not implemented yet — coming in a later phase.".to_string())
}
