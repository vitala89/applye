-- 0014_cv_themes.sql
-- CV visual themes (design spec 2026-07-12). Additive: a themes table plus a
-- nullable theme_id on document_library. Absent theme_id → Classic (id 1),
-- so existing documents are unchanged. descriptor_json holds the pure-data
-- CvThemeDescriptor; built-ins mirror the libs/core constants. User-uploaded
-- and marketplace themes will reuse this table with is_builtin = 0.

CREATE TABLE IF NOT EXISTS cv_themes (
    id              INTEGER PRIMARY KEY,
    name            TEXT NOT NULL,
    is_builtin      INTEGER DEFAULT 0,
    descriptor_json TEXT NOT NULL,
    version         INTEGER DEFAULT 1,
    created_at      TEXT
);

ALTER TABLE document_library ADD COLUMN theme_id INTEGER REFERENCES cv_themes(id);

INSERT OR IGNORE INTO cv_themes (id, name, is_builtin, descriptor_json, version, created_at) VALUES
    (1, 'Classic', 1, '{"id":1,"name":"Classic","version":1,"tokens":{"accentHex":"#333333","mutedHex":"#666666","fontFamily":"Calibri","baseSizePt":11,"fontWeight":400},"header":{"titleColor":"text","contactLayout":"stacked","ruleWeightPt":0,"ruleColor":"none"},"sectionHeader":{"case":"upper","color":"text","ruleWeightPt":0,"ruleColor":"none"},"entry":{"companyColor":"text","roleItalic":false,"showIndustry":false,"ruleWeightPt":0,"ruleColor":"none"},"bullets":{"marker":"disc"}}', 1, datetime('now')),
    (2, 'Aurora', 1, '{"id":2,"name":"Aurora","version":1,"tokens":{"accentHex":"#1B7464","mutedHex":"#666666","fontFamily":"Lato","baseSizePt":10,"fontWeight":400},"header":{"titleColor":"accent","contactLayout":"inline-pipe","ruleWeightPt":0.8,"ruleColor":"accent"},"sectionHeader":{"case":"upper","color":"accent","ruleWeightPt":0.8,"ruleColor":"accent"},"entry":{"companyColor":"accent","roleItalic":true,"showIndustry":true,"ruleWeightPt":0.4,"ruleColor":"muted"},"bullets":{"marker":"textbullet"}}', 1, datetime('now'));
