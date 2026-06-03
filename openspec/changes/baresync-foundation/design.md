## Context

Sakti POS has a custom offline-first sync system built over several weeks. The core patterns (outbox, cursors, row-state sync, idempotency, chunking) were extracted into a published baresync plugin (npm `baresync@0.2.3`, Cargo `tauri-plugin-baresync@0.2.0`). This change installs the plugin infrastructure alongside the existing custom code, converts Drizzle schemas to use baresync helpers, and generates the sync contract — without breaking the running system.

The existing codebase has:
- 10 synced tables (merchants, outlets, registers, staff, categories, assets, products, outletProducts, orders, orderItems)
- Dual scope model: merchant-scoped tables (assets, categories, merchants, products, outlets, staff) and outlet-scoped tables (orderItems, orders, outletProducts, registers)
- Custom Rust sync module (~4,300 lines) using protobuf encoding
- Custom TypeScript server sync (~1,700 lines) using protobuf codecs
- Custom outbox management with operation coalescing

This change is Phase 1 of a 2-phase conversion. Phase 2 (baresync-cutover) will replace all custom sync code with the plugin.

## Goals / Non-Goals

**Goals:**
- Install baresync npm and Rust packages into the workspace
- Create `sync.config.ts` that defines all 10 synced tables with correct scope column mappings
- Convert `syncOutbox`, `syncCursors`, and `syncBatchRequests` schema definitions to use baresync helpers (`createSyncOutboxTable`, `createSyncCursorsTable`, `createSyncBatchRequestsTable`)
- Generate `sync-contract.json` that the plugin will consume at compile time via `include_str!`
- Generate `sync-table-order.ts` with upsert/delete ordering
- Create migration SQL files compatible with the plugin's migration runner
- Verify the generated contract matches expected table shapes and scope mappings

**Non-Goals:**
- Replace the existing Rust sync module (Phase 2)
- Replace server routes or service layer (Phase 2)
- Switch from protobuf to JSON wire encoding (Phase 2)
- Convert `recordLocalChange` calls to `writeTransaction` + `writeLocalChange` (Phase 2)
- Change runtime behavior or sync semantics
- Remove the `syncMeta` table or `syncClientIdentity` table yet — these are still read by the old Rust module

## Decisions

### 1. Schema column shape compatibility

**Decision:** The baresync helpers (`createSyncOutboxTable`, etc.) MUST produce the exact same column names and types as the current manual table definitions.

**Why:** The existing Rust sync module (`apps/pos-app/src-tauri/src/sync/*`) directly queries `sync_outbox`, `sync_cursors`, and `sync_client_identity` tables using `sqlx`. If column names differ, the old code breaks. We cannot change the schema until the Rust module is replaced in Phase 2.

**Action:** After converting schemas, run `bun run generate:sync` and compare the generated migration SQL against the existing `apps/pos-app/drizzle/0000_parallel_blacklash.sql`. If baresync helpers produce different column shapes, either:
- Add column aliases in the baresync schema (if the plugin supports them)
- Keep the manual schema definitions and only convert to baresync helpers when the Rust module is removed in Phase 2

### 2. Keeping syncMeta and syncClientIdentity during foundation phase

**Decision:** Keep `syncMeta` and `syncClientIdentity` table definitions in `local-schema.ts` unchanged during this phase.

**Why:** The Rust sync module reads these tables (`local_state.rs:112`, `client_identity.rs:53`). Removing them would break the running sync pipeline. They will be removed or migrated in Phase 2.

**Scope:** These tables are NOT converted to baresync helpers in this phase. They remain as manual Drizzle table definitions.

### 3. Scope column mapping strategy

**Decision:** Map scope columns in `sync.config.ts` using the current `SYNC_TABLE_SCOPE` from `apps/api/src/sync/service.ts:47-61`.

**Mapping:**
| Table | Scope Column | Scope Type |
|-------|-------------|------------|
| merchants | `id` | merchant |
| outlets | `merchantId` | merchant |
| registers | `outletId` | outlet |
| staff | `merchantId` | merchant |
| categories | `merchantId` | merchant |
| assets | `merchantId` | merchant |
| products | `merchantId` | merchant |
| outletProducts | `outletId` | outlet |
| orders | `outletId` | outlet |
| orderItems | `outletId` | outlet |

**Why:** This matches the existing server-side tenant scoping. The `resolveScope` function in Phase 2 will return `{ scopeId, merchantId }` to handle both scope types.

### 4. No runtime changes during foundation

**Decision:** This phase adds infrastructure only. The existing sync pipeline (Rust module → protobuf → Elysia routes → service.ts → push adapters) continues to operate.

**Why:** Minimizes risk. Each phase leaves the system in a fully working state. The generated contract is validated but not yet consumed by the runtime.

### 5. Migration file format

**Decision:** Create migration SQL files that match the baresync plugin's expected format (one `.sql` file per migration, sorted by filename, with `--> statement-breakpoint` separators).

**Why:** The plugin's migration runner discovers and applies `.sql` files from a configured path. The files must be compatible with both Drizzle Kit output format and the plugin's runner.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Baresync helpers produce different column shapes than current manual tables | Verify generated SQL matches existing migration; keep manual definitions if incompatible |
| Generating contract while old code still runs creates confusion about which is "truth" | Document that generated contract is for Phase 2 consumption only; old code ignores it |
| `syncMeta` table removal in Phase 2 may break per-table sync tracking | Audit all usages before Phase 2; migrate to `syncCursors` or keep as local-only table |
| Baresync npm package may have breaking changes between 0.2.3 and future versions | Pin version; the plugin is published by this project so we control the release |
| `syncClientIdentity` removal in Phase 2 may affect idempotency | Baresync manages client identity internally; verify the plugin's identity mechanism before removing |
