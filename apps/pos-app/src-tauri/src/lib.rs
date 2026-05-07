mod drizzle_proxy;
mod sync;

use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "multi_store_schema",
            sql: include_str!("../../drizzle/0000_certain_mole_man.sql"),
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
