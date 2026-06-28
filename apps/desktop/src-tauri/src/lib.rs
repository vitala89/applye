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
        .setup(|app| {
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
            commands::scoring::job_paste,
            commands::scoring::score_cache_get,
            commands::scoring::score_cache_save,
            commands::settings::db_get_settings,
            commands::settings::db_update_settings,
            commands::jobs::db_list_jobs,
            commands::jobs::db_upsert_job,
            commands::applications::db_list_applications,
            commands::applications::db_upsert_application,
            commands::applications::db_set_application_status,
            commands::tailoring::tailoring_cache_get,
            commands::tailoring::tailoring_cache_save,
            commands::tailoring::generated_doc_get,
            commands::tailoring::export_docx,
            commands::tailoring::export_pdf,
            commands::db_export,
            ai::ai_run,
            ai::skills::skill_render,
            keys::keys_set_provider_key,
            keys::keys_has_provider_key,
            keys::keys_delete_provider_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
