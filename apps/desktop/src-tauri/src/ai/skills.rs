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
        "cv-generate-baseline" => Some(include_str!(
            "../../../../../libs/skills/src/cv-generate-baseline/cv-generate-baseline.md"
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
