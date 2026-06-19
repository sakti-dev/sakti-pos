use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use std::str::FromStr;
use std::time::Duration;
use tauri::{Emitter, Manager};

const DEEP_LINK_SCHEME: &str = "sakti-pos-dev";

pub fn route_deep_link(app: &tauri::AppHandle, url: &str) {
    if url.contains("sakti-pos-dev://auth") {
        if let Some(main_window) = app.get_webview_window("main") {
            let _ = main_window.emit("google-oauth-callback", url);
        }
    } else {
        // Route snapshot and other URLs to existing handlers
        let pool = app.state::<crate::app::state::AppState>().db_pool.clone();
        let handle = app.clone();
        let url = url.to_string();
        tauri::async_runtime::spawn(async move {
            if let Err(error) =
                crate::db::snapshot::handle_dev_snapshot_export_urls(&handle, &pool, &[url]).await
            {
                crate::pos_log!(
                    error,
                    "DB",
                    "SNAPSHOT_EXPORT_FAILED",
                    "Failed to export local DB snapshot from deep link",
                    "error" => error
                );
            }
        });
    }
}

pub fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    let result: Result<(), Box<dyn std::error::Error>> =
        tauri::async_runtime::block_on(async move {
            let db_path = crate::db::sqlite::get_app_db_path(&handle)?;

            let options = SqliteConnectOptions::from_str(&format!("sqlite:{}", db_path.display()))
                .map_err(|e| format!("Invalid DB URI: {}", e))?
                .create_if_missing(true)
                .journal_mode(SqliteJournalMode::Wal)
                .synchronous(SqliteSynchronous::Normal)
                .busy_timeout(Duration::from_secs(5))
                .pragma("foreign_keys", "ON");

            let pool = SqlitePoolOptions::new()
                .max_connections(1)
                .acquire_timeout(Duration::from_secs(3))
                .connect_with(options)
                .await
                .map_err(|e| format!("Failed to connect to DB: {}", e))?;

            handle.manage(crate::app::state::AppState { db_pool: pool });

            use tauri_plugin_deep_link::DeepLinkExt;

            // Handle cold-start deep links (URLs that arrived before app was ready)
            let startup_urls = handle.deep_link().get_current().map_err(|error| {
                std::io::Error::other(format!("Failed to read startup deep links: {}", error))
            })?;
            if let Some(urls) = startup_urls {
                for url in urls {
                    route_deep_link(&handle, &url.to_string());
                }
            }

            // Listen for deep links while app is running
            let deep_link_handle = handle.clone();
            handle.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    route_deep_link(&deep_link_handle, &url.to_string());
                }
            });

            // Asset recovery and job_completed event handling now runs on the JS side
            // (see apps/pos-app/src/lib/assets/lifecycle.ts and recovery.ts)

            Ok(())
        });

    result
}
