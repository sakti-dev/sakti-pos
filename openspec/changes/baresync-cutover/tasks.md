## 1. Plugin Integration — Rust Side

- [x] 1.1 Add `tauri-plugin-baresync::init()` to the plugin list in `lib.rs`
- [x] 1.2 Add `BaresyncBuilder::new()` configuration in `lib.rs` with `api_base_url`, `db_path`, `contract_json` (via `include_str!`), `migrations_path`, and `poll_interval_secs`
- [x] 1.3 Remove `mod sync` and `mod db` declarations from `lib.rs` (sync removed; db kept for snapshot + sqlite)
- [x] 1.4 Remove all sync commands from `invoke_handler` (sync_push, sync_pull, get_sync_local_state, sync_full_resync, purge_synced_outbox, run_garbage_collection, sync_now)
- [x] 1.5 Add baresync plugin commands to `invoke_handler` or let plugin register them automatically
- [x] 1.6 Delete entire `apps/pos-app/src-tauri/src/sync/` directory (12 files)
- [x] 1.7 Delete `apps/pos-app/src-tauri/src/db/drizzle_proxy.rs` and `apps/pos-app/src-tauri/src/db/migrations.rs`
- [x] 1.8 Remove `prost`, `prost-build`, `protoc-bin-vendored` from `Cargo.toml` dependencies and build-dependencies
- [x] 1.9 Simplify `build.rs` — remove protobuf compilation steps, keep only `tauri_build::build()`
- [x] 1.10 Add `migrations/*.sql` to `bundle.resources` in `tauri.conf.json`

## 2. Remove Protobuf Infrastructure

- [x] 2.1 Delete `packages/protobuf/` directory entirely (7 proto files + 7 generated TS files + package.json)
- [x] 2.2 Delete `packages/sync-proto-generator/` directory if it exists
- [x] 2.3 Remove `@repo/protobuf` dependency from `apps/api/package.json`
- [x] 2.4 Remove `@repo/protobuf` dependency from `apps/pos-app/package.json`
- [x] 2.5 Remove `@bufbuild/protobuf` and `protobufjs` from root `package.json` dependencies
- [x] 2.6 Remove `generate:sync-proto:write` and `generate:sync-proto:compare` scripts from root `package.json`
- [x] 2.7 Delete `apps/api/src/lib/ts-proto-plugin.ts` (61 lines)
- [x] 2.8 Delete `apps/api/src/protobuf/domain.ts` (142 lines)
- [x] 2.9 Delete `apps/api/src/assets/protobuf.ts`
- [x] 2.10 Delete `apps/api/src/protobuf/` directory
- [x] 2.11 Delete `apps/api/src/sync/push-adapters.generated.ts`
- [x] 2.12 Remove `protobuf`-related imports from `apps/api/src/sync/` files
- [x] 2.13 Run `bun install` to clean up lockfile

## 3. Server Sync — Replace with Baresync Factories

- [x] 3.1 Replace `apps/api/src/sync/service.ts` with `createDrizzleSyncRepository` from `baresync/server/drizzle`
- [x] 3.2 Implement `buildRow` for each of the 10 synced tables
- [x] 3.3 Implement `readLatestRow` for each of the 10 synced tables
- [x] 3.4 Implement `readRows` for each of the 10 synced tables
- [x] 3.5 Implement `softDeleteRow` for each of the 10 synced tables
- [x] 3.6 Implement `upsertRow` for each of the 10 synced tables
- [x] 3.7 Replace `apps/api/src/sync/routes.ts` with `createSyncPushHandler`, `createSyncPullHandler`, `createSyncStatusHandler` from `baresync/server`
- [x] 3.8 Implement `resolveScope` function returning `{ scopeId, merchantId }` for dual scope types
- [x] 3.9 Preserve URL paths (`/api/sync/push`, `/api/sync/pull`, `/api/sync/status`)
- [x] 3.10 Run server sync tests and verify push/pull/status endpoints work

## 4. Client Sync — Replace with Baresync Client

