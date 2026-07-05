// Documents library (ROADMAP §16): the live, editable CV / Cover-Letter
// library — distinct from `generated_docs`, which stays the export journal.
// `content_json` is a serialized JSON string whose shape is locked as a typed
// contract in `libs/core` (`CvContent` for `doc_type = 'cv'`,
// `CoverLetterContent` for `doc_type = 'cover_letter'`) so the 1b/1c UI
// modules build against a stable structure. This module (1a) only stores and
// returns it opaquely, same convention as other `*_json` columns in this
// codebase (e.g. `scoring_cache.dimensions_json`).
//
// `applications.cv_path` / `cover_letter_path` stay the frozen apply-time
// snapshot and are never touched here.

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CvTemplate {
    pub id: i64,
    pub name: Option<String>,
    pub region_tag: Option<String>,
    pub sections_json: Option<String>,
    pub include_photo: bool,
    pub include_birthdate: bool,
    pub include_marital_status: bool,
    pub is_builtin: bool,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DocumentLibraryItem {
    pub id: i64,
    pub doc_type: String,
    pub source: String,
    pub label: Option<String>,
    pub content_json: Option<String>,
    pub file_path: Option<String>,
    pub template_id: Option<i64>,
    pub style_json: Option<String>,
    pub region_tag: Option<String>,
    pub language: Option<String>,
    pub archetype_tag: Option<String>,
    pub is_default: bool,
    pub input_hash: Option<String>,
    pub model_used: Option<String>,
    pub tokens_input: Option<i64>,
    pub tokens_output: Option<i64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertDocumentLibraryItemInput {
    pub id: Option<i64>,
    pub doc_type: String,
    pub source: String,
    pub label: Option<String>,
    pub content_json: Option<String>,
    pub file_path: Option<String>,
    pub template_id: Option<i64>,
    pub style_json: Option<String>,
    pub region_tag: Option<String>,
    pub language: Option<String>,
    pub archetype_tag: Option<String>,
    pub is_default: Option<bool>,
    pub input_hash: Option<String>,
    pub model_used: Option<String>,
    pub tokens_input: Option<i64>,
    pub tokens_output: Option<i64>,
}

#[tauri::command]
pub async fn cv_templates_list(db: State<'_, Db>) -> Result<Vec<CvTemplate>, String> {
    cv_templates_list_core(&db.pool).await
}

async fn cv_templates_list_core(pool: &sqlx::SqlitePool) -> Result<Vec<CvTemplate>, String> {
    sqlx::query_as::<_, CvTemplate>("SELECT * FROM cv_templates ORDER BY is_builtin DESC, name ASC")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("cv_templates_list: {e}"))
}

#[tauri::command]
pub async fn document_library_list(
    doc_type: Option<String>,
    db: State<'_, Db>,
) -> Result<Vec<DocumentLibraryItem>, String> {
    document_library_list_core(doc_type, &db.pool).await
}

async fn document_library_list_core(
    doc_type: Option<String>,
    pool: &sqlx::SqlitePool,
) -> Result<Vec<DocumentLibraryItem>, String> {
    match doc_type {
        Some(doc_type) => sqlx::query_as::<_, DocumentLibraryItem>(
            "SELECT * FROM document_library WHERE doc_type = ? ORDER BY updated_at DESC",
        )
        .bind(doc_type)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("document_library_list: {e}")),
        None => sqlx::query_as::<_, DocumentLibraryItem>(
            "SELECT * FROM document_library ORDER BY updated_at DESC",
        )
        .fetch_all(pool)
        .await
        .map_err(|e| format!("document_library_list: {e}")),
    }
}

#[tauri::command]
pub async fn document_library_get(
    id: i64,
    db: State<'_, Db>,
) -> Result<Option<DocumentLibraryItem>, String> {
    document_library_get_core(id, &db.pool).await
}

