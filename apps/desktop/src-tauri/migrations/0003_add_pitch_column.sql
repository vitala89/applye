-- Add default pitch storage to the profile table.
-- pitch_md: AI-generated default self-introduction (60s spoken pitch).
-- Cached alongside scoring_json - regenerated only when scoring_hash changes.
ALTER TABLE profile ADD COLUMN pitch_md TEXT;
