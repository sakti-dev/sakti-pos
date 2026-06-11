## Why

The `baresync-foundation` change installed baresync packages, converted schemas to helpers, and generated the sync contract — but left the old custom sync code running. Now the codebase has two parallel sync implementations: the old custom module (~4,300 lines Rust + ~1,700 lines TS + ~650 lines protobuf codecs) and the new baresync plugin that does the same thing in a fraction of the code. This cutover change replaces all custom sync code with the baresync plugin in a single atomic switch, eliminating the duplicate infrastructure and reducing ongoing maintenance.

Additionally, ALL API endpoints currently use protobuf encoding (`application/x-protobuf`) via a custom `tsProtoPlugin` Elysia plugin. This adds unnecessary complexity — protobuf encode/decode overhead, generated code maintenance, `@bufbuild/protobuf` dependency, and `hasXxx` boolean fields for optional values. Converting all endpoints to TypeBox-validated JSON with Eden Treaty on the client provides end-to-end type safety: single source of truth for schemas, runtime validation on the server, and fully typed API calls on the client.

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
- **Create** TypeBox model files for each domain (`auth.model.ts`, `merchants.model.ts`, `outlets.model.ts`, `staff.model.ts`, `registers.model.ts`, `assets.model.ts`) — single source of truth for validation and types
- **Convert** all 7 API route files from protobuf to TypeBox-validated JSON: remove `tsProtoPlugin`, add `body`/`response` schemas, remove protobuf imports
- **Export** `App` type from `apps/api` for Eden Treaty type sharing via `import type`
- **Install** `@elysia/eden` in POS app and create typed Eden Treaty client (`eden.ts`)
- **Convert** all 6 POS app API clients from `protoFetch` to Eden Treaty calls: `eden.auth.login.post(payload)` with full type safety
- **Remove** `protoFetch`, `ProtoMessage`, `ProtoApiError` from `apps/pos-app/src/lib/api/client.ts`
- **Remove** `apps/api/src/lib/ts-proto-plugin.ts` (61 lines)
- **Remove** `apps/api/src/protobuf/` directory (domain.ts + assets/protobuf.ts)
- **Simplify** response shapes: replace `hasXxx` boolean fields with `t.Nullable(...)` in TypeBox schemas
- **Delete** `packages/protobuf/` directory (7 proto files + 7 generated TS files)
- **Delete** `apps/pos-app/src-tauri/build.rs` protobuf compilation steps
- **Remove** `prost`, `prost-build`, `protoc-bin-vendored` from `Cargo.toml`
- **Remove** `@bufbuild/protobuf`, `protobufjs` from package dependencies
- **Rewrite** all API tests to use JSON + TypeBox validation
- **Rewrite** all POS app tests to use Eden Treaty mocks

## Capabilities

### New Capabilities

- `plugin-integration`: Plugin builder configuration in `lib.rs`, migration runner, and database initialization via baresync
- `server-sync-factory`: Server-side sync using baresync factory functions (`createDrizzleSyncRepository`, route handlers) replacing custom service/routes
- `client-sync-migration`: Client-side sync using `createSyncClient`, `writeTransaction`, `writeLocalChange`, and `createTauriDrizzleDatabase` replacing custom orchestrator
- `record-to-write-transaction-migration`: Systematic replacement of all `recordLocalChange()` calls with `writeTransaction` + `writeLocalChange` pattern
- `non-sync-endpoints-json-migration`: Convert all non-sync API routes (auth, merchants, outlets, staff, registers, assets) from protobuf to TypeBox-validated JSON with Eden Treaty on the client

### Modified Capabilities

None. Existing business behavior is unchanged — only the encoding layer, type system, and sync infrastructure are replaced.

## Impact

- **Rust code**: ~4,300 lines of custom sync code deleted, replaced by ~50 lines of plugin configuration
- **Server code**: ~2,966 lines of custom sync code deleted, replaced by ~200 lines using baresync factories; ~400 lines of protobuf route wrappers replaced by TypeBox model files (~150 lines per domain)
- **Client code**: ~666 lines of custom sync orchestration deleted, replaced by ~150 lines using baresync client; ~200 lines of `protoFetch` wrappers replaced with ~100 lines of Eden Treaty calls
- **API changes**: ALL endpoints switch from `application/x-protobuf` to `application/json` with TypeBox validation — not backward-compatible
- **Build changes**: Remove `prost-build` and `protoc-bin-vendored` from Cargo build-dependencies; `build.rs` simplified to just `tauri_build`
- **Database changes**: `syncMeta` and `syncClientIdentity` tables removed from local schema; new `sync_client_identity` table managed by plugin
- **Wire format**: Switch from protobuf to JSON encoding across ALL endpoints
- **Type safety**: End-to-end type safety via Eden Treaty — server TypeBox schemas flow to client at compile time via `import type { App }`
- **Dependencies**: Remove `prost`, `prost-build`, `protoc-bin-vendored`, `protobuf-src` from Cargo; delete `packages/protobuf/`; remove `@bufbuild/protobuf`, `protobufjs` from JS deps; add `@elysia/eden` to POS app
- **Type changes**: Replace `hasXxx` boolean wrapper fields with `t.Nullable(...)` in TypeBox schemas; remove all `encodeXxx()` helpers