- [x] 4.1 Replace `apps/pos-app/src/db/index.ts` with `createTauriDrizzleDatabase` from `baresync/tauri`
- [x] 4.2 Create TABLE registry with all synced tables (merchants, outlets, registers, staff, categories, assets, products, outletProducts, orders, orderItems) plus runtime tables (localAssetCache, pendingAssetProcessingJobs, pendingProductPhotoJobs)
- [x] 4.3 Replace `apps/pos-app/src/store/sync.ts` with `createSyncClient` from `baresync`
- [x] 4.4 Initialize sync client with `SYNC_SCOPE` from `sync-constants.ts`
- [x] 4.5 Wire up `startPolling` on app initialization
- [x] 4.6 Wire up `baresync://data-changed` and `baresync://sync-status-changed` events for React Query invalidation
- [x] 4.7 Delete `apps/pos-app/src/db/sync-outbox.ts`

## 5. Migrate recordLocalChange Calls

- [x] 5.1 Search for all `recordLocalChange` call sites: `grep -r "recordLocalChange" apps/pos-app/src/`
- [x] 5.2 Migrate insert operations to `writeTransaction` + `writeLocalChange` with `operation: "insert"`
- [x] 5.3 Migrate update operations to `writeTransaction` + `writeLocalChange` with `operation: "update"`
- [x] 5.4 Migrate delete operations to `writeTransaction` + `writeLocalChange` with `operation: "update"` and `deletedAt` set
- [x] 5.5 Verify no remaining `recordLocalChange` references
- [x] 5.6 Verify all synced writes go through `writeTransaction` pattern

## 6. Define TypeBox Schemas (Server Models)

Create TypeBox model files for each domain. These define both runtime validation AND TypeScript types.

Pattern for each model file:
```typescript
import { t } from "elysia";

// Request schemas
export const FooRequest = t.Object({
  name: t.String({ minLength: 1 }),
  // ...
});

// Response schemas
export const FooResponse = t.Object({
  id: t.String(),
  name: t.String(),
  // nullable fields use t.Nullable(...)
});

// Inferred types
export type FooRequest = typeof FooRequest.static;
export type FooResponse = typeof FooResponse.static;
```

- [x] 6.1 Create `apps/api/src/auth/auth.model.ts` — `AuthRegisterRequest`, `AuthLoginRequest`, `AuthResponse`, `AuthSessionResponse`, `LogoutResponse`, `SessionMerchant`, `ApiUser`
- [x] 6.2 Create `apps/api/src/merchants/merchants.model.ts` — `MerchantCreateRequest`, `MerchantCreateResponse`, `MerchantListResponse`
- [x] 6.3 Create `apps/api/src/outlets/outlets.model.ts` — `OutletCreateRequest`, `OutletCreateResponse`, `OutletListRequest`, `OutletListResponse`, `OutletUpdateRequest`, `OutletUpdateResponse`
- [x] 6.4 Create `apps/api/src/staff/staff.model.ts` — `StaffCreateRequest`, `StaffCreateResponse`, `StaffCurrentRequest`, `StaffCurrentResponse`, `StaffListRequest`, `StaffListResponse`, `StaffUpdatePinRequest`, `StaffUpdatePinResponse`, `StaffDeleteRequest`, `DeleteResponse`
- [x] 6.5 Create `apps/api/src/registers/registers.model.ts` — `RegisterCreateRequest`, `RegisterCreateResponse`, `RegisterDeleteRequest`, `RegisterListRequest`, `RegisterListResponse`, `RegisterPairRequest`, `RegisterPairResponse`, `DeleteResponse`
- [x] 6.6 Create `apps/api/src/assets/assets.model.ts` — `AssetPresignUploadRequest`, `AssetPresignUploadResponse`, `AssetCompleteUploadRequest`, `AssetCompleteUploadResponse`, `AssetPresignDownloadRequest`, `AssetPresignDownloadResponse`, `AssetHeader`

## 7. Convert Server Routes to TypeBox Validation

For each route file:
1. Remove `import { tsProtoPlugin } from "../lib/ts-proto-plugin"`
2. Remove all `@repo/protobuf/*` imports
3. Remove `.use(tsProtoPlugin)` from the Elysia instance
4. Remove `proto: { req, res }` options from all `.post()` calls
5. Add TypeBox schemas as `body` and `response` options
6. Replace `encodeXxx(row)` calls with plain object literals
7. Remove `hasXxx` boolean fields from return objects
8. Use `t.Optional(...)` for optional response fields

