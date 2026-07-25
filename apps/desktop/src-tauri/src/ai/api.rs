// Direct API mode - reqwest to the provider endpoint.
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
use std::time::Duration;

const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";
// Verified against api-docs.deepseek.com (2026-06): OpenAI-compatible base.
const DEEPSEEK_URL: &str = "https://api.deepseek.com/chat/completions";
const DEFAULT_MAX_TOKENS: u32 = 8192;

/// Whole-request budget, covering connect, response and reading the body.
///
/// Matches the CLI bridge's `CLI_TIMEOUT`, because it bounds the same thing:
/// one full generation. Generous on purpose - a long non-streaming answer at
/// `DEFAULT_MAX_TOKENS` legitimately takes minutes, and cutting a real answer
/// short is its own bug. What it rules out is the *unbounded* wait.
const API_TIMEOUT: Duration = Duration::from_secs(600);

/// Connect-only budget. Split from the total so the common failure - no
/// network, wrong host, blocked egress - is reported in seconds instead of
/// consuming the entire generation budget first.
const API_CONNECT_TIMEOUT: Duration = Duration::from_secs(15);

fn resolve_max_tokens(req: &AiRequest) -> u32 {
    req.max_tokens.unwrap_or(DEFAULT_MAX_TOKENS)
}

fn build_client(timeout: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(timeout)
        .connect_timeout(API_CONNECT_TIMEOUT.min(timeout))
        .build()
        .map_err(|e| format!("Could not create the HTTP client: {e}"))
}

/// The shared client for every API-mode call.
///
/// `reqwest::Client::new()` - what this used to be - has **no timeout at all**,
/// so a connection that stalled after being accepted hung the request forever.
/// Nothing downstream could recover: the Tauri command never returned, so the
/// promise the UI awaited never settled and its spinner never stopped.
fn http_client() -> Result<reqwest::Client, String> {
    build_client(API_TIMEOUT)
}

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
        "max_tokens": resolve_max_tokens(req),
        "system": [{
            "type": "text",
            "text": req.system_prompt,
            "cache_control": { "type": "ephemeral" }
        }],
        "messages": [{ "role": "user", "content": req.user_prompt }],
    });

    let resp = http_client()?
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
        "max_tokens": resolve_max_tokens(req),
        "messages": [
            { "role": "system", "content": req.system_prompt },
            { "role": "user", "content": req.user_prompt },
        ],
    });

    let resp = http_client()?
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::{AiMode, AiRequest};

    fn req(max: Option<u32>) -> AiRequest {
        AiRequest {
            mode: AiMode::Api,
            provider: "claude".into(),
            model: "m".into(),
            system_prompt: "s".into(),
            user_prompt: "u".into(),
            language: None,
            max_tokens: max,
        }
    }

    #[test]
    fn default_cap_is_8192_when_unset() {
        assert_eq!(resolve_max_tokens(&req(None)), 8192);
    }

    #[test]
    fn cap_honors_explicit_override() {
        assert_eq!(resolve_max_tokens(&req(Some(4096))), 4096);
    }

    /// Regression: API mode used `reqwest::Client::new()`, which carries no
    /// timeout of any kind. A server that accepted the connection and then
    /// went quiet - a dropped wifi link, a sleeping laptop, a stalled provider -
    /// left `send()` awaiting forever, so `ai_run` never returned and the UI
    /// that awaits it sat on "Generating..." with no error, permanently.
    #[tokio::test]
    async fn a_stalled_server_times_out_instead_of_waiting_forever() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            // Accept, then answer nothing while holding the socket open. The
            // binding must be named: dropping it would close the connection and
            // the client would fail for the wrong reason.
            let (_socket, _) = listener.accept().await.unwrap();
            tokio::time::sleep(Duration::from_secs(30)).await;
        });

        let client = build_client(Duration::from_millis(300)).expect("build client");
        let started = std::time::Instant::now();
        let result = client
            .post(format!("http://{addr}/chat/completions"))
            .body("{}")
            .send()
            .await;

        let err = result.expect_err("a stalled server must not return Ok");
        assert!(err.is_timeout(), "expected a timeout, got: {err}");
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "gave up eventually but far too late: {:?}",
            started.elapsed()
        );
    }

    #[test]
    fn the_shipped_budgets_are_finite_and_connect_fails_first() {
        // The whole point of the fix: no unbounded wait, and an unreachable
        // host is reported in seconds rather than after the full generation
        // budget has elapsed.
        assert!(API_CONNECT_TIMEOUT < API_TIMEOUT);
        assert!(API_TIMEOUT <= Duration::from_secs(600));
    }
}
