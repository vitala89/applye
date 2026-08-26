mod ai;
mod commands;
mod db;
mod keys;
mod startup;

use tauri::Manager;

use crate::db::Db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Before the builder: Tauri runs `setup` inside macOS'
    // `applicationDidFinishLaunching`, where a panic aborts the process with no
    // message anywhere. See startup.rs for the full reasoning.
    startup::install_panic_hook();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            // Logging is registered first and in release builds too: without it
            // a failed launch leaves nothing on disk to read, which is how the
            // 0.29.x startup aborts stayed undiagnosable. Failing to register it
            // is not itself fatal - the panic hook still writes to its own file.
            if let Err(e) = app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .target(tauri_plugin_log::Target::new(
                        tauri_plugin_log::TargetKind::LogDir {
                            file_name: Some("Applye".into()),
                        },
                    ))
                    .target(tauri_plugin_log::Target::new(
                        tauri_plugin_log::TargetKind::Stdout,
                    ))
                    .build(),
            ) {
                eprintln!("could not register the log plugin: {e}");
            }

            // Auto-updater is desktop-only; the JS side drives the
            // check/prompt/download/install flow (see updater.service.ts).
            #[cfg(desktop)]
            if let Err(e) = app
                .handle()
                .plugin(tauri_plugin_updater::Builder::new().build())
            {
                startup::fail(
                    app.handle(),
                    "registering the updater plugin",
                    &e.to_string(),
                );
                return Ok(());
            }

            // Open the local SQLite DB in the OS app-data directory and run
            // migrations before any command can be invoked. Every failure below
            // ends the launch through startup::fail - never through a panic,
            // which macOS would turn into an abort and a reopen-windows loop.
            let app_data_dir = match app.path().app_data_dir() {
                Ok(dir) => dir,
                Err(e) => {
                    startup::fail(
                        app.handle(),
                        "resolving the application data directory",
                        &e.to_string(),
                    );
                    return Ok(());
                }
            };
            let db = match tauri::async_runtime::block_on(Db::init(&app_data_dir)) {
                Ok(db) => db,
                Err(e) => {
                    startup::fail(app.handle(), "opening the local database", &e);
                    return Ok(());
                }
            };
            app.manage(db);
            // Handshake channels for the silent WYSIWYG print windows.
            app.manage(commands::print::PrintReady::default());
            app.manage(commands::exported_paths::ExportedPaths::default());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::profile::db_get_profile,
            commands::profile::db_upsert_profile,
            commands::profile::db_set_profile_photo,
            commands::profile::hash_text,
            commands::archetypes::check_archetype_match,
            commands::ats::ats_check_run,
            commands::job_paste::job_paste,
            commands::job_identity_source::job_set_identity,
            commands::job_identity_source::job_skip_identity_prompt,
            commands::scoring::score_cache_get,
            commands::scoring::score_cache_latest,
            commands::scoring::score_cache_save,
            commands::settings::db_get_settings,
            commands::settings::db_update_settings,
            commands::settings::db_reset_all_data,
            commands::jobs::db_list_jobs,
            commands::jobs::db_list_jobs_overview,
            commands::jobs::db_get_job,
            commands::jobs::db_upsert_job,
            commands::jobs::db_delete_job,
            commands::job_url::classify_job_url,
            commands::job_url::fetch_job_from_url,
            commands::tracker::db_tracker_rows,
            commands::tracker::export_report,
            commands::tracker::db_set_application_archived,
            commands::tracker::tracker_custom_columns_list,
            commands::tracker::tracker_custom_column_add,
            commands::tracker::tracker_custom_column_remove,
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
            commands::interview::list_interview_prep,
            commands::interview::save_interview_prep_batch,
            commands::tailoring_journal::tailoring_cache_get,
            commands::tailoring_journal::tailoring_cache_save,
            commands::portal_answers::portal_answers_get,
            commands::portal_answers::portal_answers_save,
            commands::followup_drafts::followup_draft_get,
            commands::followup_drafts::followup_draft_save,
            commands::documents::cv_templates_list,
            commands::documents::document_library_list,
            commands::documents::document_library_get,
            commands::documents::document_library_upsert,
            commands::documents::document_library_commit,
            commands::documents::document_library_delete,
            commands::documents::cv_template_upsert,
            commands::documents_import::cv_import_read_file,
            commands::documents_import::cv_photo_read_file,
            commands::documents_export::cv_document_export,
            commands::documents_export::cover_letter_document_export,
            commands::print::cv_document_export_pdf_wysiwyg,
            commands::print::cover_letter_document_export_pdf_wysiwyg,
            commands::print::tracker_report_export_pdf_wysiwyg,
            commands::print::print_window_ready,
            commands::documents_style::check_style_safety,
            commands::documents_style::validate_theme,
            commands::health::health_check,
            commands::tailoring_journal::generated_doc_get,
            commands::tailoring_journal::export_docx,
            commands::tailoring_journal::export_pdf,
            commands::applications::db_pipeline_cards,
            commands::analytics::db_analytics_facts,
            commands::discover::discover_scan,
            commands::discover::db_discover_feed,
            commands::discover::db_discover_dismiss,
            commands::discover::db_discover_clear,
            commands::discover_sources::db_list_sources,
            commands::discover_sources::db_set_source_enabled,
            commands::discover_sources::db_market_source_plan,
            commands::discover_sources::db_apply_market_source_plan,
            commands::discover_sources::db_add_source,
            commands::discover_sources::db_remove_source,
            commands::tailoring_journal::open_file,
            commands::tailoring_journal::reveal_in_folder,
            commands::db_export,
            commands::import::import_read_file,
            commands::import::import_preview,
            commands::import::import_confirm,
            ai::ai_run,
            ai::cli_probe::cli_probe,
            ai::cli_install::cli_install,
            ai::skills::skill_render,
            keys::keys_set_provider_key,
            keys::keys_has_provider_key,
            keys::keys_delete_provider_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
