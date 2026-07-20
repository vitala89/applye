// Markdown skill-file loader. Every AI task's prompt lives in a versioned
// markdown skill bundled from `libs/skills`. A skill has YAML-ish frontmatter
// plus `[SYSTEM]` / `[USER]` sections; this loads it, parses the frontmatter,
// and interpolates `{{placeholders}}` from the runtime context, producing a
// ready system/user prompt pair for `ai_run`. No scoring logic here — just
// load + interpolate.

use serde::Serialize;
use std::collections::HashMap;

/// Bundled skills, compiled into the binary (offline-first). Add new skills here.
fn skill_source(name: &str) -> Option<&'static str> {
    match name {
        "ping" => Some(include_str!("../../../../../libs/skills/src/ping/ping.md")),
        "profile-compress" => Some(include_str!(
            "../../../../../libs/skills/src/profile-compress/profile-compress.md"
        )),
        "pitch" => Some(include_str!(
            "../../../../../libs/skills/src/pitch/pitch.md"
        )),
        "job-scoring" => Some(include_str!(
            "../../../../../libs/skills/src/job-scoring/job-scoring.md"
        )),
        "resume-tailoring" => Some(include_str!(
            "../../../../../libs/skills/src/resume-tailoring/resume-tailoring.md"
        )),
        "import-tracklist" => Some(include_str!(
            "../../../../../libs/skills/src/import-tracklist/import-tracklist.md"
        )),
        "portal-answers" => Some(include_str!(
            "../../../../../libs/skills/src/portal-answers/portal-answers.md"
        )),
        "followup" => Some(include_str!(
            "../../../../../libs/skills/src/followup/followup.md"
        )),
        "cv-import" => Some(include_str!(
            "../../../../../libs/skills/src/cv-import/cv-import.md"
        )),
        "onboarding-archetypes" => Some(include_str!(
            "../../../../../libs/skills/src/onboarding-archetypes/onboarding-archetypes.md"
        )),
        "cv-generate-baseline" => Some(include_str!(
            "../../../../../libs/skills/src/cv-generate-baseline/cv-generate-baseline.md"
        )),
        "cover-letter-generate" => Some(include_str!(
            "../../../../../libs/skills/src/cover-letter-generate/cover-letter-generate.md"
        )),
        "cover-letter-tailor" => Some(include_str!(
            "../../../../../libs/skills/src/cover-letter-tailor/cover-letter-tailor.md"
        )),
        "cv-gap-analysis" => Some(include_str!(
            "../../../../../libs/skills/src/cv-gap-analysis/cv-gap-analysis.md"
        )),
        "profile-import" => Some(include_str!(
            "../../../../../libs/skills/src/profile-import/profile-import.md"
        )),
        _ => None,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderedSkill {
    pub version: String,
    pub recommended_model: Option<String>,
    pub system_prompt: String,
    pub user_prompt: String,
}

pub fn render(name: &str, context: &HashMap<String, String>) -> Result<RenderedSkill, String> {
    let raw = skill_source(name).ok_or_else(|| format!("Unknown skill '{name}'"))?;
    let (front, body) = split_frontmatter(raw);
    let meta = parse_frontmatter(front);

    let (system, user) = split_sections(body)?;
    Ok(RenderedSkill {
        version: meta.get("version").cloned().unwrap_or_else(|| "0".into()),
        recommended_model: meta.get("recommended_model").cloned(),
        system_prompt: interpolate(system.trim(), context),
        user_prompt: interpolate(user.trim(), context),
    })
}

/// Splits a leading `---\n ... \n---` frontmatter block from the body.
fn split_frontmatter(raw: &str) -> (&str, &str) {
    let raw = raw.trim_start_matches('\u{feff}');
    if let Some(rest) = raw.strip_prefix("---\n") {
        if let Some(end) = rest.find("\n---") {
            let front = &rest[..end];
            let body = rest[end + 4..].trim_start_matches('\n');
            return (front, body);
        }
    }
    ("", raw)
}

fn parse_frontmatter(front: &str) -> HashMap<String, String> {
    front
        .lines()
        .filter_map(|line| {
            let (k, v) = line.split_once(':')?;
            Some((k.trim().to_string(), v.trim().to_string()))
        })
        .collect()
}

/// Splits the body into the text after `[SYSTEM]` and after `[USER]`.
fn split_sections(body: &str) -> Result<(&str, &str), String> {
    let sys_idx = body
        .find("[SYSTEM]")
        .ok_or_else(|| "skill missing [SYSTEM] section".to_string())?;
    let user_idx = body
        .find("[USER]")
        .ok_or_else(|| "skill missing [USER] section".to_string())?;
    if user_idx < sys_idx {
        return Err("skill [USER] must come after [SYSTEM]".to_string());
    }
    let system = &body[sys_idx + "[SYSTEM]".len()..user_idx];
    let user = &body[user_idx + "[USER]".len()..];
    Ok((system, user))
}

fn interpolate(template: &str, context: &HashMap<String, String>) -> String {
    let mut out = template.to_string();
    for (k, v) in context {
        out = out.replace(&format!("{{{{{k}}}}}"), v);
    }
    out
}

#[tauri::command]
pub fn skill_render(
    name: String,
    context: HashMap<String, String>,
) -> Result<RenderedSkill, String> {
    render(&name, &context)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    /// Pins the metadata contract on a real skill rather than a fixture: the
    /// frontmatter parser reads every line, including the folded
    /// `description:` block's continuation lines, and only the keys it knows
    /// are picked out. A continuation line that grew a `version:`-shaped
    /// prefix would quietly win.
    #[test]
    fn cv_import_frontmatter_survives_its_folded_description() {
        let r = render("cv-import", &ctx(&[("cv_text", "x"), ("language", "en")])).unwrap();
        assert_eq!(r.version, "1");
        assert_eq!(r.recommended_model.as_deref(), Some("claude-haiku-4-5"));
    }

    /// PDF text layers produced by macOS label a ligature glyph with an
    /// unrelated character, so "Software" arrives as "SoCware". The repair is a
    /// prompt rule; if it silently leaves the file, imports quietly regress.
    #[test]
    fn cv_import_carries_the_ligature_repair_rule_and_its_limits() {
        let r = render("cv-import", &ctx(&[("cv_text", "x"), ("language", "en")])).unwrap();
        assert!(r.system_prompt.contains("SoCware"));
        // The exceptions matter more than the rule: without them the model is
        // free to "repair" a token that was never damaged.
        for legit in ["C++", "ES6+", ".NET"] {
            assert!(
                r.system_prompt.contains(legit),
                "the never-repair list lost {legit}"
            );
        }
    }

    #[test]
    fn render_interpolates_every_placeholder() {
        let r = render(
            "cv-import",
            &ctx(&[("cv_text", "ACME CV"), ("language", "de")]),
        )
        .unwrap();
        assert!(r.user_prompt.contains("ACME CV"));
        assert!(r.user_prompt.contains("de"));
        assert!(
            !r.user_prompt.contains("{{"),
            "unreplaced placeholder left in the user prompt: {}",
            r.user_prompt
        );
    }

    #[test]
    fn every_registered_skill_renders() {
        for name in [
            "cv-import",
            "onboarding-archetypes",
            "cv-generate-baseline",
            "cover-letter-generate",
            "cover-letter-tailor",
            "cv-gap-analysis",
            "profile-import",
        ] {
            let r = render(name, &HashMap::new());
            assert!(r.is_ok(), "{name} failed to render: {:?}", r.err());
        }
    }

    #[test]
    fn unknown_skill_is_an_error_not_a_panic() {
        assert!(render("nope", &HashMap::new()).is_err());
    }
}
