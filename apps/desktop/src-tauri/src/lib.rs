mod ai;
mod commands;
mod db;
mod files;
mod keys;

use tauri::Manager;

use crate::db::Db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            // Auto-updater is desktop-only; the JS side drives the
            // check/prompt/download/install flow (see updater.service.ts).
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Open the local SQLite DB in the OS app-data directory and run
            // migrations before any command can be invoked.
            let app_data_dir = app.path().app_data_dir().expect("resolve app data dir");
            let db = tauri::async_runtime::block_on(Db::init(&app_data_dir))
                .expect("initialize database");
            app.manage(db);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::profile::db_get_profile,
            commands::profile::db_upsert_profile,
            commands::profile::hash_text,
            commands::archetypes::check_archetype_match,
            commands::scoring::job_paste,
            commands::scoring::score_cache_get,
            commands::scoring::score_cache_save,
            commands::settings::db_get_settings,
            commands::settings::db_update_settings,
            commands::jobs::db_list_jobs,
            commands::jobs::db_list_jobs_overview,
            commands::jobs::db_get_job,
            commands::jobs::db_upsert_job,
            commands::jobs::db_delete_job,
            commands::job_url::classify_job_url,
            commands::job_url::fetch_job_from_url,
            commands::tracker::db_tracker_rows,
            commands::tracker::export_report,
            commands::applications::db_list_applications,
            commands::applications::db_upsert_application,
            commands::applications::db_set_application_status,
            commands::applications::db_update_application_tracker_fields,
            commands::applications::set_application_priority,
            commands::applications::add_application_comment,
            commands::applications::list_application_comments,
            commands::interview::create_interview_stage,
            commands::interview::update_interview_stage,
            commands::interview::delete_interview_stage,
            commands::interview::list_interview_stages,
            commands::tailoring::tailoring_cache_get,
            commands::tailoring::tailoring_cache_save,
            commands::portal_answers::portal_answers_get,
            commands::portal_answers::portal_answers_save,
            commands::followup_drafts::followup_draft_get,
            commands::followup_drafts::followup_draft_save,
            commands::documents::cv_templates_list,
            commands::documents::document_library_list,
            commands::documents::document_library_get,
            commands::documents::document_library_upsert,
            commands::documents::document_library_delete,
            commands::documents::cv_template_upsert,
            commands::documents::cv_import_read_file,
            commands::documents::cv_photo_read_file,
            commands::documents::cv_document_export,
            commands::documents::cover_letter_document_export,
            commands::documents::check_style_safety,
            commands::health::health_check,
            commands::tailoring::generated_doc_get,
            commands::tailoring::export_docx,
            commands::tailoring::export_pdf,
            commands::applications::db_pipeline_cards,
            commands::tailoring::open_file,
            commands::tailoring::reveal_in_folder,
            commands::db_export,
            commands::import::import_read_file,
            commands::import::import_preview,
            commands::import::import_confirm,
            ai::ai_run,
            ai::skills::skill_render,
            keys::keys_set_provider_key,
            keys::keys_has_provider_key,
            keys::keys_delete_provider_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
