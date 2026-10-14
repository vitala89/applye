//! Tauri IPC adapter for archetype keyword overlap.

#[tauri::command]
pub fn check_archetype_match(
    title: Option<String>,
    jd_text: String,
    archetypes_json: Option<String>,
) -> Result<bool, String> {
    crate::jobs::archetypes::check_archetype_match(title, jd_text, archetypes_json)
}
