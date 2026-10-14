//! Tauri IPC adapter for style and theme checks. The rules and types live in
//! `crate::tailoring::style`. The command names stay `check_style_safety` and
//! `validate_theme`.

use crate::tailoring::style::StyleNote;

#[tauri::command]
pub fn check_style_safety(style_json: Option<String>) -> Vec<StyleNote> {
    crate::tailoring::style::check_style_safety(style_json)
}

#[tauri::command]
pub fn validate_theme(descriptor_json: Option<String>) -> Vec<StyleNote> {
    crate::tailoring::style::validate_theme(descriptor_json)
}
