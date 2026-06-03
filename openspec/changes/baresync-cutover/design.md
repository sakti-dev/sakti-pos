## Context

The `baresync-foundation` change installed baresync packages, converted infrastructure schemas to helpers, and generated the sync contract. Now the codebase has two parallel sync implementations:

1. **Old custom code**: Rust sync module (~4,300 lines) + TypeScript server sync (~1,700 lines) + protobuf codecs (~650 lines)
2. **New baresync plugin**: Tauri plugin (Rust) + npm package (TS) that does the same thing with less code

The wire format coupling forces an atomic switch: the old server uses protobuf encoding, the new plugin uses JSON encoding. The server cannot serve both formats simultaneously, so client and server must switch in the same deployment.

This change replaces all custom sync code with the baresync plugin.

## Goals / Non-Goals

**Goals:**
- Replace custom Rust sync module with `tauri-plugin-baresync` builder configuration
- Replace custom TypeScript server sync with `createDrizzleSyncRepository` and baresync route factories
- Replace custom client sync orchestrator with `createSyncClient` from `baresync`
- Replace all `recordLocalChange()` calls with `writeTransaction` + `writeLocalChange` pattern
- Remove `syncMeta` and `syncClientIdentity` tables (baresync manages these internally)
- Remove protobuf infrastructure (`prost`, `prost-build`, `protoc-bin-vendored`, `packages/protobuf/`, `packages/sync-proto-generator/`)
- Preserve all existing business behavior and sync semantics

**Non-Goals:**
- Add new synced tables or change scope mappings
- Change sync frequency or polling behavior
- Modify the API URL paths (`/api/sync/push`, `/api/sync/pull`, `/api/sync/status`)
- Add conflict resolution (server-wins remains the strategy)
- Performance optimization beyond what baresync provides by default

## Decisions

### 1. Atomic client-server switch

**Decision:** Replace client and server sync code in the same change, deployed together.

**Why:** Wire format coupling — old server uses protobuf, new plugin uses JSON. The server cannot serve both formats simultaneously. A gradual migration (server first, then client) would require maintaining two wire formats on the server, which is complex and error-prone.

**Alternative considered:** Server-first migration with protobuf adapter layer. Rejected because it adds temporary complexity that must be removed later, and the adapter layer would need to handle both formats correctly during the transition period.

### 2. Plugin builder configuration in lib.rs

**Decision:** Add `tauri-plugin-baresync` via `BaresyncBuilder::new()` in `lib.rs` with `include_str!` for the contract JSON.

**Why:** The plugin handles everything internally: SQLite connection, WAL mode, foreign keys, migration runner, outbox management, polling loop, event emission. We just configure it.

```rust
use tauri_plugin_baresync::builder::Builder as BaresyncBuilder;

BaresyncBuilder::new()
    .api_base_url("http://127.0.0.1:3001")
    .db_path("baresync.db")
    .contract_json(include_str!("../../../../packages/database/generated/sync-contract.json"))
    .migrations_path("migrations")
    .poll_interval_secs(30)
    .poll_on_background(false)
    .build()
```

**Key details:**
- `db_path("baresync.db")` → relative path resolves to app data dir
- `migrations_path("migrations")` → bundled `.sql` files as Tauri resources
- `include_str!` path is relative to `lib.rs` location

### 3. Server sync using Drizzle repository

**Decision:** Replace `apps/api/src/sync/service.ts` (1,079 lines) with `createDrizzleSyncRepository` from `baresync/server/drizzle`.

**Why:** The repository pattern provides the same 5 functions per table (`buildRow`, `readLatestRow`, `readRows`, `softDeleteRow`, `upsertRow`) that we currently implement manually. The factory handles cursor calculation, scope filtering, and change ordering.

**Scope mapping:** The `resolveScope` function returns `{ scopeId, merchantId }` to handle both merchant-scoped and outlet-scoped tables. The scope ID is the primary key for cursor tracking.

### 4. Server routes using factory handlers

**Decision:** Replace `apps/api/src/sync/routes.ts` (232 lines) with `createSyncPushHandler`, `createSyncPullHandler`, `createSyncStatusHandler` from `baresync/server`.

**Why:** The factory handlers provide the same endpoint semantics (push, pull, status) with built-in idempotency, chunking, and error mapping. We just wire up the callbacks.

**URL preservation:** Endpoints remain at `/api/sync/push`, `/api/sync/pull`, `/api/sync/status` — no frontend URL changes needed.

### 5. Client sync using createSyncClient

**Decision:** Replace `apps/pos-app/src/store/sync.ts` (432 lines) and `apps/pos-app/src/db/sync-outbox.ts` (163 lines) with `createSyncClient` from `baresync`.

**Why:** The client provides `writeTransaction` + `writeLocalChange` for outbox management, `startPolling` for background sync, and `sync_now` for on-demand sync. This replaces our custom orchestrator.

### 6. Database proxy using createTauriDrizzleDatabase

**Decision:** Replace `apps/pos-app/src/db/index.ts` (71 lines) with `createTauriDrizzleDatabase` from `baresync/tauri`.

**Why:** The factory creates a Drizzle instance backed by the plugin's `run_sql` command, with a TABLE registry for type-safe access. Same functionality, less boilerplate.

### 7. Remove syncMeta and syncClientIdentity tables

**Decision:** Remove both tables from the local schema. Baresync manages client identity internally via `sync_client_identity` and uses `sync_cursors` for per-scope tracking.

**Why:** The old Rust module reads these tables, but it's being deleted. The new plugin manages its own identity and cursor state.

### 8. Keep old migration files

**Decision:** Keep existing `apps/pos-app/drizzle/0000_parallel_blacklash.sql` and add new baresync migration files alongside it.

**Why:** The plugin's migration runner tracks applied migrations by hash in `__drizzle_migrations`. Existing migrations are already applied; new ones handle the schema changes (removing `syncMeta`, `syncClientIdentity`).

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Atomic switch breaks sync if any piece is misconfigured | Test full sync cycle locally before deploying; verify push/pull/status endpoints work with JSON encoding |
| `writeTransaction` + `writeLocalChange` pattern is different from `recordLocalChange` | Systematic search-and-replace; each call site is a small, isolated change |
| Plugin migration runner may conflict with existing Drizzle migrations | Use separate migration files; plugin tracks its own state in `__drizzle_migrations` |
| `include_str!` path may break if directory structure changes | Document the expected path; add build-time verification |
| Server scope resolution must handle both merchant and outlet scopes | Test with both scope types; verify cursor tracking works correctly |
| Removing `syncMeta` may break per-table sync frequency tracking | Baresync uses `sync_cursors` for this; verify the plugin provides equivalent visibility |

## Migration Plan

1. **Pre-deployment:** Verify baresync foundation is complete (schemas, config, contract generated)
2. **Deploy server first:** Replace server sync code, verify push/pull/status endpoints work with JSON encoding
3. **Deploy client:** Replace client sync code, verify polling and on-demand sync work
4. **Verify:** Run full sync cycle with both merchant-scoped and outlet-scoped data
5. **Rollback:** If issues, revert to previous commit (old code still works)

**Rollback strategy:** Since this is an atomic switch, rollback means reverting the entire change. The old code is removed in this change, so there's no partial rollback — it's all or nothing.

## Open Questions

1. **Migration file ordering:** Should we generate a single migration file for all schema changes, or separate files per change?
2. **Plugin db_path:** Should we use `"baresync.db"` (new file) or the existing database path? Using a new file means existing data must be migrated.
3. **Poll interval:** Should we keep the current 5-minute interval or use the plugin's default 30 seconds?
