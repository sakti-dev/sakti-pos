mod assets;
mod db_utils;
mod drizzle_proxy;
mod photo_picker;
mod printer;
mod sync;

use argon2::{hash_raw, Config, Variant, Version};
use tauri::Manager;
use tauri_plugin_stronghold::Builder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(photo_picker::init())
        .plugin(printer::init())
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
            assets::process_image_to_webp,
            assets::cache_asset_webp,
            assets::prepare_local_product_image_asset,
            assets::prepare_local_product_image_asset_from_path,
            assets::read_cached_asset_data,
            photo_picker::pick_product_photo,
            photo_picker::delete_temp_product_photo,
            assets::upload_pending_product_images,
            assets::hydrate_product_images,
            drizzle_proxy::run_sql,
            drizzle_proxy::run_sql_batch,
            drizzle_proxy::get_db_info,
            printer::list_paired_thermal_printers,
            printer::test_thermal_printer,
            printer::print_thermal_receipt,
            printer::request_bluetooth_permission,
            sync::sync_push,
            sync::sync_pull,
            sync::get_sync_local_state,
            sync::sync_push_outbox,
            sync::sync_pull_events,
            sync::sync_full_resync,
            sync::purge_synced_outbox,
            sync::run_garbage_collection,
            sync::sync_now
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
