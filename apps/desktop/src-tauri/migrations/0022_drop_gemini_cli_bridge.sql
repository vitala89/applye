-- Gemini CLI is no longer a CLI-bridge provider.
--
-- On 2026-06-18 Google stopped Gemini CLI serving Google AI Pro, AI Ultra and
-- free individual accounts (only enterprise Code Assist licences and API-key
-- auth still work), which is exactly the audience CLI bridge mode exists for.
-- The adapter has been removed.
--
-- Anyone whose settings still name it would otherwise be stuck: every AI task
-- would fail, and the Settings provider list no longer contains the value, so
-- the picker would render blank with nothing obviously wrong. Move them to
-- Claude Code, the default CLI provider. Only rows in CLI mode are touched -
-- `gemini` remains a valid choice for API mode, where it is unaffected.
UPDATE settings
   SET provider = 'claude'
 WHERE ai_mode = 'cli'
   AND provider = 'gemini';
