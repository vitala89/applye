//! Tauri IPC adapter for reading a user-picked CV or CV photo.
//! Parsing lives in `crate::documents`.

use crate::documents::CvImportFile;

#[tauri::command]
pub fn cv_import_read_file(path: String) -> Result<CvImportFile, String> {
    crate::documents::read_cv_file(&path)
}

#[tauri::command]
pub fn cv_photo_read_file(path: String) -> Result<String, String> {
    crate::documents::read_cv_photo(&path)
}
