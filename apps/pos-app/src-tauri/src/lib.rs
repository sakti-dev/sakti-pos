mod android;
mod app;
mod assets;
mod auth;
mod db;
mod hardware;
mod logging;
mod time_utils;

use tauri_plugin_baresync::builder::Builder as BaresyncBuilder;
use tauri_plugin_log::{Target, TargetKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .target(Target::new(TargetKind::Stdout))
                .target(Target::new(TargetKind::LogDir { file_name: None }))
                .target(Target::new(TargetKind::Webview))
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .level_for("h2", log::LevelFilter::Info)
                .level_for("hyper", log::LevelFilter::Info)
                .level_for("hyper_util", log::LevelFilter::Info)
                .level_for("reqwest", log::LevelFilter::Info)
                .level_for("rustls", log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_android_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(auth::init())
        .plugin(android::photo_picker::init())
        .plugin(hardware::printer::init())
        .plugin(
            BaresyncBuilder::new()
                .api_base_url("http://127.0.0.1:3001")
                .db_path("baresync.db")
                .contract_json(include_str!(
                    "../../../../packages/sync-contract/generated/2026-06-03/sync-contract.json"
                ))
                .migrations_path("migrations")
                .poll_interval_secs(300)
                .poll_on_background(false)
                .build(),
        )
        .setup(app::startup::setup_app)
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            assets::commands::process_image_to_webp,
            assets::commands::cache_asset_webp,
            assets::commands::prepare_local_image_asset,
            assets::commands::prepare_local_image_asset_from_path,
            assets::commands::get_cached_asset_path,
            assets::commands::enqueue_asset_processing,
            assets::commands::get_pending_preview_path,
            assets::commands::process_pending_asset_jobs,
            android::photo_picker::pick_product_photo,
            android::photo_picker::delete_temp_product_photo,
            assets::commands::upload_pending_assets,
            assets::commands::hydrate_missing_assets,
            auth::save_auth_token,
            auth::get_auth_token,
            auth::clear_auth_token,
            db::snapshot::export_db_snapshot,
            hardware::printer::list_paired_thermal_printers,
            hardware::printer::test_thermal_printer,
            hardware::printer::print_thermal_receipt,
            hardware::printer::request_bluetooth_permission,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
