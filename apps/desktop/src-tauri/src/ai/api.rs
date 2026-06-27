// Direct API mode — reqwest to provider endpoint.
// Supports prompt caching (provider-dependent). Tracks token usage.
// TODO (Phase 1): implement reqwest client, provider routing, token counting.

use super::{AiRequest, AiResponse};

pub struct ApiAdapter;

impl ApiAdapter {
    // TODO (Phase 1): pub async fn run(req: &AiRequest, api_key: &str, provider: &str) -> Result<AiResponse, Box<dyn std::error::Error>>
    // Providers: claude (Anthropic), openai, gemini
    // Always use structured JSON output. Verify prompt-caching TTL/rates per current docs.
}
