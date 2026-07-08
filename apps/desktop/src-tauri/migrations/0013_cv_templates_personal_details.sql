-- Built-in CV templates DE-ATS-modern / US / UK / generic were seeded (0011)
-- without `personal_details` in sections_json, so generated CVs had no name
-- section. Prepend it for the built-ins that lack it. Idempotent via the
-- NOT LIKE guard; never removes a section.
UPDATE cv_templates
SET sections_json = '["personal_details","summary","experience","education","skills","languages"]'
WHERE is_builtin = 1 AND name = 'DE-ATS-modern' AND sections_json NOT LIKE '%personal_details%';

UPDATE cv_templates
SET sections_json = json_insert(sections_json, '$[#]', 'personal_details')
WHERE is_builtin = 1 AND name IN ('US', 'UK', 'generic') AND sections_json NOT LIKE '%personal_details%';

-- The builder forces personal_details first regardless of position, so the
-- json_insert append above is sufficient for US/UK/generic; DE-ATS-modern is
-- set explicitly to keep its canonical order.
