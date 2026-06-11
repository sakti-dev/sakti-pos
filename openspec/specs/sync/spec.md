# Sync

## Purpose

Sakti POS uses bidirectional cloud sync powered by the `baresync` plugin to keep an offline-first Android POS app and a cloud API server in eventual consistency. Local SQLite changes are tracked in a sync outbox, pushed to the server in idempotent batches, and server changes are pulled incrementally using row-state watermarks. Each synced table carries a `sync_updated_at` timestamp that serves as the server-side watermark for incremental pulls. The sync scope determines which rows a device can see — typically an outlet ID or merchant ID — and a new scope triggers a full resync.

## Requirements

### R1: Baresync Plugin Architecture

-The system SHALL use the `baresync` npm package (v0.4.2) and `tauri-plugin-baresync` Rust crate (v0.4.2) for sync infrastructure. Wire encoding SHALL be JSON (not protobuf).

- The client uses `createSyncClient` from `baresync/tauri` to create a `SyncClient` instance.
- The server uses `createSyncServer` from `baresync/server` for route handlers (push, pull, status).
- The server uses `createDrizzleSyncRepository` from `baresync/server/drizzle` for the data access layer.
- The client uses `createTauriDrizzleDatabase` from `baresync/db` for local SQLite access.

**WHEN** the sync client is created
**THEN** it receives a `scopeId` and `invoke` function, and exposes `syncNow()`, `startPolling()`, `stopPolling()`, `writeTransaction()`, `enqueueChange()`, `writeLocalChange()`, and `getState()` methods.

**WHEN** the sync repository is created
**THEN** it receives a table map where each table defines `buildRow`, `readLatestRow`, `readRows`, `softDeleteRow`, and `upsertRow` functions.

### R2: Synced Tables and Scope Mapping

The system SHALL sync exactly 10 business tables between POS and API. Each table SHALL have a `scopeColumn` that determines which rows belong to a given scope.

| Table | Scope Column | Scope Type |
|-------|-------------|------------|
| merchants | id | merchant |
| outlets | merchantId | merchant |
| registers | outletId | outlet |
| staff | merchantId | merchant |
| categories | merchantId | merchant |
| assets | merchantId | merchant |
| products | merchantId | merchant |
| outletProducts | outletId | outlet |
| orders | outletId | outlet |
| orderItems | outletId | outlet |

**WHEN** a sync contract is generated via `baresync/generator`
**THEN** the contract SHALL encode table names, column definitions, scope column mappings, and table ordering for both local and API schemas.

### R3: Sync Metadata Columns

Every synced table on both local and API sides SHALL carry sync metadata columns:

- Local schema: uses `localSyncColumns()` from `baresync/schema` (includes `isSynced`, `deletedAt`, `createdAt`, `updatedAt`).
- API schema: uses `apiSyncColumns()` from `baresync/schema` (includes `syncUpdatedAt`, `deletedAt`, `createdAt`, `updatedAt`).

**WHEN** a row is inserted, updated, or conflict-upserted on the API
**THEN** the system SHALL set `syncUpdatedAt` to the current server timestamp (millisecond epoch).

**WHEN** a row is soft-deleted on the API
**THEN** the system SHALL set `deletedAt` and `syncUpdatedAt` to the current server timestamp, but SHALL NOT physically remove the row.

### R4: Row-State Watermarks

The system SHALL use row-state watermarks (the `sync_updated_at` column) as the only incremental sync model. The system SHALL NOT use event-id cursors or `sync_events` tables.

- API rows carry `syncUpdatedAt` as a numeric millisecond timestamp.
- POS pull cursors store opaque row-state watermarks per table in `sync_cursors`.
- Full resync SHALL start from an empty cursor (timestamp 0), not from the locally stored cursor.

**WHEN** a pull completes successfully
**THEN** the system advances the local cursor watermark to the server's reported `server_time`.

**WHEN** a full resync is requested
**THEN** the system resets the cursor to 0 and pulls all rows from the beginning.

### R5: Push Flow (Local Changes → Server)

The system SHALL push local changes to the server via `POST /api/sync/push`.

- Local writes are wrapped in `writeTransaction` + `enqueueChange` / `writeLocalChange`, which records the change in `sync_outbox`.
- The push handler batches outbox rows, sends them to the server, and marks acknowledged rows as synced.
- Rejected rows remain dirty/pending in the outbox for future retry.

**WHEN** the POS app performs a local write (insert, update, or soft-delete)
**THEN** the system SHALL wrap the write in `writeTransaction`, execute the Drizzle write operation, and call `enqueueChange` to record the table, row ID, and operation in `sync_outbox`.

**WHEN** a push batch is sent to the server
**THEN** the server SHALL apply each row change via `upsertRow` or `softDeleteRow`, update `syncUpdatedAt`, and return the list of accepted and rejected row IDs.

