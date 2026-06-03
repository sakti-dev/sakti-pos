## ADDED Requirements

### Requirement: localSyncColumns helper produces standard local sync metadata
The `localSyncColumns()` function from `baresync/schema` SHALL return Drizzle columns for local sync metadata: `deletedAt` (text), `isSynced` (integer boolean), `createdAt` (text), `updatedAt` (text).

#### Scenario: Column definitions match expected shapes
- **WHEN** developer imports `localSyncColumns` from `baresync/schema`
- **THEN** returned object contains `deletedAt`, `isSynced`, `createdAt`, `updatedAt` columns with correct types

#### Scenario: Default values are set
- **WHEN** `localSyncColumns()` is spread into a `sqliteTable` definition
- **THEN** `isSynced` defaults to `false`, `createdAt` and `updatedAt` use `$defaultFn` returning ISO timestamp

### Requirement: apiSyncColumns helper produces standard API sync metadata
The `apiSyncColumns()` function from `baresync/schema` SHALL return Drizzle columns for API sync metadata: `deletedAt` (text), `syncUpdatedAt` (integer), `createdAt` (text), `updatedAt` (text).

#### Scenario: Column definitions match expected shapes
- **WHEN** developer imports `apiSyncColumns` from `baresync/schema`
- **THEN** returned object contains `deletedAt`, `syncUpdatedAt`, `createdAt`, `updatedAt` columns with correct types

#### Scenario: syncUpdatedAt has default value
- **WHEN** `apiSyncColumns()` is spread into a `sqliteTable` definition
- **THEN** `syncUpdatedAt` defaults to `0`

### Requirement: createSyncOutboxTable produces compatible outbox schema
The `createSyncOutboxTable()` function from `baresync/schema` SHALL create a Drizzle table definition with columns: `id` (text PK), `tableName` (text), `rowId` (text), `operation` (text), `changedAt` (text), `syncedAt` (text nullable), and a partial unique index on `(tableName, rowId) WHERE syncedAt IS NULL`.

#### Scenario: Table name is sync_outbox
- **WHEN** `createSyncOutboxTable()` is called
- **THEN** resulting table maps to SQL table name `sync_outbox`

#### Scenario: Unique index prevents duplicate pending entries
- **WHEN** two outbox entries exist for the same `(tableName, rowId)` with `syncedAt IS NULL`
- **THEN** database rejects the second insert with a unique constraint violation

### Requirement: createSyncCursorsTable produces compatible cursors schema
The `createSyncCursorsTable()` function from `baresync/schema` SHALL create a Drizzle table definition with columns: `scopeId` (text PK), `lastServerWatermark` (text nullable), `updatedAt` (text).

#### Scenario: Table name is sync_cursors
- **WHEN** `createSyncCursorsTable()` is called
- **THEN** resulting table maps to SQL table name `sync_cursors`

#### Scenario: Primary key is scopeId
- **WHEN** `createSyncCursorsTable()` is called
- **THEN** `scopeId` column is the primary key

### Requirement: createSyncBatchRequestsTable produces compatible batch requests schema
The `createSyncBatchRequestsTable()` function from `baresync/schema` SHALL create a Drizzle table definition with columns: `id` (integer PK autoincrement), `clientId` (text), `idempotencyKey` (text), `requestHash` (text), `responseJson` (text), `serverTime` (text), `createdAt` (text), `updatedAt` (text), and a unique index on `(clientId, idempotencyKey)`.

#### Scenario: Table name is sync_batch_requests
- **WHEN** `createSyncBatchRequestsTable()` is called
- **THEN** resulting table maps to SQL table name `sync_batch_requests`

#### Scenario: Unique index on client and idempotency key
- **WHEN** two batch request entries exist for the same `(clientId, idempotencyKey)`
- **THEN** database rejects the second insert with a unique constraint violation

### Requirement: Converted schemas maintain backward compatibility with existing Rust sync module
After converting infrastructure tables to baresync helpers, the generated Drizzle schema SHALL produce identical SQL table structures (column names, types, constraints, indexes) as the current manual definitions.

#### Scenario: Column names are identical
- **WHEN** schemas are converted from manual definitions to baresync helpers
- **THEN** Drizzle generates SQL with identical column names for `sync_outbox`, `sync_cursors`, and `sync_batch_requests` tables

#### Scenario: Indexes are identical
- **WHEN** schemas are converted
- **THEN** Drizzle generates SQL with identical index definitions (names may differ, but uniqueness constraints match)

#### Scenario: Old Rust sync module continues to work
- **WHEN** schemas are converted and app is built
- **THEN** the existing Rust sync module (`apps/pos-app/src-tauri/src/sync/*`) can still read and write all sync infrastructure tables without errors
