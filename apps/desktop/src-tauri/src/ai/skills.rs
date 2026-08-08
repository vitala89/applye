// Markdown skill-file loader. Every AI task's prompt lives in a versioned
// markdown skill bundled from `libs/skills`. A skill has YAML-ish frontmatter
// plus `[SYSTEM]` / `[USER]` sections; this loads it, parses the frontmatter,
// and interpolates `{{placeholders}}` from the runtime context, producing a
// ready system/user prompt pair for `ai_run`. No scoring logic here - just
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
        "interview-hr" => Some(include_str!(
            "../../../../../libs/skills/src/interview-hr/interview-hr.md"
        )),
        "interview-technical" => Some(include_str!(
            "../../../../../libs/skills/src/interview-technical/interview-technical.md"
        )),
        "star-r" => Some(include_str!(
            "../../../../../libs/skills/src/star-r/star-r.md"
        )),
        "job-identify" => Some(include_str!(
            "../../../../../libs/skills/src/job-identify/job-identify.md"
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

    /// The availability answers a German posting asks for reach the prompt,
    /// and an unanswered one leaves no placeholder behind - the letter must
    /// stay silent about it rather than print `{{salary_expectation}}`.
    #[test]
    fn cover_letter_carries_availability_and_salary() {
        let r = render(
            "cover-letter-generate",
            &ctx(&[
                ("profile_md", "Jane Doe"),
                ("job_description", "Frontend"),
                ("language", "de"),
                ("section", "all"),
                ("tone", "Formal"),
                ("length", "Standard"),
                ("earliest_start", "01.10.2026"),
                ("salary_expectation", ""),
                ("notice_period", "3 Monate zum Quartalsende"),
            ]),
        )
        .unwrap();
        let prompt = format!("{}{}", r.system_prompt, r.user_prompt);
        assert!(prompt.contains("01.10.2026"));
        assert!(prompt.contains("3 Monate zum Quartalsende"));
        assert!(
            !prompt.contains("{{"),
            "unreplaced placeholder left in the prompt: {prompt}"
        );
    }

    /// A shorthand salary reached the letter with its magnitude gone: an input
    /// of "85k - 110k" produced "My salary expectation is 85 - 110 EUR per
    /// year", which reads to an employer as 85 euros. The model was following
    /// the rule it had - "use the values exactly as given" - so the fix is a
    /// narrow, explicitly-scoped exception for salary alone.
    ///
    /// The output itself needs a live model, so what is pinned here is the
    /// instruction that produces it: the shorthand reaches the prompt, and the
    /// prompt carries both the expansion rule and its boundary. Without the
    /// boundary in the text, nothing stops the model "helpfully" rewriting a
    /// date the same way.
    #[test]
    fn cover_letter_expands_an_abbreviated_salary_but_nothing_else() {
        let r = render(
            "cover-letter-generate",
            &ctx(&[
                ("profile_md", "Jane Doe"),
                ("job_description", "Frontend"),
                ("language", "en"),
                ("section", "all"),
                ("tone", "Formal"),
                ("length", "Standard"),
                ("earliest_start", "01.10.2026"),
                ("salary_expectation", "85k - 110k"),
                ("notice_period", ""),
            ]),
        )
        .unwrap();
        let prompt = format!("{}{}", r.system_prompt, r.user_prompt);

        // The value reaches the model unaltered - the app does not pre-format it.
        assert!(prompt.contains("85k - 110k"), "salary missing: {prompt}");
        // The expansion rule, and the example that names the actual failure.
        assert!(
            prompt.contains("85.000") && prompt.contains("NEVER drop the magnitude"),
            "salary expansion rule missing: {prompt}"
        );
        // Its boundary: the exception must not generalise to dates.
        assert!(
            prompt.contains("salary_expectation ONLY"),
            "salary exception is not scoped, so it can eat the date rule: {prompt}"
        );
        assert!(
            !prompt.contains("{{"),
            "unreplaced placeholder left in the prompt: {prompt}"
        );
    }

    /// The posting that defines the problem: the employer is "a partner
    /// company", unnamed, while `Jobgether` - the matching platform - appears
    /// throughout. A model that names it produces a cover letter opening "I am
    /// excited to apply to Jobgether", confidently and in the user's name.
    ///
    /// The verdict itself needs a live model, so what is pinned here is the
    /// instruction that produces it: the posting reaches the prompt, and the
    /// prompt tells the model that a platform is not the employer and that a
    /// posting listed on behalf of an unnamed partner has no company. Without
    /// those two rules in the text, nothing stops the wrong answer.
    #[test]
    fn job_identify_forbids_naming_the_platform_as_the_employer() {
        let posting = "This position is listed on behalf of a partner company, who \
manages all applications and next steps. Our partner is looking for an \
AI-Native Software Developer based in Germany. Jobgether matches you to it.";
        let r = render("job-identify", &ctx(&[("job_description", posting)])).unwrap();
        let prompt = format!("{}{}", r.system_prompt, r.user_prompt);

        assert!(
            prompt.contains("Jobgether"),
            "the posting must reach the prompt"
        );
        for rule in [
            "not the job board",
            "not the matching platform",
            "not the recruiting",
            "on behalf of a partner",
            "Not naming a company is a correct answer",
        ] {
            assert!(prompt.contains(rule), "the prompt lost the rule: {rule}");
        }
    }

    /// The other half of the same skill: a title stated in prose is in scope,
    /// and the answer is the role as a CV would write it rather than the
    /// sentence it was lifted from.
    #[test]
    fn job_identify_asks_for_a_title_drawn_from_prose() {
        let r = render("job-identify", &ctx(&[("job_description", "x")])).unwrap();
        assert!(r.system_prompt.contains("mid-sentence in prose"));
        assert!(r
            .system_prompt
            .contains("as a person would write it on a CV"));
        // Null is a first-class answer for both fields, or the model fills the
        // gap with the nearest proper noun it can see.
        assert!(r.system_prompt.contains("Both may be null."));
    }

    /// The cheap tier, as `ping` uses: one posting in, two short strings out.
    #[test]
    fn job_identify_runs_on_the_economy_model() {
        let r = render("job-identify", &ctx(&[("job_description", "x")])).unwrap();
        assert_eq!(r.recommended_model.as_deref(), Some("claude-haiku-4-5"));
    }

    #[test]
    fn every_registered_skill_renders() {
        for name in [
            "cv-import",
            "job-identify",
            "onboarding-archetypes",
            "cv-generate-baseline",
            "cover-letter-generate",
            "cover-letter-tailor",
            "cv-gap-analysis",
            "profile-import",
            "interview-hr",
            "interview-technical",
            "star-r",
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