**WHEN** the server accepts a row in a push batch
**THEN** the client marks the corresponding outbox entry as synced (sets `synced_at`).

**WHEN** the server rejects a row in a push batch
**THEN** the outbox entry remains pending, and the row stays marked as `isSynced: false` locally.

### R6: Pull Flow (Server Changes → Local)

The system SHALL pull server changes to local via `POST /api/sync/pull`.

- Pulls are cursor-paged by row-state watermark with a bounded page size (default 1000 rows).
- The pull handler queries rows where `syncUpdatedAt > cursor` for each table, ordered by `syncUpdatedAt ASC, id ASC`.
- Received rows are upserted into local SQLite via `ON CONFLICT DO UPDATE`.

**WHEN** a pull is initiated
**THEN** the system reads the current cursor watermark for each table from `sync_cursors` and requests rows newer than that cursor.

**WHEN** a pull response returns rows
**THEN** the system upserts each row into local SQLite and advances the local cursor to the response's `server_time`.

**WHEN** a pull response returns zero rows for all tables
**THEN** the sync mode is `NoOp` and no local state changes.

**WHEN** a pull receives a soft-deleted row (`deletedAt` is set)
**THEN** the system upserts the row locally, preserving the `deletedAt` timestamp so the row appears deleted in local queries.

### R7: Idempotent Push Batches

The system SHALL use client-scoped idempotency keys for push batches to prevent double-application on retries.

- The idempotency key is scoped to the POS installation (`clientId`), not the outlet.
- The server stores the request hash, cached response JSON, server time, and request timestamps in `sync_batch_requests`.
- Subsequent pushes with the same idempotency key return the cached response.

**WHEN** a push request arrives with an idempotency key that has a cached response
**THEN** the server returns the cached response without re-applying the changes.

**WHEN** a push request arrives with a new idempotency key
**THEN** the server processes the batch, stores the response in `sync_batch_requests`, and returns the result.

**WHEN** multiple devices in the same outlet sync concurrently
**THEN** each device uses its own idempotency key namespace, so they do not interfere with each other.

### R8: Scope Resolution

The server SHALL resolve the sync scope from the `scopeId` sent by the client. Scope resolution supports two levels: merchant ID and outlet ID.

- If `scopeId` matches a merchant ID, the scope type is `merchant`.
- If `scopeId` matches an outlet ID, the scope is resolved to the outlet's parent merchant, and the scope type is `outlet`.
- If `scopeId` matches neither, the server returns HTTP 404.

**WHEN** the client sends a `scopeId` that is a merchant ID
**THEN** the server resolves it as a merchant scope and returns `{ merchantId, scopeType: "merchant" }`.

**WHEN** the client sends a `scopeId` that is an outlet ID
**THEN** the server looks up the outlet's `merchant_id` and returns `{ merchantId, scopeType: "outlet" }`.

**WHEN** the client sends a `scopeId` that does not exist
**THEN** the server returns HTTP 404 with `{ error: "Scope not found" }`.

### R9: Sync Scope Lifecycle

The sync scope SHALL be managed via a reactive signal (`scopeId`) backed by localStorage.

- The scope is set during cloud login or device pairing via `setScope(id)`.
- The scope is cleared on logout via `clearScope()`.
- The `SyncClientProvider` reacts to scope changes by destroying the old client and creating a new one.

**WHEN** the scope changes (login, logout, outlet switch)
**THEN** the `SyncClientProvider` destroys the old `SyncClient` (calls `stopPolling()`), creates a new `SyncClient` with the new `scopeId`, and starts polling.

**WHEN** the scope is null (no outlet selected)
**THEN** no sync client is created and no sync operations run.

**WHEN** the user logs out
**THEN** the system clears the scope, stops polling, and destroys the sync client.

### R10: Provider-Owned Sync Client

The `SyncClientProvider` SHALL own the sync client lifecycle and wire it into the SolidJS reactive context.

- The provider creates a `SyncClient` via `createSyncClient({ scopeId, invoke })`.
- The provider stores the client in a SolidJS context (`SyncClientContext`).
- Components access the client via `useSyncClient()`.
- A module-level singleton (`lib/sync.ts`) exposes `getSyncClient()` for non-component code.

**WHEN** the provider mounts with a valid scope
**THEN** it creates a `SyncClient`, calls `startPolling()`, and registers event listeners for `baresync://data-changed` and `baresync://sync-status-changed`.

**WHEN** the provider unmounts or scope changes
**THEN** it calls `stopPolling()`, unregisters event listeners, and clears the module-level singleton.

### R11: Sync Status Signals

The system SHALL expose sync status via a reactive signal with four states: `idle`, `syncing`, `error`, `offline`.

