## 1. Plugin Integration — Rust Side

- [ ] 1.1 Add `tauri-plugin-baresync::init()` to the plugin list in `lib.rs`
- [ ] 1.2 Add `BaresyncBuilder::new()` configuration in `lib.rs` with `api_base_url`, `db_path`, `contract_json` (via `include_str!`), `migrations_path`, and `poll_interval_secs`
- [ ] 1.3 Remove `mod sync` and `mod db` declarations from `lib.rs`
- [ ] 1.4 Remove all sync commands from `invoke_handler` (sync_push, sync_pull, get_sync_local_state, sync_full_resync, purge_synced_outbox, run_garbage_collection, sync_now)
- [ ] 1.5 Add baresync plugin commands to `invoke_handler` or let plugin register them automatically
- [ ] 1.6 Delete entire `apps/pos-app/src-tauri/src/sync/` directory (12 files)
- [ ] 1.7 Delete `apps/pos-app/src-tauri/src/db/drizzle_proxy.rs` and `apps/pos-app/src-tauri/src/db/migrations.rs`
- [ ] 1.8 Remove `prost`, `prost-build`, `protoc-bin-vendored` from `Cargo.toml` dependencies and build-dependencies
- [ ] 1.9 Simplify `build.rs` — remove protobuf compilation steps, keep only `tauri_build::build()`
- [ ] 1.10 Add `migrations/*.sql` to `bundle.resources` in `tauri.conf.json`

## 2. Remove Protobuf Infrastructure

- [ ] 2.1 Delete `packages/protobuf/` directory
- [ ] 2.2 Delete `packages/sync-proto-generator/` directory
- [ ] 2.3 Remove `generate:sync-proto:write` and `generate:sync-proto:compare` scripts from root `package.json`
- [ ] 2.4 Remove `protobuf`-related imports from `apps/api/src/sync/` files
- [ ] 2.5 Delete `apps/api/src/sync/protobuf.ts` if it exists
- [ ] 2.6 Delete `apps/api/src/sync/push-adapters.generated.ts`

## 3. Server Sync — Replace with Baresync Factories

- [ ] 3.1 Replace `apps/api/src/sync/service.ts` with `createDrizzleSyncRepository` from `baresync/server/drizzle`
- [ ] 3.2 Implement `buildRow` for each of the 10 synced tables
- [ ] 3.3 Implement `readLatestRow` for each of the 10 synced tables
- [ ] 3.4 Implement `readRows` for each of the 10 synced tables
- [ ] 3.5 Implement `softDeleteRow` for each of the 10 synced tables
- [ ] 3.6 Implement `upsertRow` for each of the 10 synced tables
- [ ] 3.7 Replace `apps/api/src/sync/routes.ts` with `createSyncPushHandler`, `createSyncPullHandler`, `createSyncStatusHandler` from `baresync/server`
- [ ] 3.8 Implement `resolveScope` function returning `{ scopeId, merchantId }` for dual scope types
- [ ] 3.9 Preserve URL paths (`/api/sync/push`, `/api/sync/pull`, `/api/sync/status`)
- [ ] 3.10 Run server sync tests and verify push/pull/status endpoints work

## 4. Client Sync — Replace with Baresync Client

- [ ] 4.1 Replace `apps/pos-app/src/db/index.ts` with `createTauriDrizzleDatabase` from `baresync/tauri`
- [ ] 4.2 Create TABLE registry with all synced tables (merchants, outlets, registers, staff, categories, assets, products, outletProducts, orders, orderItems) plus runtime tables (localAssetCache, pendingAssetProcessingJobs, pendingProductPhotoJobs)
- [ ] 4.3 Replace `apps/pos-app/src/store/sync.ts` with `createSyncClient` from `baresync`
- [ ] 4.4 Initialize sync client with `SYNC_SCOPE` from `sync-constants.ts`
- [ ] 4.5 Wire up `startPolling` on app initialization
- [ ] 4.6 Wire up `baresync://data-changed` and `baresync://sync-status-changed` events for React Query invalidation
- [ ] 4.7 Delete `apps/pos-app/src/db/sync-outbox.ts`

## 5. Migrate recordLocalChange Calls

- [ ] 5.1 Search for all `recordLocalChange` call sites: `grep -r "recordLocalChange" apps/pos-app/src/`
- [ ] 5.2 Migrate insert operations to `writeTransaction` + `writeLocalChange` with `operation: "insert"`
- [ ] 5.3 Migrate update operations to `writeTransaction` + `writeLocalChange` with `operation: "update"`
- [ ] 5.4 Migrate delete operations to `writeTransaction` + `writeLocalChange` with `operation: "update"` and `deletedAt` set
- [ ] 5.5 Verify no remaining `recordLocalChange` references
- [ ] 5.6 Verify all synced writes go through `writeTransaction` pattern

## 6. Schema Cleanup

- [ ] 6.1 Remove `syncMeta` table definition from `packages/database/src/local-schema.ts`
- [ ] 6.2 Remove `syncClientIdentity` table definition from `packages/database/src/local-schema.ts`
- [ ] 6.3 Remove `syncMeta` and `syncClientIdentity` from the `localDatabaseSchema` object
- [ ] 6.4 Regenerate Drizzle types and verify no compilation errors
- [ ] 6.5 Run `bun x ultracite check` to verify no lint errors

## 7. Build Verification

- [ ] 7.1 Run `cargo check --manifest-path apps/pos-app/src-tauri/Cargo.toml` — verify no Rust compilation errors
- [ ] 7.2 Run `cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib` — verify tests pass
- [ ] 7.3 Run `bun run build` — verify TypeScript compilation succeeds
- [ ] 7.4 Run `bun x ultracite check` — verify no lint errors
- [ ] 7.5 Run existing API sync tests: `bun test apps/api/src/sync/__test__/service.test.ts`

## 8. End-to-End Verification

- [ ] 8.1 Start local server and verify sync endpoints respond to JSON payloads
- [ ] 8.2 Start POS app and verify plugin initializes (check logs for baresync initialization)
- [ ] 8.3 Trigger on-demand sync and verify push/pull cycle completes
- [ ] 8.4 Verify merchant-scoped data syncs correctly
- [ ] 8.5 Verify outlet-scoped data syncs correctly
- [ ] 8.6 Verify polling starts and runs on configured interval
- [ ] 8.7 Verify `writeTransaction` + `writeLocalChange` correctly populates outbox and triggers sync

## 9. Documentation and Cleanup

- [ ] 9.1 Update `AGENTS.md` — remove old sync commands, add baresync commands
- [ ] 9.2 Update `docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md` — mark as deprecated
- [ ] 9.3 Update `docs/knowledge/APP-LOGGING-DOCS.md` — add baresync log prefixes if any
- [ ] 9.4 Update `LOG_FILTER` in `logs/capture-adb-logcat.sh` for new sync paths
- [ ] 9.5 Commit all changes with message: "feat(sync): cutover to baresync plugin — replace custom sync infrastructure"
