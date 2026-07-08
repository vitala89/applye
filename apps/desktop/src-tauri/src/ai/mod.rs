// AI dispatch layer — two modes, one abstraction.
// Frontend calls invoke('ai_run', { req }) regardless of mode.
// `ai_run` is the SINGLE AI entry point: adding a provider later is one branch
// in api.rs; the frontend never knows whether a reply came from API or CLI.

pub mod api;
pub mod cli;
pub mod skills;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AiMode {
    Api,
    Cli,
}

/// A request to run one AI task. The stable prefix (`system_prompt`) is kept
/// separate from the dynamic `user_prompt` so prompt caching can key on it.
/// The API key is NEVER part of this request — it is read from the keychain.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRequest {
    pub mode: AiMode,
    pub provider: String, // "anthropic"
    pub model: String,
    pub system_prompt: String,
    pub user_prompt: String,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiResponse {
    pub text: String,
    pub tokens_input: u32,
    pub tokens_output: u32,
    pub cached_tokens: u32,
}

async fn dispatch(req: AiRequest, api_key: Option<String>) -> Result<AiResponse, String> {
    match req.mode {
        AiMode::Api => {
            let key = api_key.ok_or_else(|| "internal: missing API key".to_string())?;
            api::run(&req, &key).await
        }
        AiMode::Cli => cli::run(&req).await,
    }
}

/// The single AI entry point. In API mode the provider key is loaded from the
/// OS keychain here (never passed from the frontend) and sent only to the
/// chosen provider. Errors are returned cleanly — no panics, no key in logs.
#[tauri::command]
pub async fn ai_run(req: AiRequest) -> Result<AiResponse, String> {
    let api_key = match req.mode {
        AiMode::Api => Some(
            crate::keys::KeyStore::get_key(&req.provider)?.ok_or_else(|| {
                format!(
                    "No API key stored for '{}'. Add it in Settings.",
                    req.provider
                )
            })?,
        ),
        AiMode::Cli => None,
    };
    dispatch(req, api_key).await
}