- `idle`: sync is not active, no pending changes.
- `syncing`: a sync operation is in progress.
- `error`: the last sync failed with an authentication error (401/403).
- `offline`: the last sync failed with a network or server error.

**WHEN** a sync operation starts (manual or automatic)
**THEN** the status SHALL be set to `syncing`.

**WHEN** a sync operation completes successfully
**THEN** the status SHALL be set to `idle`.

**WHEN** a sync operation fails with a 401, 403, or auth error
**THEN** the status SHALL be set to `error`.

**WHEN** a sync operation fails with a non-auth error
**THEN** the status SHALL be set to `offline`.

**WHEN** the `baresync://sync-status-changed` event fires
**THEN** the provider checks `client.getState()` and sets status to `syncing` if `needs_baseline_sync` is true or `local_dirty_count > 0`, otherwise `idle`.

### R12: Sync Status UI Indicator

The system SHALL display a sync status indicator in the app header.

- The indicator shows different icons for idle (cloud), syncing (spinner), error (cloud-off, red), offline (cloud-off, muted), and pending uploads (cloud-upload, primary).
- The indicator SHALL be a button that triggers manual sync on click.
- Manual sync SHALL show a toast notification with the result summary.

**WHEN** sync status is `syncing`
**THEN** the indicator shows a spinning loader and the button is disabled.

**WHEN** sync status is `error`
**THEN** the indicator shows a red cloud-off icon.

**WHEN** sync status is `offline`
**THEN** the indicator shows a muted cloud-off icon.

**WHEN** sync status is `idle` with pending asset uploads
**THEN** the indicator shows a cloud-upload icon.

**WHEN** the user clicks the sync button while idle
**THEN** the system calls `syncNow()` and displays a success or error toast.

### R13: Startup Sync

The system SHALL perform a sync on app startup, with a timeout to avoid blocking the boot process.

- Startup sync runs during the bootstrap phase in `index.tsx`.
- The system races `runStartupSync()` against a 5-second timeout.
- If sync completes within the timeout, the app proceeds normally.
- If sync times out, the app proceeds anyway (data may be stale).
- If sync fails, the status is set to `offline` or `error`.

**WHEN** the app boots with a valid outlet context and session token
**THEN** the system runs `runStartupSync()` which calls `syncNow()`.

**WHEN** startup sync completes within 5 seconds
**THEN** the boot splash transitions to the app immediately.

**WHEN** startup sync takes longer than 5 seconds
**THEN** the boot splash transitions to the app and sync continues in the background.

**WHEN** startup sync fails
**THEN** the boot splash transitions to the app and sync status reflects the error.

### R14: Manual Sync

The system SHALL support manual sync triggered by the user via the sync status button.

- Manual sync calls `syncNow()` which runs the full sync cycle: process pending asset jobs, upload pending assets, then run baresync `syncNow()`.
- After sync, asset hydration runs in the background.
- Success shows a toast with row counts and table counts.

**WHEN** the user triggers manual sync
**THEN** the system processes pending asset processing jobs, uploads pending product images, runs the baresync sync cycle, and hydrates missing product images in the background.

**WHEN** manual sync completes
**THEN** the system shows a toast message in Indonesian: "Sinkronisasi berhasil (X diterima, Y tabel dikirim, Z dibersihkan)" for full sync, or variants for push-only/pull-only/no-op.

### R15: Cache Invalidation on Sync

The system SHALL invalidate all Drizzle-based UI queries when sync detects local data changes.

- The `baresync://data-changed` event fires when the baresync plugin writes synced data to local SQLite.
- The listener increments a `syncDataVersion` signal, which is included in all `useDrizzleQuery` keys.
- The listener also calls `queryClient.invalidateQueries({ queryKey: ["drizzle"] })`.

**WHEN** the baresync plugin emits `baresync://data-changed`
**THEN** the system increments `syncDataVersion` and invalidates all `@tanstack/solid-query` queries with the `["drizzle"]` key prefix.

**WHEN** a `useDrizzleQuery` consumer reads data
**THEN** the query key includes the current `syncDataVersion`, so a version bump forces a refetch.

### R16: Automatic Polling

The system SHALL poll for sync automatically via the baresync plugin's built-in polling mechanism.

- Polling is started by `client.startPolling()` in the `SyncClientProvider`.
- Polling interval is configured in the Rust plugin builder (`poll_interval_secs`).
- Polling continues in the background on Android.

**WHEN** the sync client starts polling
**THEN** the plugin periodically checks for pending outbox changes and server-side changes, triggering push or pull as needed.

**WHEN** the sync client stops polling
**THEN** no automatic sync operations occur until polling is restarted.

### R17: Asset Sync (Separate Pipeline)

The system SHALL handle asset (product image) sync separately from the baresync data pipeline.

