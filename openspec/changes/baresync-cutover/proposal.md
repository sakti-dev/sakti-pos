## Why

The `baresync-foundation` change installed baresync packages, converted schemas to helpers, and generated the sync contract — but left the old custom sync code running. Now the codebase has two parallel sync implementations: the old custom module (~4,300 lines Rust + ~1,700 lines TS + ~650 lines protobuf codecs) and the new baresync plugin that does the same thing in a fraction of the code. This cutover change replaces all custom sync code with the baresync plugin in a single atomic switch, eliminating the duplicate infrastructure and reducing ongoing maintenance.

Wire format coupling forces this to be atomic: the old server uses protobuf encoding, the new plugin uses JSON encoding. The server cannot serve both formats simultaneously, so client and server must switch in the same deployment.

## What Changes

- **Add** baresync plugin builder to `lib.rs` with `include_str!` for contract JSON, `api_base_url`, `db_path`, `migrations_path`, and `poll_interval_secs`
- **Remove** entire `apps/pos-app/src-tauri/src/sync/` directory (12 files, ~4,300 lines): `mod.rs`, `commands.rs`, `push.rs`, `pull.rs`, `protobuf.rs`, `protobuf_generated.rs`, `local_state.rs`, `client_identity.rs`, `outbox.rs`, `coalesce.rs`, `sync_state.rs`, `utils.rs`
- **Remove** `apps/pos-app/src-tauri/src/db/drizzle_proxy.rs` (291 lines) and `apps/pos-app/src-tauri/src/db/migrations.rs` (91 lines)
- **Remove** `mod sync` and `mod db` declarations from `lib.rs`; remove all sync commands from `invoke_handler`
- **Replace** `apps/api/src/sync/routes.ts` (232 lines) with baresync factory functions (`createSyncPushHandler`, `createSyncPullHandler`, `createSyncStatusHandler`)
- **Replace** `apps/api/src/sync/service.ts` (1,079 lines) with `createDrizzleSyncRepository` from `baresync/server/drizzle`
- **Delete** `apps/api/src/sync/push-adapters.generated.ts` (655 lines) — baresync generates this internally
- **Replace** `apps/pos-app/src/db/index.ts` (71 lines) with `createTauriDrizzleDatabase` from `baresync/tauri`
- **Replace** `apps/pos-app/src/db/sync-outbox.ts` (163 lines) with `writeTransaction` + `writeLocalChange` from `baresync`
- **Replace** `apps/pos-app/src/store/sync.ts` (432 lines) with `createSyncClient` from `baresync`
- **Remove** all `recordLocalChange()` calls across the app — replace with `writeTransaction` + `writeLocalChange`
- **Remove** `syncMeta` and `syncClientIdentity` tables from local schema
- **Delete** `packages/protobuf/` and `packages/sync-proto-generator/` directories
- **Delete** `apps/pos-app/src-tauri/build.rs` protobuf compilation steps
- **Remove** `prost`, `prost-build`, `protoc-bin-vendored` from `Cargo.toml`

## Capabilities

### New Capabilities

- `plugin-integration`: Plugin builder configuration in `lib.rs`, migration runner, and database initialization via baresync
- `server-sync-factory`: Server-side sync using baresync factory functions (`createDrizzleSyncRepository`, route handlers) replacing custom service/routes
- `client-sync-migration`: Client-side sync using `createSyncClient`, `writeTransaction`, `writeLocalChange`, and `createTauriDrizzleDatabase` replacing custom orchestrator
- `record-to-write-transaction-migration`: Systematic replacement of all `recordLocalChange()` calls with `writeTransaction` + `writeLocalChange` pattern

### Modified Capabilities

None. Existing business behavior is unchanged — only the sync infrastructure layer is replaced.

## Impact

- **Rust code**: ~4,300 lines of custom sync code deleted, replaced by ~50 lines of plugin configuration
- **Server code**: ~2,966 lines of custom sync code deleted, replaced by ~200 lines using baresync factories
- **Client code**: ~666 lines of custom sync orchestration deleted, replaced by ~150 lines using baresync client
- **API changes**: `apps/api/src/sync/routes.ts` URL paths remain `/api/sync/push`, `/api/sync/pull`, `/api/sync/status` — no frontend URL changes needed
- **Build changes**: Remove `prost-build` and `protoc-bin-vendored` from Cargo build-dependencies; `build.rs` simplified to just `tauri_build`
- **Database changes**: `syncMeta` and `syncClientIdentity` tables removed from local schema; new `sync_client_identity` table managed by plugin
- **Wire format**: Switch from protobuf to JSON encoding — server endpoint contracts change (not backward-compatible)
- **Dependencies**: Remove `prost`, `prost-build`, `protoc-bin-vendored`, `protobuf-src` from Cargo; delete `packages/protobuf/` and `packages/sync-proto-generator/`
