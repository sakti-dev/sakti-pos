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

Fresh app installs are a special baseline case. After cloud login and outlet selection, local storage may know the selected outlet while local SQLite still has no `outlets` row. In that state, `get_sync_local_state` returns `needs_baseline_sync = true` because it cannot resolve `merchant_id` locally yet. The POS app must run `sync_full_resync` instead of trying to count or push merchant-scoped local rows.

Validated flow from Android logs:

```text
reinstall/login/select outlet
-> local_state merchant_id=None, needs_baseline_sync=true
-> sync_full_resync/full pull
-> merchants/outlets/registers/staff upserted
-> cloud staff login succeeds
```

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

Validated incremental flow:

```text
server sync_events latestEventId=3
local last_server_event_id=0
-> status hasServerChanges=true
-> sync_pull_events afterEventId=0
-> categories/products/outlet_products pulled
-> local cursor becomes 3
-> next sync status hasServerChanges=false
-> mode=skipped
```

The cursor check is important. A successful pull must persist `sync_cursors.last_server_event_id`; the next no-op sync should log `last_server_event_id=<latestEventId>` and choose `mode="skipped"`.

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

### Manual Smart Sync Simulation

For local development, the API includes a repeatable simulator that assumes the dev database has exactly one merchant and one outlet:

```bash
cd apps/api
bun run sync:simulate-product
```

Each run creates:

- one random `SYNC TEST Category ...`
- one random `SYNC TEST Product ...`
- one `outlet_products` row for the single outlet
- matching `sync_events` rows for `categories`, `products`, and `outlet_products`

Use it to test incremental pull without a second device:

1. Open the POS app and stay on Settings.
2. Start logcat with the filter below.
3. Run `bun run sync:simulate-product`.
4. Tap `Sinkron Sekarang`.
5. Expect `mode="pull_only"` and `pullRows=3`.
6. Tap `Sinkron Sekarang` again without rerunning the script.
7. Expect `mode="skipped"` and `last_server_event_id` equal to the previous `latestEventId`.

Useful Android logcat filter:

```bash
adb logcat -c && adb logcat -s "Tauri/Console:*" "RustStdoutStderr:*" | grep -E "\[SYNC-DEBUG\]|\[CLOUD-AUTH\]|\[CLOUD-LOGIN\]|\[AUTH\]|FAILED|Failed|Error"
```

## Regression Tests

Tests that protect this design:

- `apps/api/src/__test__/sync.test.ts`: API status and event-pull behavior, including a simulated product change from another device.
- `apps/api/src/__test__/sync-simulator.test.ts`: simulator creates category/product/outlet product rows and matching scoped sync events, and refuses unsafe multi-merchant/multi-outlet databases.
- `apps/pos-app/src/store/__test__/sync.test.ts`: POS decision matrix, baseline full sync after reinstall, event pull, and pull-once-then-skip cursor behavior.

## Known Caveats

- `sync_push_outbox` currently reuses the existing full row push serializer and then marks pending outbox entries as synced. This is compatible but not the final lowest-read implementation.
- Push responses do not yet return a server event cursor, so a push-only sync may be followed by a later event pull of the client’s own accepted changes.
- Rust unit tests could not be linked in the current environment because no C linker (`cc`, `gcc`, or `clang`) is installed.
