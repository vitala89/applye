// Documents library (ROADMAP §16): the live, editable CV / Cover-Letter
// library - distinct from `generated_docs`, which stays the export journal.
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
    pub theme_id: Option<i64>,
    pub style_json: Option<String>,
    pub region_tag: Option<String>,
    pub language: Option<String>,
    pub archetype_tag: Option<String>,
    pub is_default: bool,
    /// True while this row is an uncommitted apply-wizard draft. Drafts are
    /// hidden from every library list until committed at Export & Apply.
    pub is_application_draft: bool,
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
    pub theme_id: Option<i64>,
    pub style_json: Option<String>,
    pub region_tag: Option<String>,
    pub language: Option<String>,
    pub archetype_tag: Option<String>,
    pub is_default: Option<bool>,
    /// `Some(true)` marks a new/regenerated apply-wizard draft; `None` leaves an
    /// existing row's draft flag untouched (the document editor saves without
    /// this field, so a Review edit must never un-draft the row).
    pub is_application_draft: Option<bool>,
    pub input_hash: Option<String>,
    pub model_used: Option<String>,
    pub tokens_input: Option<i64>,
    pub tokens_output: Option<i64>,
}

#[tauri::command]
pub async fn cv_templates_list(db: State<'_, Db>) -> Result<Vec<CvTemplate>, String> {
    cv_templates_list_core(&db.pool).await
}

pub(super) async fn cv_templates_list_core(
    pool: &sqlx::SqlitePool,
) -> Result<Vec<CvTemplate>, String> {
    sqlx::query_as::<_, CvTemplate>("SELECT * FROM cv_templates ORDER BY is_builtin DESC, name ASC")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("cv_templates_list: {e}"))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertCvTemplateInput {
    pub id: Option<i64>,
    pub name: String,
    pub region_tag: Option<String>,
    /// Ordered list of `CvSectionKey` values, JSON-encoded (e.g. from the
    /// constructor's current section order).
    pub sections_json: String,
    pub include_photo: bool,
    pub include_birthdate: bool,
    pub include_marital_status: bool,
}

/// Saves a constructor arrangement as a named custom template. Always
/// `is_builtin = 0` - the five seeded presets are the only builtins and are
/// never touched here.
#[tauri::command]
pub async fn cv_template_upsert(
    input: UpsertCvTemplateInput,
    db: State<'_, Db>,
) -> Result<CvTemplate, String> {
    cv_template_upsert_core(input, &db.pool).await
}

