//! Tauri IPC adapter for legal job-URL classification and fetch.

use crate::jobs::url::{FetchedJob, UrlClassification};

#[tauri::command]
pub fn classify_job_url(url: String) -> UrlClassification {
    crate::jobs::url::classify_job_url(url)
}

#[tauri::command]
pub async fn fetch_job_from_url(url: String) -> Result<FetchedJob, String> {
    crate::jobs::url::fetch_job_from_url(url).await
}