- Asset uploads use S3 presigned URLs, not the sync push endpoint.
- Asset downloads use a local asset cache table (`local_asset_cache`).
- Asset processing jobs (`pending_asset_processing_jobs`) run before sync.
- Asset upload jobs (`pending_product_photo_jobs`) run before sync.
- Asset hydration (downloading missing images) runs after sync in the background.

**WHEN** a sync cycle starts
**THEN** the system first processes pending asset processing jobs, then uploads pending product images, then runs baresync data sync.

**WHEN** baresync data sync completes
**THEN** the system starts background hydration of missing product images.

### R18: Schema Compatibility and Version Gating

The system SHALL treat schema compatibility as an explicit rollout concern.

- Local SQLite migrations, API database schema changes, and sync behavior MUST be rolled out in an order that keeps older clients functional.
- Breaking schema changes MUST be documented before implementation.
- When a change requires coordinated API and app support, the system SHALL gate behavior through explicit compatibility checks or additive schema changes before removing old paths.

**WHEN** a schema change requires both API and app updates
**THEN** the change is deployed as an additive migration first, then the app is updated to use the new fields, and only then are old fields removed.

**WHEN** the POS app and API run different versions
**THEN** sync continues to function using only the intersection of supported fields.

### R19: Sync Contract Generation

The system SHALL generate a sync contract from paired local and API schemas using `baresync/generator`.

- The contract is defined in `packages/sync-contract/sync.config.ts`.
- Generated artifacts: `sync-contract.json`, `sync-table-order.ts`, `sync-contract.manifest.json`.
- The contract is checked via `bun run sync-proto:check` and written via `bun run generate:sync-proto:write`.

**WHEN** `bunx baresync generate` runs
**THEN** it reads the local and API synced schemas, validates column compatibility, and produces the sync contract and table ordering.

**WHEN** `bunx baresync generate --check` runs
**THEN** it verifies the generated artifacts are up to date and fails if they are stale.

### R20: Server-Side Push Application

The server SHALL apply push changes using `createDrizzleSyncRepository` with per-table `upsertRow` and `softDeleteRow` functions.

- `upsertRow` uses `INSERT ... ON CONFLICT DO UPDATE` to apply changes.
- `softDeleteRow` sets `deletedAt` and `syncUpdatedAt` without removing the row.
- `buildRow` validates and transforms raw push payloads, rejecting rows with missing required fields.
- Write chunking respects SQLite bind parameter limits (max 30,000 params per chunk).

**WHEN** the server receives a push batch
**THEN** it validates each row via `buildRow`, chunks writes to respect SQLite limits, applies via `upsertRow` or `softDeleteRow`, and returns accepted/rejected row IDs.

**WHEN** a row fails validation in `buildRow`
**THEN** the row is rejected and included in the response's rejected list.

### R21: Server-Side Pull Querying

The server SHALL query pull changes using row-state watermarks with bounded page sizes.

- Pull queries use `syncUpdatedAt > cursorTimestamp` to filter changed rows.
- Results are ordered by `syncUpdatedAt ASC, id ASC` for deterministic pagination.
- The default pull limit is 1000 rows per response.
- Pull responses include a `server_time` watermark for the client to advance its cursor.

**WHEN** the server receives a pull request with a cursor timestamp
**THEN** it queries each requested table for rows with `syncUpdatedAt > cursorTimestamp`, ordered by `syncUpdatedAt ASC, id ASC`, limited to the page size.

**WHEN** the pull response is constructed
**THEN** it includes the rows, the maximum `syncUpdatedAt` from the results as `server_time`, and a flag indicating whether more pages may exist.

### R22: No-Op Sync Detection

The system SHALL detect and skip unnecessary sync operations.

- If no outlet is selected, sync returns a no-op result.
- If no session token exists, sync throws an error.
- If there are no pending outbox changes and no server changes, the baresync plugin returns `NoOp` mode.

**WHEN** `syncNow()` is called without an outlet context
**THEN** the system returns `{ mode: "NoOp", pull: { rows_received: 0 }, push: { tables_synced: [] }, purged: 0 }`.

**WHEN** `syncNow()` is called without a session token
**THEN** the system throws "Sesi tidak ditemukan. Silakan login ulang."

### R23: Sync Result Format

The system SHALL return structured sync results from `syncNow()`.

- `mode`: One of `"NoOp"`, `"PullOnly"`, `"PushOnly"`, `"Full"`.
- `pull`: `{ rows_received: number, server_time: string }`.
- `push`: `{ server_time: string, server_wins_count: number, tables_synced: string[], rejected_tables?: string[] }`.
- `purged`: Number of outbox entries cleaned up.

**WHEN** sync completes
**THEN** the result includes the mode, pull statistics, push statistics, and purge count for logging and UI display.
