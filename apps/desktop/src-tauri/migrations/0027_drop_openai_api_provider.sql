-- OpenAI is not an API-mode provider.
--
-- `ai/api.rs` dispatches API mode to Anthropic and DeepSeek only; every other
-- provider id is answered with "not supported in API mode yet". Onboarding
-- nevertheless offered an OpenAI card in the API-key flow, so a user could
-- pick it, be walked through creating a key, and then have every scoring,
-- tailoring and interview-prep call fail with no hint that the provider itself
-- was the problem. The card is gone; this moves anyone already stranded there.
--
-- Only rows in API mode are touched. `openai` is the app's id for Codex and
-- stays a valid CLI-bridge provider, which is how OpenAI models are reached.
-- `gemini` is included because it has no API branch either, and the same
-- onboarding path could store it.
UPDATE settings
   SET provider = 'claude'
 WHERE ai_mode = 'api'
   AND provider IN ('openai', 'gemini');
