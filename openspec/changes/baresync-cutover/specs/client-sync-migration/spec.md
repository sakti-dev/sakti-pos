## ADDED Requirements

### Requirement: Client sync uses createSyncClient
The `apps/pos-app/src/store/sync.ts` file SHALL be replaced with `createSyncClient` from `baresync`, providing `startPolling`, `stopPolling`, `sync_now`, and `writeTransaction` + `writeLocalChange` for outbox management.

#### Scenario: Sync client is initialized with scope
- **WHEN** the app starts
- **THEN** `createSyncClient` is called with `SYNC_SCOPE` from `sync-constants.ts`

#### Scenario: Polling starts on app initialization
- **WHEN** the app reaches the authenticated state
- **THEN** `startPolling` is called with the correct scope ID

#### Scenario: On-demand sync works
- **WHEN** user triggers manual sync
- **THEN** `sync_now` is called and returns a result

### Requirement: Client database uses createTauriDrizzleDatabase
The `apps/pos-app/src/db/index.ts` file SHALL be replaced with `createTauriDrizzleDatabase` from `baresync/tauri`, with a TABLE registry of all synced and runtime tables.

#### Scenario: Database proxy is created
- **WHEN** the app imports `db` from `./db`
- **THEN** a Drizzle instance is returned backed by the baresync plugin's `run_sql` command

#### Scenario: TABLE registry includes all tables
- **WHEN** `TABLE` is accessed
- **THEN** it contains entries for all synced tables (merchants, outlets, registers, staff, categories, assets, products, outletProducts, orders, orderItems) plus runtime tables (localAssetCache, pendingAssetProcessingJobs, pendingProductPhotoJobs)

### Requirement: Sync outbox uses writeTransaction pattern
The `apps/pos-app/src/db/sync-outbox.ts` file SHALL be deleted. All syncable writes SHALL use `writeTransaction` + `writeLocalChange` from the sync client.

#### Scenario: Insert uses writeTransaction
- **WHEN** code inserts a synced row
- **THEN** it uses `client.writeTransaction(db, async (tx) => { await client.writeLocalChange(tx, { table, rowId, operation: "insert", write: ... }) })`

#### Scenario: Update uses writeTransaction
- **WHEN** code updates a synced row
- **THEN** it uses `client.writeTransaction(db, async (tx) => { await client.writeLocalChange(tx, { table, rowId, operation: "update", write: ... }) })`

#### Scenario: Soft delete uses writeTransaction
- **WHEN** code soft-deletes a synced row
- **THEN** it uses `client.writeTransaction(db, async (tx) => { await client.writeLocalChange(tx, { table, rowId, operation: "update", write: ... }) })` with `deletedAt` set

### Requirement: Sync status uses baresync events
The sync status tracking SHALL use `baresync://data-changed` and `baresync://sync-status-changed` events from the plugin.

#### Scenario: Data changes trigger UI updates
- **WHEN** sync completes and data changes
- **THEN** `baresync://data-changed` event fires and React Query invalidates caches

#### Scenario: Sync status is tracked
- **WHEN** sync cycle completes
- **THEN** `baresync://sync-status-changed` event fires and status signals update

### Requirement: No direct Drizzle writes for synced data
All writes to synced tables SHALL go through `writeTransaction` + `writeLocalChange`. Direct `db.insert`, `db.update`, or `db.delete` on synced tables SHALL NOT be used.

#### Scenario: Direct write is prevented
- **WHEN** code attempts `db.insert(TABLE.merchants).values({...})` without `writeTransaction`
- **THEN** the outbox is not populated and the change will not sync

#### Scenario: Batch writes use writeTransaction
- **WHEN** code needs to write multiple synced rows atomically
- **THEN** it uses `client.writeTransaction` with multiple `writeLocalChange` calls inside
