// File system operations — documents, exports, profile.
// All paths relative to app data directory (Tauri-managed).
// Sandbox: mkdir before write; deny overrides allow in capabilities.
// TODO (Phase 1): implement document export (DOCX, PDF), profile read/write.

pub struct Files;

impl Files {
    // TODO (Phase 1): pub async fn export_docx(content: &str, path: &Path) -> anyhow::Result<()>
    // TODO (Phase 1): pub async fn export_pdf(content: &str, path: &Path) -> anyhow::Result<()>
    // TODO (Phase 1): pub async fn read_profile(data_dir: &Path) -> anyhow::Result<String>
    // TODO (Phase 1): pub async fn write_profile(data_dir: &Path, content: &str) -> anyhow::Result<()>
    //   Note: mkdir(data_dir) before any write — Tauri sandbox requires parent to exist.
}
