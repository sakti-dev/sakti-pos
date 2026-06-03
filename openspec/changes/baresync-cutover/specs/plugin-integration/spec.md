## ADDED Requirements

### Requirement: Plugin builder configures sync engine
The `lib.rs` file SHALL configure `tauri-plugin-baresync` via `BaresyncBuilder::new()` with `api_base_url`, `db_path`, `contract_json`, `migrations_path`, and `poll_interval_secs`.

#### Scenario: Plugin initializes with correct configuration
- **WHEN** the Tauri app starts
- **THEN** baresync plugin connects to SQLite at the configured `db_path`, runs migrations, and starts the polling loop with the configured interval

#### Scenario: Contract JSON is embedded at compile time
- **WHEN** the Rust binary is built
- **THEN** `include_str!` embeds the generated `sync-contract.json` content into the binary

#### Scenario: Migrations are bundled as resources
- **WHEN** the app is bundled for distribution
- **THEN** `migrations/*.sql` files are included in the bundle resources

### Requirement: Plugin commands are registered in invoke_handler
The `lib.rs` `invoke_handler` SHALL include baresync plugin commands (`run_sql`, `run_sql_batch`, `sync_now`, `sync_push`, `sync_pull`, `sync_full_resync`, `start_polling`, `stop_polling`, `get_sync_local_state`, `purge_synced_outbox`, `run_garbage_collection`, `get_polling_status`, `run_migrations`, `get_migration_status`, `get_db_info`).

#### Scenario: JS can invoke baresync commands
- **WHEN** the frontend calls `invoke("plugin:baresync|sync_now", { scopeId: "default" })`
- **THEN** the command executes and returns a `SyncNowResult`

#### Scenario: Old sync commands are removed
- **WHEN** the frontend calls `invoke("sync_now")` or `invoke("sync_push")`
- **THEN** the command is not found (old commands removed from `invoke_handler`)

### Requirement: Old sync module is removed
The entire `apps/pos-app/src-tauri/src/sync/` directory SHALL be deleted. The `mod sync` declaration in `lib.rs` SHALL be removed.

#### Scenario: Sync module files are deleted
- **WHEN** the cutover is complete
- **THEN** no files exist in `apps/pos-app/src-tauri/src/sync/`

#### Scenario: No references to old sync module
- **WHEN** `cargo check` runs
- **THEN** no compilation errors related to missing `sync` module

### Requirement: Old db proxy and migrations are removed
The files `apps/pos-app/src-tauri/src/db/drizzle_proxy.rs` and `apps/pos-app/src-tauri/src/db/migrations.rs` SHALL be deleted. The `mod db` declaration in `lib.rs` SHALL be removed.

#### Scenario: Old db files are deleted
- **WHEN** the cutover is complete
- **THEN** `drizzle_proxy.rs` and `migrations.rs` no longer exist in `apps/pos-app/src-tauri/src/db/`

### Requirement: Protobuf infrastructure is removed
The `prost`, `prost-build`, and `protoc-bin-vendored` dependencies SHALL be removed from `Cargo.toml`. The protobuf compilation steps in `build.rs` SHALL be removed. The `packages/protobuf/` and `packages/sync-proto-generator/` directories SHALL be deleted.

#### Scenario: No protobuf dependencies
- **WHEN** `cargo check` runs
- **THEN** no protobuf-related crates are compiled

#### Scenario: Build script is simplified
- **WHEN** `cargo build` runs
- **THEN** `build.rs` only runs `tauri_build::build()` (no protobuf compilation)

### Requirement: Plugin manages client identity
The baresync plugin SHALL manage client identity internally via its `sync_client_identity` table. The old `syncClientIdentity` table definition SHALL be removed from `local-schema.ts`.

#### Scenario: Plugin generates client ID
- **WHEN** the app starts for the first time
- **THEN** baresync generates a unique client ID and stores it in `sync_client_identity`

#### Scenario: Old table is removed
- **WHEN** the Drizzle schema is generated
- **THEN** `syncClientIdentity` table is not present in the output

### Requirement: Plugin manages sync cursors
The baresync plugin SHALL use `sync_cursors` for per-scope cursor tracking. The old `syncMeta` table definition SHALL be removed from `local-schema.ts`.

#### Scenario: Cursors track last sync position
- **WHEN** a sync cycle completes
- **THEN** baresync updates `sync_cursors` with the latest server watermark for each scope

#### Scenario: Old table is removed
- **WHEN** the Drizzle schema is generated
- **THEN** `syncMeta` table is not present in the output
