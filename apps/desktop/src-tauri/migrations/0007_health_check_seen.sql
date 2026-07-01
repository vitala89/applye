-- Phase 6.7: first-launch health check. Persisted in SQLite (not
-- localStorage) so the "seen" flag survives a fresh window/profile and is
-- visible to the same diagnostics the health check itself reports on.
ALTER TABLE settings ADD COLUMN health_check_seen INTEGER DEFAULT 0;