async fn document_library_get_core(
    id: i64,
    pool: &sqlx::SqlitePool,
) -> Result<Option<DocumentLibraryItem>, String> {
    sqlx::query_as::<_, DocumentLibraryItem>("SELECT * FROM document_library WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("document_library_get: {e}"))
}

#[tauri::command]
pub async fn document_library_upsert(
    input: UpsertDocumentLibraryItemInput,
    db: State<'_, Db>,
) -> Result<DocumentLibraryItem, String> {
    document_library_upsert_core(input, &db.pool).await
}

async fn document_library_upsert_core(
    input: UpsertDocumentLibraryItemInput,
    pool: &sqlx::SqlitePool,
) -> Result<DocumentLibraryItem, String> {
    let is_default = input.is_default.unwrap_or(false);

    match input.id {
        Some(id) => sqlx::query_as::<_, DocumentLibraryItem>(
            "UPDATE document_library SET
               doc_type       = ?,
               source         = ?,
               label          = ?,
               content_json   = ?,
               file_path      = ?,
               template_id    = ?,
               style_json     = ?,
               region_tag     = ?,
               language       = ?,
               archetype_tag  = ?,
               is_default     = ?,
               input_hash     = ?,
               model_used     = ?,
               tokens_input   = ?,
               tokens_output  = ?,
               updated_at     = datetime('now')
             WHERE id = ?
             RETURNING *",
        )
        .bind(input.doc_type)
        .bind(input.source)
        .bind(input.label)
        .bind(input.content_json)
        .bind(input.file_path)
        .bind(input.template_id)
        .bind(input.style_json)
        .bind(input.region_tag)
        .bind(input.language)
        .bind(input.archetype_tag)
        .bind(is_default)
        .bind(input.input_hash)
        .bind(input.model_used)
        .bind(input.tokens_input)
        .bind(input.tokens_output)
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("document_library_upsert (update): {e}")),
        None => sqlx::query_as::<_, DocumentLibraryItem>(
            "INSERT INTO document_library
               (doc_type, source, label, content_json, file_path, template_id,
                style_json, region_tag, language, archetype_tag, is_default,
                input_hash, model_used, tokens_input, tokens_output,
                created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
             RETURNING *",
        )
        .bind(input.doc_type)
        .bind(input.source)
        .bind(input.label)
        .bind(input.content_json)
        .bind(input.file_path)
        .bind(input.template_id)
        .bind(input.style_json)
        .bind(input.region_tag)
        .bind(input.language)
        .bind(input.archetype_tag)
        .bind(is_default)
        .bind(input.input_hash)
        .bind(input.model_used)
        .bind(input.tokens_input)
        .bind(input.tokens_output)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("document_library_upsert (insert): {e}")),
    }
}

#[tauri::command]
pub async fn document_library_delete(id: i64, db: State<'_, Db>) -> Result<(), String> {
    document_library_delete_core(id, &db.pool).await
}