async fn cv_template_upsert_core(
    input: UpsertCvTemplateInput,
    pool: &sqlx::SqlitePool,
) -> Result<CvTemplate, String> {
    match input.id {
        Some(id) => sqlx::query_as::<_, CvTemplate>(
            "UPDATE cv_templates SET
               name = ?, region_tag = ?, sections_json = ?,
               include_photo = ?, include_birthdate = ?, include_marital_status = ?
             WHERE id = ? AND is_builtin = 0
             RETURNING *",
        )
        .bind(input.name)
        .bind(input.region_tag)
        .bind(input.sections_json)
        .bind(input.include_photo)
        .bind(input.include_birthdate)
        .bind(input.include_marital_status)
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("cv_template_upsert (update): {e}")),
        None => sqlx::query_as::<_, CvTemplate>(
            "INSERT INTO cv_templates
               (name, region_tag, sections_json, include_photo, include_birthdate,
                include_marital_status, is_builtin, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))
             RETURNING *",
        )
        .bind(input.name)
        .bind(input.region_tag)
        .bind(input.sections_json)
        .bind(input.include_photo)
        .bind(input.include_birthdate)
        .bind(input.include_marital_status)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("cv_template_upsert (insert): {e}")),
    }
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
        // Uncommitted apply-wizard drafts (is_application_draft = 1) are hidden
        // from every library list until committed at Export & Apply; Review /
        // editor / export fetch them by id via document_library_get, unfiltered.
        Some(doc_type) => sqlx::query_as::<_, DocumentLibraryItem>(
            "SELECT * FROM document_library
             WHERE doc_type = ? AND is_application_draft = 0
             ORDER BY updated_at DESC",
        )
        .bind(doc_type)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("document_library_list: {e}")),
        None => sqlx::query_as::<_, DocumentLibraryItem>(
            "SELECT * FROM document_library
             WHERE is_application_draft = 0
             ORDER BY updated_at DESC",
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

pub(crate) async fn document_library_get_core(
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

pub(super) async fn document_library_upsert_core(
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
               theme_id       = ?,
               style_json     = ?,
               region_tag     = ?,
               language       = ?,
               archetype_tag  = ?,
               is_default     = ?,
               is_application_draft = COALESCE(?, is_application_draft),
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
        .bind(input.theme_id)
        .bind(input.style_json)
        .bind(input.region_tag)
        .bind(input.language)
        .bind(input.archetype_tag)
        .bind(is_default)
        .bind(input.is_application_draft)
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
                theme_id, style_json, region_tag, language, archetype_tag, is_default,
                is_application_draft, input_hash, model_used, tokens_input, tokens_output,
                created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
             RETURNING *",
        )
        .bind(input.doc_type)
        .bind(input.source)
        .bind(input.label)
        .bind(input.content_json)
        .bind(input.file_path)
        .bind(input.template_id)
        .bind(input.theme_id)
        .bind(input.style_json)
        .bind(input.region_tag)
        .bind(input.language)
        .bind(input.archetype_tag)
        .bind(is_default)
        .bind(input.is_application_draft.unwrap_or(false))
        .bind(input.input_hash)
        .bind(input.model_used)
        .bind(input.tokens_input)
        .bind(input.tokens_output)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("document_library_upsert (insert): {e}")),
    }
}

/// Clears the apply-wizard draft flag on a document, turning it into a normal
/// library entry that shows up in the Documents list. Called at Export & Apply
/// (export success / mark applied) - the moment the user commits to the doc.
#[tauri::command]
pub async fn document_library_commit(
    id: i64,
    db: State<'_, Db>,
) -> Result<Option<DocumentLibraryItem>, String> {
    document_library_commit_core(id, &db.pool).await
}

