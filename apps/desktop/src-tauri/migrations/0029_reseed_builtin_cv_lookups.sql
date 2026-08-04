-- 0029_reseed_builtin_cv_lookups.sql
-- Repair: put the built-in CV themes and templates back when they are missing.
--
-- `document_library.theme_id` is a real foreign key into `cv_themes`, and the
-- CV editor always saves a theme - the picker defaults to Classic, id 1. On a
-- database whose `cv_themes` row 1 is absent, that makes **every** CV save fail
-- with `FOREIGN KEY constraint failed`, permanently and with no way for the
-- user to act on it. The same holds for `template_id` into `cv_templates`.
--
-- Both tables are seeded by 0011 and 0014 and both are pure lookup mirrors of
-- constants that also live in `libs/core`, so re-inserting them is safe: this
-- migration is a no-op on any database that already has them. It does not
-- explain how a database can end up without them - that is unproven and worth
-- watching - it only makes the app able to recover instead of bricking its own
-- save path.
--
-- Idempotent by construction: themes carry explicit ids, so `INSERT OR IGNORE`
-- keys on them; templates are auto-numbered, so each row is guarded on its
-- name, which is what identifies a built-in.

INSERT OR IGNORE INTO cv_themes (id, name, is_builtin, descriptor_json, version, created_at) VALUES
    (1, 'Classic', 1, '{"id":1,"name":"Classic","version":1,"tokens":{"accentHex":"#333333","mutedHex":"#666666","fontFamily":"Calibri","baseSizePt":11,"fontWeight":400},"header":{"titleColor":"text","contactLayout":"stacked","ruleWeightPt":0,"ruleColor":"none"},"sectionHeader":{"case":"upper","color":"text","ruleWeightPt":0,"ruleColor":"none"},"entry":{"companyColor":"text","roleItalic":false,"showIndustry":false,"ruleWeightPt":0,"ruleColor":"none"},"bullets":{"marker":"disc"}}', 1, datetime('now')),
    (2, 'Aurora', 1, '{"id":2,"name":"Aurora","version":1,"tokens":{"accentHex":"#1B7464","mutedHex":"#666666","fontFamily":"Lato","baseSizePt":10,"fontWeight":400},"header":{"titleColor":"accent","contactLayout":"inline-pipe","ruleWeightPt":0.8,"ruleColor":"accent"},"sectionHeader":{"case":"upper","color":"accent","ruleWeightPt":0.8,"ruleColor":"accent"},"entry":{"companyColor":"accent","roleItalic":true,"showIndustry":true,"ruleWeightPt":0.4,"ruleColor":"muted"},"bullets":{"marker":"textbullet"}}', 1, datetime('now'));

INSERT INTO cv_templates
    (name, region_tag, sections_json, include_photo, include_birthdate, include_marital_status, is_builtin, created_at)
SELECT 'DE-traditional', 'de', '["photo","personal_details","summary","experience","education","skills","languages"]', 1, 1, 1, 1, datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM cv_templates WHERE name = 'DE-traditional');

INSERT INTO cv_templates
    (name, region_tag, sections_json, include_photo, include_birthdate, include_marital_status, is_builtin, created_at)
SELECT 'DE-ATS-modern', 'de', '["summary","experience","education","skills","languages"]', 0, 0, 0, 1, datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM cv_templates WHERE name = 'DE-ATS-modern');

INSERT INTO cv_templates
    (name, region_tag, sections_json, include_photo, include_birthdate, include_marital_status, is_builtin, created_at)
SELECT 'US', 'us', '["summary","experience","education","skills"]', 0, 0, 0, 1, datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM cv_templates WHERE name = 'US');

INSERT INTO cv_templates
    (name, region_tag, sections_json, include_photo, include_birthdate, include_marital_status, is_builtin, created_at)
SELECT 'UK', 'uk', '["summary","experience","education","skills"]', 0, 0, 0, 1, datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM cv_templates WHERE name = 'UK');

INSERT INTO cv_templates
    (name, region_tag, sections_json, include_photo, include_birthdate, include_marital_status, is_builtin, created_at)
SELECT 'generic', 'generic', '["summary","experience","education","skills"]', 0, 0, 0, 1, datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM cv_templates WHERE name = 'generic');
