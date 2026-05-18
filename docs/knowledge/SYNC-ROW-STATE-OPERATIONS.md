# Sync Row-State Operations

Sakti POS sync uses row-state watermarks, not server event IDs.

## Core Rules

- API synced rows must update `sync_updated_at` whenever they become visible to
  sync, including inserts, updates, soft deletes, and conflict upserts.
- `sync_updated_at` is an epoch-milliseconds integer, equivalent to
  `Date.now()`.
- `deleted_at` is an ISO 8601 timestamp string or `NULL`.
- POS cursors store opaque row-state watermarks such as
  `sync:1779137414973:products:019e3cc5-2198-75cb-bbef-e7f53f096ff7`.
- Do not use or reintroduce `sync_events`, `latest_event_id`, or
  `last_server_event_id`.

## Manual API DB Edits

Manual DB edits bypass API service logic. If you manually change a synced API
row, update both the semantic field and `sync_updated_at`.

Soft delete example:

```sql
UPDATE products
SET
  deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  sync_updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
WHERE id = 'PRODUCT_ID';
```

Restore example:

```sql
UPDATE products
SET
  deleted_at = NULL,
  sync_updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
WHERE id = 'PRODUCT_ID';
```

If a POS cursor may already be at the current timestamp, add a small increment
such as `+ 1000` for manual testing.

## Expected Server Delete Flow

- API row has `deleted_at IS NOT NULL`.
- API row has `sync_updated_at` greater than the POS cursor timestamp, or equal
  with a table/id ordering that comes after the cursor.
- Pull returns the row ID in `deletedIds`.
- POS applies a local tombstone with pull `serverTime`, marks the row synced,
  clears stale outbox rows for that row, and advances the cursor.

The POS local `deleted_at` may differ from the API `deleted_at` because pull
tombstones carry IDs, not full deleted row payloads. Sync correctness depends on
the cursor, non-null local `deleted_at`, `is_synced=1`, and no pending outbox.

## Useful Checks

API:

```bash
sqlite3 apps/api/.turso/local.db "
SELECT id, name, COALESCE(deleted_at, 'NULL'), sync_updated_at FROM categories;
SELECT id, name, COALESCE(deleted_at, 'NULL'), sync_updated_at FROM products;
"
```

POS snapshot:

```bash
sqlite3 apps/pos-app/.db-snapshots/latest.sqlite "
SELECT id, name, COALESCE(deleted_at, 'NULL'), is_synced FROM categories;
SELECT id, name, COALESCE(deleted_at, 'NULL'), is_synced FROM products;
SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL;
SELECT * FROM sync_cursors;
"
```

Logs:

```bash
grep -iE 'SYNC:DECISION|SYNC:RESULT|pull_batch|deleted_ids|soft_delete_row|push_batch|server_newer|marked_rejected_outbox_synced|payload_too_large' logs/app.log
```
