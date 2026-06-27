// CLI bridge mode — run claude/codex/gemini CLI via tokio::process.
// Zero API tokens (CLI subscription). User's installed CLI is the executor.
// Each CLI has different headless flags — verify against current docs at build time.
// Do NOT hard-code CLI flags from memory; CLI interfaces change.

use super::{AiRequest, AiResponse};

pub trait CliAdapter {
    fn command(&self) -> &str;
    fn build_args(&self, prompt: &str) -> Vec<String>;
    fn parse_output(&self, raw: &str) -> Result<String, Box<dyn std::error::Error>>;
}

// TODO (Phase 1): implement ClaudeCliAdapter, CodexCliAdapter, GeminiCliAdapter
// TODO (Phase 1): pub async fn run(req: &AiRequest, adapter: &dyn CliAdapter) -> anyhow::Result<AiResponse>
// - write prompt to stdin or temp file
// - spawn process via tokio::process::Command
// - parse stdout into AiResponse
