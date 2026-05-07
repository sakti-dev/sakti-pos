mod drizzle_proxy;
mod sync;

use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "init",
            sql: include_str!("../../drizzle/0000_woozy_hulk.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "unique_name",
            sql: include_str!("../../drizzle/0001_silky_genesis.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "unique_category_product_name",
            sql: include_str!("../../drizzle/0002_glorious_major_mapleleaf.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_shop_id_cloud_sync_columns",
            sql: include_str!("../../drizzle/0003_right_black_widow.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:sakti-pos.db", migrations)
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
