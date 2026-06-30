// Direct API mode — reqwest to the provider endpoint.
//
// Two request shapes are supported behind one `run`:
//   - Anthropic Messages API (provider "claude"), with a cache_control
//     breakpoint on the stable system prefix.
//   - OpenAI-compatible Chat Completions (provider "deepseek", and any future
//     OpenAI-style provider), a single function parameterised by base URL.
//
// The key is read from the OS keychain by the caller and is never logged.
// DeepSeek is a China-based cloud provider; the privacy disclosure for sending
// job text off-device lives in the Settings UI and CHANGELOG.

use super::{AiRequest, AiResponse};
use serde_json::{json, Value};

const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";
// Verified against api-docs.deepseek.com (2026-06): OpenAI-compatible base.
const DEEPSEEK_URL: &str = "https://api.deepseek.com/chat/completions";
const MAX_TOKENS: u32 = 2048;

pub async fn run(req: &AiRequest, api_key: &str) -> Result<AiResponse, String> {
    match req.provider.as_str() {
        // "claude" is this app's id for the Anthropic provider (see AiProvider).
        "claude" => anthropic_run(req, api_key).await,
        // DeepSeek speaks the OpenAI chat/completions shape.
        "deepseek" => openai_compatible_run(req, api_key, DEEPSEEK_URL, "DeepSeek").await,
        other => Err(format!(
            "Provider '{other}' is not supported in API mode yet."
        )),
    }
}

async fn anthropic_run(req: &AiRequest, api_key: &str) -> Result<AiResponse, String> {
    // Stable prefix in `system` (cacheable); dynamic input in the user turn.
    let body = json!({
        "model": req.model,
        "max_tokens": MAX_TOKENS,
        "system": [{
            "type": "text",
            "text": req.system_prompt,
            "cache_control": { "type": "ephemeral" }
        }],
        "messages": [{ "role": "user", "content": req.user_prompt }],
    });

    let resp = reqwest::Client::new()
        .post(ANTHROPIC_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request to Anthropic failed: {e}"))?;

    let status = resp.status();
    let val: Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response from Anthropic: {e}"))?;

    if !status.is_success() {
        return Err(format!(
            "Anthropic API error ({}): {}",
            status.as_u16(),
            error_message(&val)
        ));
    }

    let text = val
        .get("content")
        .and_then(Value::as_array)
        .map(|blocks| {
            blocks
                .iter()
                .filter(|b| b.get("type").and_then(Value::as_str) == Some("text"))
                .filter_map(|b| b.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default();

    let usage = val.get("usage");
    Ok(AiResponse {
        text,
        tokens_input: usage_u32(usage, "input_tokens"),
        tokens_output: usage_u32(usage, "output_tokens"),
        cached_tokens: usage_u32(usage, "cache_read_input_tokens"),
    })
}

/// OpenAI-compatible Chat Completions. DeepSeek returns prompt cache hit/miss
/// token counts in `usage`; we surface the hit count for the cost counter.
async fn openai_compatible_run(
    req: &AiRequest,
    api_key: &str,
    url: &str,
    label: &str,
) -> Result<AiResponse, String> {
    let body = json!({
        "model": req.model,
        "max_tokens": MAX_TOKENS,
        "messages": [
            { "role": "system", "content": req.system_prompt },
            { "role": "user", "content": req.user_prompt },
        ],
    });

    let resp = reqwest::Client::new()
        .post(url)
        .header("authorization", format!("Bearer {api_key}"))
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request to {label} failed: {e}"))?;

    let status = resp.status();
    let val: Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response from {label}: {e}"))?;

    if !status.is_success() {
        return Err(format!(
            "{label} API error ({}): {}",
            status.as_u16(),
            error_message(&val)
        ));
    }

    let text = val
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|c| c.first())
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    let usage = val.get("usage");
    Ok(AiResponse {
        text,
        tokens_input: usage_u32(usage, "prompt_tokens"),
        tokens_output: usage_u32(usage, "completion_tokens"),
        cached_tokens: usage_u32(usage, "prompt_cache_hit_tokens"),
    })
}

fn usage_u32(usage: Option<&Value>, key: &str) -> u32 {
    usage
        .and_then(|u| u.get(key))
        .and_then(Value::as_u64)
        .unwrap_or(0) as u32
}

fn error_message(val: &Value) -> String {
    val.get("error")
        .and_then(|e| e.get("message"))
        .and_then(Value::as_str)
        .unwrap_or("unknown error")
        .to_string()
}
