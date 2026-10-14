//! Tauri IPC adapter for the live style check. The rules and types live in
//! `crate::tailoring::style`. `check_style_safety` stays registered because
//! Documents calls it. `validate_theme` stays a pure function in that module
//! for the future theme trust boundary and is not an IPC command.

use crate::tailoring::style::StyleNote;

#[tauri::command]
pub fn check_style_safety(style_json: Option<String>) -> Vec<StyleNote> {
    crate::tailoring::style::check_style_safety(style_json)
}
