// Direct API mode — reqwest to the provider endpoint. Phase 2: Anthropic only.
// The stable `system` prefix carries a cache_control breakpoint so repeated
// calls with the same profile prefix can hit the prompt cache. Token usage is
// captured from the response for the UI cost counter. The key is never logged.

use super::{AiRequest, AiResponse};
use serde_json::{json, Value};

const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const MAX_TOKENS: u32 = 1024;

pub async fn run(req: &AiRequest, api_key: &str) -> Result<AiResponse, String> {
    if req.provider != "anthropic" {
        return Err(format!(
            "Provider '{}' is not supported yet (Phase 2 ships Anthropic only).",
            req.provider
        ));
    }

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
        let msg = val
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
            .unwrap_or("unknown error");
        return Err(format!("Anthropic API error ({}): {msg}", status.as_u16()));
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
    let u = |key: &str| -> u32 {
        usage
            .and_then(|u| u.get(key))
            .and_then(Value::as_u64)
            .unwrap_or(0) as u32
    };

    Ok(AiResponse {
        text,
        tokens_input: u("input_tokens"),
        tokens_output: u("output_tokens"),
        cached_tokens: u("cache_read_input_tokens"),
    })
}
