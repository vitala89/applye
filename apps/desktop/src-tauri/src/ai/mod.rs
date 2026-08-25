// AI dispatch layer - two modes, one abstraction.
// Frontend calls invoke('ai_run', { req }) regardless of mode.
// `ai_run` is the SINGLE AI entry point: adding a provider later is one branch
// in api.rs; the frontend never knows whether a reply came from API or CLI.

pub mod api;
pub mod cli;
pub mod cli_install;
pub mod cli_probe;
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
/// The API key is NEVER part of this request - it is read from the keychain.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRequest {
    pub mode: AiMode,
    pub provider: String, // "anthropic"
    pub model: String,
    pub system_prompt: String,
    pub user_prompt: String,
    /// The leading, per-job-stable part of the user turn - `resume-tailoring`'s
    /// `RenderedSkill.user_prompt_cacheable`, forwarded verbatim. `anthropic_run`
    /// marks it as an ephemeral `cache_control` breakpoint so repeated calls for
    /// the same job (the three tailoring passes) do not re-bill it. `None` for
    /// every call site that has nothing to share across repeats.
    #[serde(default)]
    pub cacheable_prefix: Option<String>,
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
    /// Why the provider stopped generating, verbatim: `stop_reason` on
    /// Anthropic, `finish_reason` on the OpenAI-compatible shape.
    ///
    /// Both providers report it in the same JSON this code already parses for
    /// `usage`, and it used to be dropped - so an answer cut off at the token
    /// cap reached the frontend as a plain string, and the only trace was that
    /// its JSON did not close. `JSON.parse` then threw
    /// `Unexpected end of JSON input`, which is indistinguishable from a model
    /// that returned nonsense. The value is passed through rather than
    /// interpreted here: the vendors spell "I hit the cap" differently
    /// (`max_tokens` against `length`), and normalising it in Rust would put
    /// the vendor knowledge one layer away from the code that reads it.
    ///
    /// `None` on the CLI bridge, which reports no equivalent.
    #[serde(default)]
    pub stop_reason: Option<String>,
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
/// chosen provider. Errors are returned cleanly - no panics, no key in logs.
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