- [x] 7.1 Convert `apps/api/src/auth/routes.ts` — use `auth.model.ts` schemas, remove proto plugin, add `body`/`response` validation
- [x] 7.2 Convert `apps/api/src/merchants/routes.ts` — use `merchants.model.ts` schemas
- [x] 7.3 Convert `apps/api/src/outlets/routes.ts` — use `outlets.model.ts` schemas, remove `hasXxx` fields
- [x] 7.4 Convert `apps/api/src/staff/routes.ts` — use `staff.model.ts` schemas, remove `hasXxx` fields
- [x] 7.5 Convert `apps/api/src/registers/protected-routes.ts` — use `registers.model.ts` schemas
- [x] 7.6 Convert `apps/api/src/registers/public-routes.ts` — use `registers.model.ts` schemas
- [x] 7.7 Convert `apps/api/src/assets/routes.ts` — use `assets.model.ts` schemas, remove `tsProtoCodec` wrappers, replace `AssetPresignXxxResponse.create()` with plain objects
- [x] 7.8 Export app type from `apps/api/src/app.ts`: `export type App = typeof app`
- [x] 7.9 Verify `apps/api` package.json has `"name": "@repo/api"` and appropriate exports
- [x] 7.10 Verify all server routes compile: `npx tsc --noEmit` in `apps/api/`

## 8. Install Eden Treaty and Create Client

- [x] 8.1 Install `@elysia/eden` in `apps/pos-app`: `bun add @elysia/eden`
- [x] 8.2 Ensure `apps/pos-app/package.json` has workspace dependency on `@repo/api` (for type imports)
- [x] 8.3 Create `apps/pos-app/src/lib/api/eden.ts` — Eden Treaty client with auth header injection:
- [x] 8.4 Create auth-aware wrapper that injects Bearer token per request (since Eden headers need to be dynamic)

## 9. Convert POS App API Clients to Eden Treaty

For each client file:
1. Remove all `@repo/protobuf/*` imports
2. Replace `protoFetch(endpoint, { req, res }, payload)` with `eden.path.post(payload)` or `eden.path.get()`
3. Remove `ProtoApiError` usage
4. Use Eden's `{ data, error }` return pattern for error handling

- [x] 9.1 Rewrite `apps/pos-app/src/lib/api/client.ts` — remove `ProtoMessage`, `ProtoApiError`, `protoFetch`; keep only `api` (ky instance for non-typed calls) and `readErrorMessage`; add Eden client export
- [x] 9.2 Rewrite `apps/pos-app/src/lib/api/auth.ts` — use `eden.auth.register.post(payload)`, `eden.auth.login.post(payload)`, `eden.auth.logout.post()`, `eden.auth.session.post()`
- [x] 9.3 Rewrite `apps/pos-app/src/lib/api/merchants.ts` — use `eden.merchants.list.post()`, `eden.merchants.create.post(payload)`
- [x] 9.4 Rewrite `apps/pos-app/src/lib/api/outlets.ts` — use `eden.outlets.list.post(payload)`, `eden.outlets.create.post(payload)`, `eden.outlets.update.post(payload)`
- [x] 9.5 Rewrite `apps/pos-app/src/lib/api/staff.ts` — use `eden.staff.current.post(payload)`, `eden.staff.create.post(payload)`, etc.
- [x] 9.6 Rewrite `apps/pos-app/src/lib/api/registers.ts` — use `eden.registers.pair.post(payload)`, `eden.registers.create.post(payload)`, etc.
- [x] 9.7 Delete `apps/pos-app/src/lib/api/sync.ts` — sync status is handled by baresync client directly
- [x] 9.8 Update `apps/pos-app/src/lib/assets/types.ts` — remove `Asset` type import from `@repo/protobuf/assets`; define locally or import from `@repo/database`
- [x] 9.9 Update `apps/pos-app/src/lib/auth/cloud.ts` — update any references to protobuf types

## 10. Update POS App Tests

- [x] 10.1 Delete `apps/pos-app/src/lib/api/__test__/protobuf.test.ts` — no more protobuf
- [x] 10.2 Delete `apps/pos-app/src/lib/api/__test__/domain-protobuf.test.ts` — no more protobuf
- [x] 10.3 Delete `apps/pos-app/src/lib/api/__test__/sync.test.ts` — sync status handled by baresync
- [x] 10.4 Rewrite `apps/pos-app/src/lib/api/__test__/cloud.test.ts` — update to use Eden Treaty mocks
- [x] 10.5 Rewrite `apps/pos-app/src/lib/auth/__test__/cloud.test.ts` — update to use Eden Treaty mocks

## 11. Update API Tests

