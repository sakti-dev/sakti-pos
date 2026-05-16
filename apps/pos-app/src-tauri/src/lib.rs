mod android;
mod app;
mod assets;
mod db;
mod hardware;
mod logging;
mod sync;
mod time_utils;

use argon2::{hash_raw, Config, Variant, Version};
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_stronghold::Builder;

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
        .plugin(android::photo_picker::init())
        .plugin(hardware::printer::init())
        .setup(app::startup::setup_app)
        .plugin(tauri_plugin_opener::init())
        .plugin(
            Builder::new(|password| {
                let config = Config {
                    lanes: 4,
                    mem_cost: 10_000,
                    time_cost: 2,
                    variant: Variant::Argon2id,
                    version: Version::Version13,
                    ..Default::default()
                };
                let salt = b"sakti-pos-secure-salt-2026";
                let key =
                    hash_raw(password.as_bytes(), salt, &config).expect("failed to hash password");
                key.to_vec()
            })
            .build(),
        )
        .invoke_handler(tauri::generate_handler![
            assets::commands::process_image_to_webp,
            assets::commands::cache_asset_webp,
            assets::commands::prepare_local_image_asset,
            assets::commands::prepare_local_image_asset_from_path,
            assets::commands::read_cached_asset_data,
            assets::commands::enqueue_asset_processing,
            assets::commands::get_pending_asset_preview,
            assets::commands::process_pending_asset_jobs,
            android::photo_picker::pick_product_photo,
            android::photo_picker::delete_temp_product_photo,
            assets::commands::upload_pending_assets,
            assets::commands::hydrate_missing_assets,
            db::drizzle_proxy::run_sql,
            db::drizzle_proxy::run_sql_batch,
            db::drizzle_proxy::get_db_info,
            hardware::printer::list_paired_thermal_printers,
            hardware::printer::test_thermal_printer,
            hardware::printer::print_thermal_receipt,
            hardware::printer::request_bluetooth_permission,
            sync::commands::sync_push,
            sync::commands::sync_pull,
            sync::commands::get_sync_local_state,
            sync::commands::sync_push_outbox,
            sync::commands::sync_pull_events,
            sync::commands::sync_full_resync,
            sync::commands::purge_synced_outbox,
            sync::commands::run_garbage_collection,
            sync::commands::sync_now
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
