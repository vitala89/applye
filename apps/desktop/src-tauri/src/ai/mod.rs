// AI dispatch layer — two modes, one abstraction.
// Frontend calls invoke('ai_run', { req }) regardless of mode.
// This module routes to api.rs (reqwest) or cli.rs (tokio::process).
// Adding a provider = one branch here, zero Angular changes.

pub mod api;
pub mod cli;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AiRequest {
    pub skill: String,
    pub context: std::collections::HashMap<String, String>,
    pub model: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AiResponse {
    pub content: String,
    pub model_used: String,
    pub tokens_input: u32,
    pub tokens_output: u32,
    pub input_hash: String,
}

// TODO (Phase 1): pub async fn dispatch(req: AiRequest, mode: &str) -> anyhow::Result<AiResponse>
// - load skill file from embedded skills/ directory
// - inject context fields into prompt template
// - check cache by input_hash (DB lookup, 0 tokens if hit)
// - if miss: route to api::run() or cli::run()
// - store result in cache