- [x] 11.1 Delete `apps/api/src/auth/__test__/routes-protobuf.test.ts` — no more protobuf
- [x] 11.2 Rewrite `apps/api/src/auth/__test__/routes.test.ts` — send JSON requests, assert JSON responses
- [x] 11.3 Rewrite `apps/api/src/merchants/__test__/routes.test.ts` — send JSON requests, assert JSON responses
- [x] 11.4 Rewrite `apps/api/src/outlets/__test__/routes.test.ts` — send JSON requests, assert JSON responses
- [x] 11.5 Rewrite `apps/api/src/staff/__test__/routes.test.ts` — send JSON requests, assert JSON responses
- [x] 11.6 Rewrite `apps/api/src/registers/__test__/routes.test.ts` — send JSON requests, assert JSON responses
- [x] 11.7 Rewrite `apps/api/src/assets/__test__/routes.test.ts` — send JSON requests, assert JSON responses
- [x] 11.8 Delete `apps/api/src/lib/__test__/ts-proto-plugin.test.ts` — no more ts-proto-plugin
- [x] 11.9 Delete `apps/api/src/protobuf/__test__/domain.test.ts` — no more protobuf domain helpers
- [x] 11.10 Run all API tests: `bun test apps/api/src/`

## 12. Schema Cleanup

- [x] 12.1 Remove `syncMeta` table definition from `packages/database/src/local-schema.ts`
- [x] 12.2 Remove `syncClientIdentity` table definition from `packages/database/src/local-schema.ts`
- [x] 12.3 Remove `syncMeta` and `syncClientIdentity` from the `localDatabaseSchema` object
- [x] 12.4 Regenerate Drizzle types and verify no compilation errors
- [x] 12.5 Run `bun x ultracite check` to verify no lint errors

## 13. Build Verification

- [x] 13.1 Run `cargo check --manifest-path apps/pos-app/src-tauri/Cargo.toml` — verify no Rust compilation errors
- [x] 13.2 Run `cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib` — verify tests pass
- [x] 13.3 Run `npx tsc --noEmit` in `apps/api/` — verify no TypeScript errors
- [x] 13.4 Run `npx tsc --noEmit` in `apps/pos-app/` — verify no TypeScript errors
- [x] 13.5 Run `bun x ultracite check` — verify no lint errors
- [x] 13.6 Run `bun test apps/api/src/` — verify all API tests pass
- [x] 13.7 Run `bun test apps/pos-app/src/` — verify all POS app tests pass
- [x] 13.8 Verify no `@repo/protobuf` imports remain: `grep -r "@repo/protobuf" apps/`
- [x] 13.9 Verify no `protoFetch` references remain: `grep -r "protoFetch" apps/`
- [x] 13.10 Verify no `tsProtoPlugin` references remain: `grep -r "tsProtoPlugin" apps/`
- [x] 13.11 Verify `packages/protobuf/` is deleted

## 14. End-to-End Verification

- [ ] 14.1 Start local server and verify all endpoints respond to JSON payloads
- [ ] 14.2 Start POS app and verify plugin initializes (check logs for baresync initialization)
- [ ] 14.3 Trigger on-demand sync and verify push/pull cycle completes
- [ ] 14.4 Verify merchant-scoped data syncs correctly
- [ ] 14.5 Verify outlet-scoped data syncs correctly
- [ ] 14.6 Verify polling starts and runs on configured interval
- [ ] 14.7 Verify `writeTransaction` + `writeLocalChange` correctly populates outbox and triggers sync
- [ ] 14.8 Verify auth flow (register/login/session) works with JSON + TypeBox validation
- [ ] 14.9 Verify staff CRUD works with JSON + TypeBox validation
- [ ] 14.10 Verify outlet CRUD works with JSON + TypeBox validation
- [ ] 14.11 Verify register pairing works with JSON + TypeBox validation
- [ ] 14.12 Verify Eden Treaty client returns fully typed responses

## 15. Documentation and Cleanup

- [x] 15.1 Update `AGENTS.md` — remove old sync commands, add baresync commands
- [x] 15.2 Update `docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md` — mark as deprecated
- [x] 15.3 Update `docs/knowledge/APP-LOGGING-DOCS.md` — add baresync log prefixes if any
- [x] 15.4 Update `LOG_FILTER` in `logs/capture-adb-logcat.sh` for new sync paths
- [ ] 15.5 Commit all changes with message: "feat(sync): cutover to baresync — replace custom sync + convert all endpoints to TypeBox + Eden Treaty"
