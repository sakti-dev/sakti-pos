## 1. Install Packages

- [x] 1.1 Add `baresync@0.2.3` to `apps/pos-app/package.json` and `apps/api/package.json`
- [x] 1.2 Add `tauri-plugin-baresync = "0.2.0"` and `env_logger = "0.11"` to `apps/pos-app/src-tauri/Cargo.toml` dependencies
- [x] 1.3 Remove `prost-build` and `protoc-bin-vendored` from `apps/pos-app/src-tauri/Cargo.toml` build-dependencies
- [ ] 1.4 Run `bun install` and verify baresync CLI is available
- [ ] 1.5 Run `cargo check --manifest-path apps/pos-app/src-tauri/Cargo.toml` to verify Rust compilation

## 2. Create Shared Constants and Config

- [x] 2.1 Create `packages/database/src/sync-constants.ts` with `export const SYNC_SCOPE = "default"`
- [x] 2.2 Create `packages/database/sync.config.ts` using `defineSyncConfig` from `baresync/generator` with all 10 tables and correct scope column mappings
- [x] 2.3 Add `generate:sync`, `generate:sync:check`, and `generate:sync:doctor` scripts to root `package.json`

## 3. Convert Local Schema to Baresync Helpers

- [x] 3.1 Import `createSyncOutboxTable` and `createSyncCursorsTable` from `baresync/schema` in `packages/database/src/local-schema.ts`
- [x] 3.2 Replace manual `syncOutbox` definition (lines 94-117) with `export const syncOutbox = createSyncOutboxTable()`
- [x] 3.3 Replace manual `syncCursors` definition (lines 127-134) with `export const syncCursors = createSyncCursorsTable()`
- [x] 3.4 Verify column names and types match original by diffing Drizzle introspect output

## 4. Convert API Schema to Baresync Helpers

- [x] 4.1 Import `createSyncBatchRequestsTable` from `baresync/schema` in `packages/database/src/api-schema.ts`
- [x] 4.2 Replace manual `syncBatchRequests` definition (lines 58-76) with `export const syncBatchRequests = createSyncBatchRequestsTable()`
- [x] 4.3 Verify column names and types match original

## 5. Generate Sync Contract

- [x] 5.1 Run `bun run generate:sync` and verify it completes without errors
- [x] 5.2 Inspect `packages/database/generated/sync-contract.json` — verify all 10 tables present with correct scope mappings
- [x] 5.3 Inspect `packages/database/generated/sync-table-order.ts` — verify upsert order respects FK dependencies (merchants before categories, categories before products, etc.)
- [x] 5.4 Inspect `packages/database/generated/sync-contract.manifest.json` — verify table names, field names, and scope mappings
- [x] 5.5 Run `bun run generate:sync:check` — verify no errors
- [x] 5.6 Run `bun run generate:sync:doctor` — verify diagnostics output

## 6. Verify Backward Compatibility

- [x] 6.1 Diff generated migration SQL from baresync against existing `apps/pos-app/drizzle/0000_parallel_blacklash.sql` — confirm sync_outbox, sync_cursors, sync_batch_requests table structures match
- [x] 6.2 Run existing sync tests: `bun test apps/api/src/sync/__test__/service.test.ts apps/pos-app/src/db/__test__/sync-schema.test.ts`
- [x] 6.3 Run `cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib sync::` — confirm old Rust sync module still compiles and passes tests
- [x] 6.4 Run `bun x ultracite check` — confirm no lint errors

## 7. Add Generate Script to Tauri Build

- [x] 7.1 Add `beforeBuildCommand` and `beforeDevCommand` to `apps/pos-app/src-tauri/tauri.conf.json` pointing to `bun run generate:sync`
- [x] 7.2 Add `migrations/*.sql` to `bundle.resources` in `tauri.conf.json`
- [x] 7.3 Verify the contract JSON path in `include_str!` (will be used in Phase 2) is correct relative to `lib.rs`

## 8. Documentation and Cleanup

- [x] 8.1 Update `AGENTS.md` — add `bun run generate:sync` to sync schema commands
- [x] 8.2 Update `docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md` — note that baresync generator is the new standard
- [x] 8.3 Commit all changes with message: "feat(sync): install baresync foundation — schemas, config, contract generation"
