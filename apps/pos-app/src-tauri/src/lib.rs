mod db_utils;
mod drizzle_proxy;
mod sync;

use argon2::{hash_raw, Config, Variant, Version};
use tauri::Manager;
use tauri_plugin_stronghold::Builder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                match drizzle_proxy::init_db(&handle).await {
                    Ok(pool) => {
                        handle.manage(drizzle_proxy::AppState { db_pool: pool });
                    }
                    Err(e) => {
                        eprintln!("CRITICAL: Failed to initialize database: {}", e);
                    }
                }
            });
            Ok(())
        })
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
            drizzle_proxy::run_sql,
            drizzle_proxy::run_sql_batch,
            drizzle_proxy::get_db_info,
            sync::sync_push,
            sync::sync_pull,
            sync::run_garbage_collection,
            sync::sync_now
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
