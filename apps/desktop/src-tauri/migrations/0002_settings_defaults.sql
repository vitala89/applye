-- 0001 seeds `sources` but never inserts a `settings` row, so
-- `SELECT * FROM settings WHERE id = 1` (fetch_one) fails with RowNotFound and
-- db_get_settings errors - the Settings screen can't load. 0001 is already
-- applied (can't be edited without a checksum mismatch), so create the row
-- here. INSERT OR IGNORE is a no-op if a row already exists; the follow-up
-- UPDATE backfills any columns an older partial row left NULL. Idempotent.

INSERT OR IGNORE INTO settings (
  id, ai_mode, provider, default_model, economy_model,
  auto_export_on_apply, auto_export_format, export_dir,
  ui_language, default_doc_language, geo_scope
) VALUES (
  1, 'api', 'claude', 'claude-opus-4-8', 'claude-haiku-4-5',
  0, 'pdf', '',
  'en', 'en', 'eu'
);

UPDATE settings SET
  ai_mode       = COALESCE(ai_mode, 'api'),
  provider      = COALESCE(provider, 'claude'),
  default_model = COALESCE(default_model, 'claude-opus-4-8'),
  economy_model = COALESCE(economy_model, 'claude-haiku-4-5'),
  export_dir    = COALESCE(export_dir, '')
WHERE id = 1;
