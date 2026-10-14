//! Document library workflow. SQL is `persistence`, CV/photo parsing is
//! `files`, and DOCX/PDF byte generation is `export`. Tauri adapters stay in
//! `commands::documents`, `commands::documents_import`, and
//! `commands::documents_export`.

mod blocks;
mod export;
mod files;
mod persistence;
pub(crate) mod style;

pub(crate) use export::{export_cover_letter_bytes, export_cv_bytes};
pub(crate) use files::{read_cv_file, read_cv_photo, CvImportFile};
pub(crate) use persistence::{
    commit, delete, get, list, list_templates, upsert, upsert_template, CvTemplate,
    DocumentLibraryItem, UpsertCvTemplateInput, UpsertDocumentLibraryItemInput,
};