pub(crate) async fn document_library_commit_core(
    id: i64,
    pool: &sqlx::SqlitePool,
) -> Result<Option<DocumentLibraryItem>, String> {
    sqlx::query_as::<_, DocumentLibraryItem>(
        "UPDATE document_library
         SET is_application_draft = 0, updated_at = datetime('now')
         WHERE id = ?
         RETURNING *",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("document_library_commit: {e}"))
}

#[tauri::command]
pub async fn document_library_delete(id: i64, db: State<'_, Db>) -> Result<(), String> {
    document_library_delete_core(id, &db.pool).await
}

async fn document_library_delete_core(id: i64, pool: &sqlx::SqlitePool) -> Result<(), String> {
    // Clear the references first. `db_upsert_application` COALESCEs the two
    // document ids (so an ordinary save cannot drop a link), which means the
    // frontend has no way to unlink; without this, deleting a linked document
    // leaves the application pointing at a row that no longer exists.
    sqlx::query(
        "UPDATE applications
            SET cv_document_id = CASE WHEN cv_document_id = ? THEN NULL ELSE cv_document_id END,
                cover_letter_document_id = CASE WHEN cover_letter_document_id = ? THEN NULL
                                                ELSE cover_letter_document_id END
          WHERE cv_document_id = ? OR cover_letter_document_id = ?",
    )
    .bind(id)
    .bind(id)
    .bind(id)
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| format!("document_library_delete (unlink): {e}"))?;

    sqlx::query("DELETE FROM document_library WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("document_library_delete: {e}"))?;
    Ok(())
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::SqlitePool;

    pub(crate) async fn test_pool() -> SqlitePool {
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

    /// Like `test_pool`, but with foreign keys actually enforced.
    ///
    /// `test_pool` does not turn them on, and SQLite defaults them **off**, so
    /// no test using it can observe a foreign-key violation - while the real
    /// pool is built with `.foreign_keys(true)`. That gap is why the bug below
    /// reached a user: the tests could not see the constraint that broke.
    async fn test_pool_with_foreign_keys() -> SqlitePool {
        use sqlx::sqlite::SqliteConnectOptions;
        use std::str::FromStr;

        // Built the same way the real pool is, in `db.rs`.
        let options = SqliteConnectOptions::from_str("sqlite::memory:")
            .expect("parse connection url")
            .foreign_keys(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .expect("open in-memory sqlite");
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("run migrations");
        pool
    }

    /// Runs the repair migration's own SQL, verbatim.
    async fn run_repair(pool: &SqlitePool) {
        sqlx::raw_sql(include_str!(
            "../../migrations/0029_reseed_builtin_cv_lookups.sql"
        ))
        .execute(pool)
        .await
        .expect("run the repair migration");
    }

    /// Both lookup counts in one read. Literal SQL on purpose: a `format!`ed
    /// table name trips sqlx's dynamic-query lint, and there is nothing dynamic
    /// worth expressing here.
    async fn lookup_counts(pool: &SqlitePool) -> (i64, i64) {
        sqlx::query_as::<_, (i64, i64)>(
            "SELECT (SELECT count(*) FROM cv_themes), (SELECT count(*) FROM cv_templates)",
        )
        .fetch_one(pool)
        .await
        .expect("lookup counts")
    }

    /// Reported by a user as `document_library_upsert (update): error returned
    /// from database: (code: 787) FOREIGN KEY constraint failed`, on every
    /// attempt to save an edited CV.
    ///
    /// `document_library.theme_id` is a foreign key into `cv_themes`, and the
    /// CV editor always saves a theme - its picker defaults to Classic, id 1.
    /// On a database whose `cv_themes` is empty, that makes **every** CV save
    /// fail, permanently, with a raw SQLite error the user cannot act on. The
    /// same shape applies to `template_id` and `cv_templates`.
    ///
    /// This drives the real failure first, then the repair migration's own SQL,
    /// which is what an affected install runs on next launch.
    #[tokio::test]
    async fn an_emptied_theme_table_breaks_every_cv_save_until_the_repair_runs() {
        let pool = test_pool_with_foreign_keys().await;
        let template_id = cv_templates_list_core(&pool).await.expect("list")[0].id;

        let created = document_library_upsert_core(cv_input(template_id), &pool)
            .await
            .expect("insert");

        // The state a user reported from: the built-in lookup rows are gone.
        sqlx::query("DELETE FROM document_library WHERE id <> ?")
            .bind(created.id)
            .execute(&pool)
            .await
            .expect("clear siblings");
        sqlx::query("UPDATE document_library SET template_id = NULL, theme_id = NULL")
            .execute(&pool)
            .await
            .expect("detach lookups");
        sqlx::query("DELETE FROM cv_themes")
            .execute(&pool)
            .await
            .expect("empty themes");
        sqlx::query("DELETE FROM cv_templates")
            .execute(&pool)
            .await
            .expect("empty templates");

        // What the editor's save does: write the default theme, id 1.
        let save = || {
            sqlx::query("UPDATE document_library SET theme_id = 1 WHERE id = ?").bind(created.id)
        };
        let before = save().execute(&pool).await;
        assert!(
            before.is_err(),
            "the save has to fail here, or this test is not exercising the constraint"
        );

        // The repair migration, run as a whole script - the way the migrator
        // runs it, rather than a hand-split approximation of it.
        run_repair(&pool).await;

        assert_eq!(lookup_counts(&pool).await, (2, 5));
        save().execute(&pool).await.expect("the save now succeeds");
    }

    /// The repair must be a no-op on a healthy database - it ships to every
    /// install, not only broken ones, and duplicated built-ins would show up as
    /// duplicate entries in the template picker.
    #[tokio::test]
    async fn the_repair_adds_nothing_to_a_database_that_is_already_seeded() {
        let pool = test_pool_with_foreign_keys().await;

        for _ in 0..3 {
            run_repair(&pool).await;
        }

        assert_eq!(lookup_counts(&pool).await, (2, 5));
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

    /// Migration 0013 backfills `personal_details` into the built-in
    /// templates that 0011 seeded without it (DE-ATS-modern/US/UK/generic),
    /// so every generated CV has a name section. DE-traditional was already
    /// correct and must be left untouched (photo still first).
    #[tokio::test]
    async fn migration_0013_adds_personal_details_to_builtin_templates() {
        let pool = test_pool().await;
        let rows: Vec<(String, String)> =
            sqlx::query_as("SELECT name, sections_json FROM cv_templates WHERE is_builtin = 1")
                .fetch_all(&pool)
                .await
                .unwrap();
        for (name, sections) in &rows {
            assert!(
                sections.contains("personal_details"),
                "built-in template {name} still lacks personal_details: {sections}"
            );
        }
        for name in ["US", "UK", "generic", "DE-ATS-modern"] {
            let (_, sections) = rows.iter().find(|(n, _)| n == name).unwrap();
            assert!(
                sections.starts_with("[\"personal_details\""),
                "built-in template {name} does not have personal_details first: {sections}"
            );
        }
        let de_trad = rows.iter().find(|(n, _)| n == "DE-traditional").unwrap();
        assert!(de_trad.1.starts_with("[\"photo\""));
    }

    /// Deleting a linked document must not leave an application pointing at a
    /// row that no longer exists. The frontend cannot fix this itself:
    /// `db_upsert_application` COALESCEs both document ids, so it can set a
    /// link but never clear one.
    #[tokio::test]
    async fn document_library_delete_unlinks_the_application_that_referenced_it() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO jobs (id, jd_text, jd_hash) VALUES (1, 'jd', 'h1')")
            .execute(&pool)
            .await
            .unwrap();
        let templates = cv_templates_list_core(&pool).await.expect("list templates");
        let cv = document_library_upsert_core(cv_input(templates[0].id), &pool)
            .await
            .expect("insert cv");
        let letter = document_library_upsert_core(
            UpsertDocumentLibraryItemInput {
                doc_type: "cover_letter".to_string(),
                ..cv_input(templates[0].id)
            },
            &pool,
        )
        .await
        .expect("insert letter");
        sqlx::query(
            "INSERT INTO applications (id, job_id, status, cv_document_id, cover_letter_document_id)
             VALUES (1, 1, 'saved', ?, ?)",
        )
        .bind(cv.id)
        .bind(letter.id)
        .execute(&pool)
        .await
        .unwrap();

        document_library_delete_core(cv.id, &pool)
            .await
            .expect("delete cv");

        let (cv_ref, letter_ref): (Option<i64>, Option<i64>) = sqlx::query_as(
            "SELECT cv_document_id, cover_letter_document_id FROM applications WHERE id = 1",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(cv_ref, None, "the deleted CV link must be cleared");
        assert_eq!(
            letter_ref,
            Some(letter.id),
            "an unrelated document link must survive"
        );
    }

    pub(crate) fn cv_input(template_id: i64) -> UpsertDocumentLibraryItemInput {
        UpsertDocumentLibraryItemInput {
            id: None,
            doc_type: "cv".to_string(),
            source: "generated".to_string(),
            label: Some("DE baseline CV".to_string()),
            content_json: Some(r#"{"sections":[]}"#.to_string()),
            file_path: None,
            template_id: Some(template_id),
            theme_id: None,
            style_json: None,
            region_tag: Some("de".to_string()),
            language: Some("de".to_string()),
            archetype_tag: None,
            is_default: Some(true),
            is_application_draft: None,
            input_hash: Some("hash-1".to_string()),
            model_used: Some("claude-sonnet-5".to_string()),
            tokens_input: Some(500),
            tokens_output: Some(300),
        }
    }

    /// Insert then read back a `document_library` row - the round-trip
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

    /// An uncommitted apply-wizard draft is hidden from the library list but
    /// still fetchable by id (Review / editor / export path), and committing it
    /// makes it appear in the list.
    #[tokio::test]
    async fn document_library_draft_is_hidden_until_committed() {
        let pool = test_pool().await;
        let templates = cv_templates_list_core(&pool).await.expect("list templates");
        let mut input = cv_input(templates[0].id);
        input.is_application_draft = Some(true);

        let draft = document_library_upsert_core(input, &pool)
            .await
            .expect("insert draft");
        assert!(draft.is_application_draft);

        // Hidden from the list...
        let listed = document_library_list_core(Some("cv".to_string()), &pool)
            .await
            .expect("list");
        assert!(listed.is_empty(), "draft must not appear in library list");

        // ...but still fetchable by id (Review / export use this path).
        let fetched = document_library_get_core(draft.id, &pool)
            .await
            .expect("get")
            .expect("row exists");
        assert!(fetched.is_application_draft);

        // Committing clears the flag and surfaces it in the list.
        let committed = document_library_commit_core(draft.id, &pool)
            .await
            .expect("commit")
            .expect("row exists");
        assert!(!committed.is_application_draft);

        let listed = document_library_list_core(Some("cv".to_string()), &pool)
            .await
            .expect("list");
        assert_eq!(listed.len(), 1, "committed draft appears in library list");
    }

    /// Updating a draft without passing the flag (the document editor saving a
    /// Review edit) must not un-draft it - COALESCE preserves the flag.
    #[tokio::test]
    async fn document_library_update_preserves_draft_flag_when_omitted() {
        let pool = test_pool().await;
        let templates = cv_templates_list_core(&pool).await.expect("list templates");
        let mut input = cv_input(templates[0].id);
        input.is_application_draft = Some(true);
        let draft = document_library_upsert_core(input, &pool)
            .await
            .expect("insert draft");

        // Editor-style save: same row, no draft flag supplied.
        let mut edit = cv_input(templates[0].id);
        edit.id = Some(draft.id);
        edit.is_application_draft = None;
        edit.label = Some("Edited in review".to_string());
        let updated = document_library_upsert_core(edit, &pool)
            .await
            .expect("update");

        assert!(
            updated.is_application_draft,
            "omitting the flag must not un-draft the row"
        );
        assert_eq!(updated.label.as_deref(), Some("Edited in review"));
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

    fn custom_template_input(id: Option<i64>) -> UpsertCvTemplateInput {
        UpsertCvTemplateInput {
            id,
            name: "My arrangement".to_string(),
            region_tag: Some("de".to_string()),
            sections_json: r#"["summary","experience","skills"]"#.to_string(),
            include_photo: false,
            include_birthdate: false,
            include_marital_status: false,
        }
    }

    #[tokio::test]
    async fn cv_template_upsert_inserts_as_non_builtin() {
        let pool = test_pool().await;
        let created = cv_template_upsert_core(custom_template_input(None), &pool)
            .await
            .expect("insert custom template");
        assert!(!created.is_builtin);
        assert_eq!(created.name.as_deref(), Some("My arrangement"));

        let templates = cv_templates_list_core(&pool).await.expect("list");
        assert_eq!(templates.len(), 6);
    }

    #[tokio::test]
    async fn cv_template_upsert_with_id_updates_existing_custom_template() {
        let pool = test_pool().await;
        let created = cv_template_upsert_core(custom_template_input(None), &pool)
            .await
            .expect("insert");

        let mut update = custom_template_input(Some(created.id));
        update.name = "Renamed arrangement".to_string();
        let updated = cv_template_upsert_core(update, &pool)
            .await
            .expect("update");
        assert_eq!(updated.id, created.id);
        assert_eq!(updated.name.as_deref(), Some("Renamed arrangement"));

        let templates = cv_templates_list_core(&pool).await.expect("list");
        assert_eq!(templates.len(), 6);
    }

    #[tokio::test]
    async fn cv_template_upsert_cannot_overwrite_a_builtin_template() {
        let pool = test_pool().await;
        let builtin_id = cv_templates_list_core(&pool)
            .await
            .expect("list")
            .into_iter()
            .find(|t| t.is_builtin)
            .expect("a builtin exists")
            .id;

        let result = cv_template_upsert_core(custom_template_input(Some(builtin_id)), &pool).await;
        assert!(result.is_err());
    }
}