async fn document_library_delete_core(id: i64, pool: &sqlx::SqlitePool) -> Result<(), String> {
    sqlx::query("DELETE FROM document_library WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("document_library_delete: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::SqlitePool;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .expect("open in-memory sqlite");
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("run migrations");
        pool
    }

    /// The five built-in templates seeded by the migration round-trip through
    /// the list command.
    #[tokio::test]
    async fn builtin_cv_templates_are_seeded_and_listed() {
        let pool = test_pool().await;
        let templates = cv_templates_list_core(&pool).await.expect("list");
        assert_eq!(templates.len(), 5);
        assert!(templates.iter().all(|t| t.is_builtin));
        assert!(templates
            .iter()
            .any(|t| t.name.as_deref() == Some("DE-traditional")));
    }

    fn cv_input(template_id: i64) -> UpsertDocumentLibraryItemInput {
        UpsertDocumentLibraryItemInput {
            id: None,
            doc_type: "cv".to_string(),
            source: "generated".to_string(),
            label: Some("DE baseline CV".to_string()),
            content_json: Some(r#"{"sections":[]}"#.to_string()),
            file_path: None,
            template_id: Some(template_id),
            style_json: None,
            region_tag: Some("de".to_string()),
            language: Some("de".to_string()),
            archetype_tag: None,
            is_default: Some(true),
            input_hash: Some("hash-1".to_string()),
            model_used: Some("claude-sonnet-5".to_string()),
            tokens_input: Some(500),
            tokens_output: Some(300),
        }
    }

    /// Insert then read back a `document_library` row — the round-trip
    /// required by the 1a acceptance criteria.
    #[tokio::test]
    async fn document_library_insert_and_read_round_trip() {
        let pool = test_pool().await;
        let templates = cv_templates_list_core(&pool).await.expect("list templates");
        let template_id = templates[0].id;

        let created = document_library_upsert_core(cv_input(template_id), &pool)
            .await
            .expect("insert");
        assert_eq!(created.doc_type, "cv");
        assert!(created.is_default);

        let fetched = document_library_get_core(created.id, &pool)
            .await
            .expect("get")
            .expect("row exists");
        assert_eq!(fetched.label.as_deref(), Some("DE baseline CV"));
        assert_eq!(fetched.template_id, Some(template_id));
    }

    /// Upserting with an existing id updates in place rather than inserting a
    /// second row.
    #[tokio::test]
    async fn document_library_upsert_with_id_updates_existing_row() {
        let pool = test_pool().await;
        let templates = cv_templates_list_core(&pool).await.expect("list templates");
        let template_id = templates[0].id;

        let created = document_library_upsert_core(cv_input(template_id), &pool)
            .await
            .expect("insert");

        let mut update = cv_input(template_id);
        update.id = Some(created.id);
        update.label = Some("Renamed CV".to_string());

        let updated = document_library_upsert_core(update, &pool)
            .await
            .expect("update");
        assert_eq!(updated.id, created.id);
        assert_eq!(updated.label.as_deref(), Some("Renamed CV"));

        let all = document_library_list_core(Some("cv".to_string()), &pool)
            .await
            .expect("list");
        assert_eq!(all.len(), 1);
    }

    /// Deleting removes the row and a subsequent get returns None.
    #[tokio::test]
    async fn document_library_delete_removes_row() {
        let pool = test_pool().await;
        let templates = cv_templates_list_core(&pool).await.expect("list templates");
        let template_id = templates[0].id;

        let created = document_library_upsert_core(cv_input(template_id), &pool)
            .await
            .expect("insert");

        document_library_delete_core(created.id, &pool)
            .await
            .expect("delete");

        let gone = document_library_get_core(created.id, &pool)
            .await
            .expect("get");
        assert!(gone.is_none());
    }

    /// Existing `applications` rows survive the additive migration, and the
    /// new FK columns default to NULL (frozen snapshot columns untouched).
    #[tokio::test]
    async fn applications_table_gets_nullable_document_fk_columns() {
        let pool = test_pool().await;
        let job_id = sqlx::query_scalar::<_, i64>(
            "INSERT INTO jobs (company, title, jd_text, jd_hash, created_at) VALUES ('Acme', 'Engineer', 'jd', 'hash1', datetime('now')) RETURNING id",
        )
        .fetch_one(&pool)
        .await
        .expect("insert job");

        let app = sqlx::query_as::<_, (Option<i64>, Option<i64>, Option<String>)>(
            "INSERT INTO applications (job_id, status, doc_language, updated_at)
             VALUES (?, 'saved', 'en', datetime('now'))
             RETURNING cv_document_id, cover_letter_document_id, cv_path",
        )
        .bind(job_id)
        .fetch_one(&pool)
        .await
        .expect("insert application");

        assert_eq!(app.0, None);
        assert_eq!(app.1, None);
        assert_eq!(app.2, None);
    }
}
