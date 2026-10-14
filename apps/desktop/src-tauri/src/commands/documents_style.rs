//! Tauri IPC adapter for style and theme checks. The rules and types live in
//! `crate::documents::style`.

use crate::documents::style::StyleNote;

#[tauri::command]
pub fn check_style_safety(style_json: Option<String>) -> Vec<StyleNote> {
    crate::documents::style::check_style_safety(style_json)
}

#[tauri::command]
pub fn validate_theme(descriptor_json: Option<String>) -> Vec<StyleNote> {
    crate::documents::style::validate_theme(descriptor_json)
}
