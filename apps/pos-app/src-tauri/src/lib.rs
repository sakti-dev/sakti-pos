mod app;
mod auth;
mod db;
mod hardware;
mod logging;
mod theme;

use tauri_plugin_baresync::builder::Builder as BaresyncBuilder;
use tauri_plugin_log::{Target, TargetKind};

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn single_instance_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_single_instance::init(|app, args, _cwd| {
        if let Some(url) = args.get(1) {
            app::startup::route_deep_link(app, url);
        }
    })
}

#[cfg(any(target_os = "android", target_os = "ios"))]
fn single_instance_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    // tauri-plugin-single-instance is not available on mobile.
    // Deep links are handled via on_open_url in the existing deep-link setup.
    tauri::plugin::Builder::new("single-instance").build()
}

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
                .level_for("rustls", log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_image_pipeline::init())
        .plugin(single_instance_plugin())
        .plugin(auth::init())
        .plugin(hardware::printer::init())
        .plugin(theme::init())
        .plugin(
            BaresyncBuilder::new()
                .api_base_url("http://192.168.1.2:3001/api/sync/v1")
                .db_path("baresync.db")
                .contract_json(include_str!(
                    "../../../../packages/sync-contract/generated/2026-06-10/sync-contract.json"
                ))
                .migrations_path("migrations")
                .poll_interval_secs(30)
                .poll_on_background(false)
                .build(),
        )
        .setup(app::startup::setup_app)
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            auth::save_auth_token,
            auth::get_auth_token,
            auth::clear_auth_token,
            db::snapshot::export_db_snapshot,
            hardware::printer::list_paired_thermal_printers,
            hardware::printer::test_thermal_printer,
            hardware::printer::print_thermal_receipt,
            hardware::printer::request_bluetooth_permission,
            theme::sync_status_bar_color,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
