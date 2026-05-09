# POS Smart Sync Strategy

Date: 2026-05-09

This note documents the current smart sync strategy for the POS app and API.

## Goal

Manual/startup sync should avoid unnecessary table reads and writes:

```text
local state + server status
-> no local changes + no server changes = skip
-> local changes + no server changes = push only
-> no local changes + server changes = event pull only
-> both changed or cursor expired = full sync
```

The existing row tables remain the source of truth. The new event/outbox tables are compact metadata used to decide what work is necessary.

## Local POS Tables

`sync_outbox` records compact local row changes:

- `table_name`
- `row_id`
- `operation`
- `scope_type`
- `scope_id`
- `changed_at`
- `synced_at`

Local writes coalesce pending events per row. For example, repeated updates stay as one pending update, and insert then delete before sync removes the outbox entry.

`sync_cursors` stores the latest server event cursor for an outlet scope:

```text
scope_type = outlet
scope_id = selected outlet id
last_server_event_id = latest API sync_events.id applied locally
```

`is_synced` still exists for compatibility. Native local-state detection counts both `sync_outbox` and legacy `is_synced = 0` rows so older write paths are not skipped.

## API Event Table

`sync_events` stores compact server-side change metadata:

- `scope_type`: `merchant` or `outlet`
- `scope_id`
- `table_name`
- `row_id`
- `operation`
- `changed_at`

It intentionally does not store full payloads. Event pull materializes the current row snapshot from source tables. Soft-deleted rows must remain available until event retention expires so delete events can still be materialized.

Events are written from:

- `/api/sync/push` for accepted client changes.
- Direct cloud writes such as merchant/outlet/register/staff creation or updates.

## POS Decision Flow

`apps/pos-app/src/store/sync.ts` runs:

1. `get_sync_local_state` Tauri command.
2. `GET /api/sync/status?outletId=...&lastServerEventId=...`.
3. Chooses one native transfer command:

```text
skipped    -> no native transfer
push_only  -> sync_push_outbox
pull_only  -> sync_pull_events
full       -> sync_now or sync_full_resync
```

`sync_full_resync` is used when the server says `needsFullResync = true`; it runs the full sync and then updates the local server event cursor to the API `latestEventId`.

## API Status And Event Pull

`GET /api/sync/status` returns:

- `hasChanges`
- `latestEventId`
- `oldestAvailableEventId`
- `needsFullResync`
- `changedTables`

A cursor is expired only when the next required event is missing:

```text
lastServerEventId + 1 < oldestAvailableEventId
```

`GET /api/sync/pull-events` returns current snapshots for rows referenced by events after the client cursor. Repeated events for the same row are coalesced into one row snapshot.

## Retention And Cleanup

API cleanup lives in `apps/api/src/lib/sync-cleanup.ts`.

Manual cleanup command:

```bash
cd apps/api
bun run sync:cleanup
```

Default retention is 30 days and can be overridden:

```bash
SYNC_EVENT_RETENTION_DAYS=45 bun run sync:cleanup
```

Cleanup deletes:

- Expired `sync_events`.
- Expired soft-deleted non-transactional rows from catalog/config tables.

Cleanup must not hard-delete:

- `orders`
- `order_items`

Those transaction tables need a separate archival policy.

## Operational Notes

After API schema changes, push the API database schema used by the running API:

```bash
cd apps/api
bun run db:push
```

After local SQLite schema changes, rebuild/reinstall the Android app.

Useful Android logcat filter:

```bash
adb logcat -c && adb logcat -s "Tauri/Console:*" "RustStdoutStderr:*" | grep -E "\[SYNC-DEBUG\]|\[CLOUD-AUTH\]|\[CLOUD-LOGIN\]|\[AUTH\]|FAILED|Failed|Error"
```

## Known Caveats

- `sync_push_outbox` currently reuses the existing full row push serializer and then marks pending outbox entries as synced. This is compatible but not the final lowest-read implementation.
- Push responses do not yet return a server event cursor, so a push-only sync may be followed by a later event pull of the client’s own accepted changes.
- Rust unit tests could not be linked in the current environment because no C linker (`cc`, `gcc`, or `clang`) is installed.
