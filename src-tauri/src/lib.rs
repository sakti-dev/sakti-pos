mod drizzle_proxy;

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
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_safe_area_insets_css::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:sakti-pos.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![drizzle_proxy::run_sql])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
