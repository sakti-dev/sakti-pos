## Why

Sakti POS has a custom sync infrastructure (~4,300 lines of Rust + ~1,700 lines of TypeScript) that was extracted into a published plugin (`baresync` npm v0.2.3, `tauri-plugin-baresync` Cargo v0.2.0). The published plugin formalizes the same patterns already used in this codebase. This change installs the baresync packages, converts schemas to use baresync helpers, generates the sync contract, and creates migration files — all without breaking the existing sync pipeline. The old custom code continues to run until the coordinated cutover change.

## What Changes

- **Add** `baresync` npm package (v0.2.3) to POS app and API
- **Add** `tauri-plugin-baresync` Rust crate (v0.2.0) and `env_logger` to POS app
- **Create** `SYNC_SCOPE` constant shared between client and server
- **Create** `sync.config.ts` using `defineSyncConfig` from `baresync/generator` with all 10 synced tables and their scope column mappings
- **Add** `generate:sync` script to root `package.json`
- **Convert** `packages/database/src/local-schema.ts` infrastructure tables (`syncOutbox`, `syncCursors`) to use `createSyncOutboxTable()` and `createSyncCursorsTable()` from `baresync/schema`
- **Convert** `packages/database/src/api-schema.ts` infrastructure table (`syncBatchRequests`) to use `createSyncBatchRequestsTable()` from `baresync/schema`
- **Generate** `sync-contract.json`, `sync-table-order.ts`, and `sync-contract.manifest.json` via `bun run generate:sync`
- **Create** migration SQL files compatible with the baresync plugin's migration runner
- **Remove** `syncClientIdentity` table from local schema (baresync manages client identity internally)
- **Remove** `syncMeta` table from local schema (baresync uses `syncCursors` instead)
- Keep old sync code (`apps/pos-app/src-tauri/src/sync/*`, `apps/api/src/sync/*`) running — zero runtime changes

## Capabilities

### New Capabilities

- `sync-contract-generation`: Sync contract generator that produces `sync-contract.json` from paired Drizzle schemas, used by the baresync Tauri plugin at compile time via `include_str!`
- `baresync-schema-helpers`: Drizzle schema helpers (`localSyncColumns`, `apiSyncColumns`, `createSyncOutboxTable`, `createSyncCursorsTable`, `createSyncBatchRequestsTable`) that standardize infrastructure table shapes across all baresync consumers

### Modified Capabilities

None. This change is purely additive — no existing requirement-level behavior changes.

## Impact

- **Schema files**: `packages/database/src/local-schema.ts`, `packages/database/src/api-schema.ts` — column shapes must stay identical after conversion to baresync helpers (the old Rust sync module reads these tables directly)
- **Dependencies**: New npm dependency `baresync@0.2.3` in `apps/pos-app/package.json` and `apps/api/package.json`; new Cargo dependency `tauri-plugin-baresync = "0.2.0"` and `env_logger = "0.11"` in `apps/pos-app/src-tauri/Cargo.toml`
- **Build scripts**: New `generate:sync` script in root `package.json`; new `beforeBuildCommand` / `beforeDevCommand` in `tauri.conf.json` (optional, can be added in cutover)
- **Generated artifacts**: `packages/database/generated/` directory with contract JSON, table order TS, and manifest — these are new files, not replacing anything yet
- **No runtime changes**: The existing Rust sync module, API routes, and JS sync orchestrator continue to operate unchanged during this phase
