# Sync Hardcut Robustness Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for every code behavior change in this plan. No production code change before a failing test has been run and observed.

**Goal:** Fix the hardcut sync batch implementation so typed protobuf push/pull, full resync, outbox acknowledgements, delete conflicts, and event pagination are robust enough for launch.

**Architecture:** Keep the hardcut default sync API: `/api/sync/push`, `/api/sync/pull`, and `/api/sync/status` use the batch typed protobuf protocol. Add explicit conversion boundaries instead of letting protobuf field names leak into database rows. Make cursor movement and outbox acknowledgements exact: local cursors advance only after rows are applied, and local dirty/outbox state is cleared only for server-accepted rows.

**Tech Stack:** Protobuf/ts-proto, Rust prost, Tauri commands, SQLite/sqlx, Elysia, Drizzle ORM, Bun tests, Rust cargo tests, Ultracite/Biome.

---

## Context

This plan addresses gaps found during a deep implementation review of the hardcut sync batch branch:

1. Typed pull rows do not map money/count fields back to real SQLite/API DB column names.
2. Full resync still uses the expired local event cursor, so expired-cursor recovery can loop-fail.
3. Push marks whole scoped tables synced instead of only server-accepted row IDs.
4. Delete pushes bypass stale-conflict checks.
5. Pull/status pagination happens in memory after loading all scoped sync events.
6. Push service still performs row-by-row writes and row-by-row sync event inserts.
7. Test coverage misses the most important typed pull and ack edge cases.

## Non-Goals

- Do not reintroduce public v1/v2 dual route names.
- Do not add field-level conflict resolution.
- Do not add a single exchange endpoint.
- Do not redesign auth/session behavior.
- Do not optimize every table to typed protobuf.

## Required Verification Commands

Run scoped commands after the task that touches each area:

```bash
bun test apps/api/src/sync/__test__/protobuf.test.ts
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
bun test apps/api/src/sync/__test__/service.test.ts
bun test apps/pos-app/src/store/__test__/sync.test.ts
bun test apps/pos-app/src/lib/api/__test__/sync.test.ts
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
bun x ultracite check apps/api/src/sync apps/pos-app/src-tauri/src/sync apps/pos-app/src/store/sync.ts packages/protobuf/proto/sync.proto
```

---

## Task 1: Add Regression Tests for Typed Pull Field Mapping

**Files:**

- Modify: `apps/api/src/sync/__test__/protobuf.test.ts`
- Modify: `apps/api/src/sync/__test__/routes-protobuf.test.ts`
- Modify: `apps/pos-app/src-tauri/src/sync/protobuf.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/mod.rs` if Rust test visibility requires it

**Step 1: Write failing API encoder tests**

Add tests proving DB-shaped rows become typed protobuf-shaped rows:

```ts
test("encodePullBatchResponse maps API product DB fields to typed protobuf money fields", () => {
  const encoded = encodePullBatchResponse({
    latestEventId: 12,
    needsFullResync: false,
    serverTime: "2026-05-17T00:00:00.000Z",
    products: {
      created: [
        {
          id: "product-1",
          merchantId: "merchant-1",
          categoryId: "cat-1",
          name: "Kopi",
          price: 15_000,
          imageUrl: "https://example.test/product.jpg",
          imageAssetId: "asset-1",
          isActive: true,
          sortOrder: 3,
          createdAt: "2026-05-17T00:00:00.000Z",
          updatedAt: "2026-05-17T00:00:00.000Z",
        },
      ],
      updated: [],
      deletedIds: [],
    },
  });

  expect(encoded.products?.created[0]).toMatchObject({
    id: "product-1",
    priceMinorUnits: 15_000n,
    sortOrder: 3n,
  });
});

test("encodePullBatchResponse maps API order item DB fields to typed protobuf money fields", () => {
  const encoded = encodePullBatchResponse({
    latestEventId: 12,
    needsFullResync: false,
    serverTime: "2026-05-17T00:00:00.000Z",
    orderItems: {
      created: [
        {
          id: "item-1",
          outletId: "outlet-1",
          orderId: "order-1",
          productId: "product-1",
          productName: "Kopi",
          quantity: 2,
          unitPrice: 15_000,
          originalPrice: 20_000,
          subtotal: 30_000,
          createdAt: "2026-05-17T00:00:00.000Z",
          updatedAt: "2026-05-17T00:00:00.000Z",
        },
      ],
      updated: [],
      deletedIds: [],
    },
  });

  expect(encoded.orderItems?.created[0]).toMatchObject({
    originalPriceMinorUnits: 20_000n,
    subtotalMinorUnits: 30_000n,
    unitPriceMinorUnits: 15_000n,
  });
});
```

**Step 2: Run API tests and verify RED**

Run:

```bash
bun test apps/api/src/sync/__test__/protobuf.test.ts
```

Expected: FAIL because `encodePullBatchResponse` currently passes DB-shaped rows directly into protobuf typed fields.

**Step 3: Write failing Rust decoder tests**

Add Rust tests that prove typed protobuf rows decode into local DB-shaped JSON keys:

```rust
#[test]
fn decode_pull_batch_response_maps_typed_product_to_local_db_columns() {
    let response = SyncPullBatchResponse {
        server_time: "2026-05-17T00:00:00.000Z".to_string(),
        products: Some(ProductChanges {
            created: vec![ProductRow {
                id: "product-1".to_string(),
                merchant_id: "merchant-1".to_string(),
                name: "Kopi".to_string(),
                price_minor_units: 15_000,
                sort_order: 3,
                is_active: true,
                created_at: "2026-05-17T00:00:00.000Z".to_string(),
                updated_at: "2026-05-17T00:00:00.000Z".to_string(),
                ..Default::default()
            }],
            ..Default::default()
        }),
        ..Default::default()
    };

    let tables = decode_pull_batch_response_tables(&response).expect("response should decode");
    assert_eq!(tables["products"][0]["price"], json!(15_000));
    assert_eq!(tables["products"][0]["sortOrder"], json!(3));
    assert!(tables["products"][0].get("priceMinorUnits").is_none());
}

#[test]
fn decode_pull_batch_response_maps_typed_order_item_to_local_db_columns() {
    let response = SyncPullBatchResponse {
        server_time: "2026-05-17T00:00:00.000Z".to_string(),
        order_items: Some(OrderItemChanges {
            created: vec![OrderItemRow {
                id: "item-1".to_string(),
                order_id: "order-1".to_string(),
                outlet_id: "outlet-1".to_string(),
                product_name: "Kopi".to_string(),
                quantity: 2,
                unit_price_minor_units: 15_000,
                original_price_minor_units: 20_000,
                subtotal_minor_units: 30_000,
                created_at: "2026-05-17T00:00:00.000Z".to_string(),
                updated_at: "2026-05-17T00:00:00.000Z".to_string(),
                ..Default::default()
            }],
            ..Default::default()
        }),
        ..Default::default()
    };

    let tables = decode_pull_batch_response_tables(&response).expect("response should decode");
    assert_eq!(tables["order_items"][0]["unitPrice"], json!(15_000));
    assert_eq!(tables["order_items"][0]["originalPrice"], json!(20_000));
    assert_eq!(tables["order_items"][0]["subtotal"], json!(30_000));
    assert!(tables["order_items"][0].get("unitPriceMinorUnits").is_none());
}
```

**Step 4: Run Rust tests and verify RED**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync::protobuf::tests::decode_pull_batch_response_maps_typed_product_to_local_db_columns
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync::protobuf::tests::decode_pull_batch_response_maps_typed_order_item_to_local_db_columns
```

Expected: FAIL because decoded rows still contain `priceMinorUnits`, `unitPriceMinorUnits`, etc.

**Step 5: Commit only tests**

```bash
git add apps/api/src/sync/__test__/protobuf.test.ts apps/pos-app/src-tauri/src/sync/protobuf.rs
git commit -m "test(sync): cover typed pull field mapping"
```

---

## Task 2: Implement Explicit Typed Pull Mapping

**Files:**

- Modify: `apps/api/src/sync/protobuf.ts`
- Modify: `apps/pos-app/src-tauri/src/sync/protobuf.rs`

**Step 1: Implement API DB-row to typed-proto mapping**

In `apps/api/src/sync/protobuf.ts`, add helper functions:

```ts
function int64Field(value: unknown, fieldName: string): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }
  if (value == null) {
    return 0n;
  }
  throw new Error(`Invalid int64 value for ${fieldName}`);
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function boolField(value: unknown): boolean {
  return value === true || value === 1;
}
```

Add per-table mappers:

```ts
function productRowToProto(row: Record<string, unknown>) {
  return {
    id: stringField(row.id),
    merchantId: stringField(row.merchantId),
    categoryId: stringField(row.categoryId),
    name: stringField(row.name),
    priceMinorUnits: int64Field(row.price ?? row.priceMinorUnits, "products.price"),
    imageUrl: stringField(row.imageUrl),
    imageAssetId: stringField(row.imageAssetId),
    isActive: boolField(row.isActive),
    sortOrder: int64Field(row.sortOrder, "products.sortOrder"),
    deletedAt: stringField(row.deletedAt),
    createdAt: stringField(row.createdAt),
    updatedAt: stringField(row.updatedAt),
  };
}
```

Implement equivalent helpers for:

- `outlet_products.price -> priceMinorUnits`
- `orders.total -> totalMinorUnits`
- `orders.amountPaid -> amountPaidMinorUnits`
- `orders.changeAmount -> changeAmountMinorUnits`
- `order_items.unitPrice -> unitPriceMinorUnits`
- `order_items.originalPrice -> originalPriceMinorUnits`
- `order_items.subtotal -> subtotalMinorUnits`

Update `encodePullBatchResponse` so it maps `result.products`, `result.outletProducts`, `result.orders`, and `result.orderItems` through these helpers.

**Step 2: Run API tests and verify GREEN**

Run:

```bash
bun test apps/api/src/sync/__test__/protobuf.test.ts
```

Expected: PASS.

**Step 3: Implement Rust typed-proto to local DB-row mapping**

In `apps/pos-app/src-tauri/src/sync/protobuf.rs`, change `*_row_to_value` helpers so they return local DB-shaped camelCase keys:

```rust
fn product_row_to_value(row: &ProductRow) -> Value {
    serde_json::json!({
        "id": row.id,
        "merchantId": row.merchant_id,
        "categoryId": empty_string_to_null(&row.category_id),
        "name": row.name,
        "price": row.price_minor_units,
        "imageUrl": empty_string_to_null(&row.image_url),
        "imageAssetId": empty_string_to_null(&row.image_asset_id),
        "isActive": row.is_active,
        "sortOrder": row.sort_order,
        "deletedAt": empty_string_to_null(&row.deleted_at),
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    })
}
```

Use the same local DB field names for order and order item rows:

- `total`
- `amountPaid`
- `changeAmount`
- `unitPrice`
- `originalPrice`
- `subtotal`

**Step 4: Run Rust tests and verify GREEN**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync::protobuf::tests
```

Expected: PASS.

**Step 5: Run combined scoped tests**

Run:

```bash
bun test apps/api/src/sync/__test__/protobuf.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/api/src/sync/protobuf.ts apps/pos-app/src-tauri/src/sync/protobuf.rs
git commit -m "fix(sync): map typed pull fields across protobuf boundaries"
```

---

## Task 3: Make Full Resync Force a Baseline Pull

**Files:**

- Modify: `apps/pos-app/src-tauri/src/sync/pull.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/commands.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/mod.rs`
- Modify: `apps/pos-app/src/store/__test__/sync.test.ts`

**Step 1: Write failing Rust helper test**

Add a small helper in `pull.rs`:

```rust
pub(super) enum PullStartCursor {
    Stored,
    Baseline,
}
```

Write the test before implementing the helper:

```rust
#[test]
fn baseline_pull_start_cursor_uses_zero() {
    assert_eq!(resolve_pull_start_event_id(42, PullStartCursor::Baseline), 0);
    assert_eq!(resolve_pull_start_event_id(42, PullStartCursor::Stored), 42);
}
```

**Step 2: Run Rust test and verify RED**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync::tests::baseline_pull_start_cursor_uses_zero
```

Expected: FAIL because helper/enum does not exist.

**Step 3: Implement minimal cursor mode**

Change `sync_pull_batch_inner` signature to accept cursor mode:

```rust
pub(super) async fn sync_pull_batch_inner(
    pool: &SqlitePool,
    outlet_id: &str,
    api_url: &str,
    session_token: &str,
    tables: &[String],
    start_cursor: PullStartCursor,
) -> Result<PullResult, String>
```

Use:

```rust
let stored_event_id = get_last_server_event_id(pool, outlet_id).await?;
let after_event_id = resolve_pull_start_event_id(stored_event_id, start_cursor);
```

Then:

- `sync_pull` uses `PullStartCursor::Stored`
- `sync_now` uses `PullStartCursor::Stored`
- `sync_full_resync` uses `PullStartCursor::Baseline`

**Step 4: Add store assertion for full resync intent**

Existing store tests already assert `sync_full_resync`; keep them. Add assertion that the branch is entered for `needsFullResync: true` and `needs_baseline_sync: true`.

**Step 5: Run tests and verify GREEN**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
bun test apps/pos-app/src/store/__test__/sync.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/pos-app/src-tauri/src/sync/pull.rs apps/pos-app/src-tauri/src/sync/commands.rs apps/pos-app/src-tauri/src/sync/mod.rs apps/pos-app/src/store/__test__/sync.test.ts
git commit -m "fix(sync): force baseline cursor during full resync"
```

---

## Task 4: Mark Only Server-Accepted Push Rows Synced

**Files:**

- Modify: `apps/pos-app/src-tauri/src/sync/outbox.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/schema.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/push.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/mod.rs`

**Step 1: Write failing Rust tests for ack extraction**

Add pure helper tests before implementation:

```rust
#[test]
fn accepted_ids_by_table_uses_only_acknowledged_rows() {
    let response = SyncPushBatchResponse {
        tables: vec![SyncTableAck {
            table: "products".to_string(),
            accepted_created_ids: vec!["created-1".to_string()],
            accepted_updated_ids: vec!["updated-1".to_string()],
            accepted_deleted_ids: vec!["deleted-1".to_string()],
            rejected: vec![SyncRejectedRow {
                id: "rejected-1".to_string(),
                reason: "server_newer".to_string(),
            }],
        }],
        ..Default::default()
    };

    let accepted = accepted_ids_by_table(&response);
    assert!(accepted["products"].contains("created-1"));
    assert!(accepted["products"].contains("updated-1"));
    assert!(accepted["products"].contains("deleted-1"));
    assert!(!accepted["products"].contains("rejected-1"));
}
```

**Step 2: Run Rust test and verify RED**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync::tests::accepted_ids_by_table_uses_only_acknowledged_rows
```

Expected: FAIL because helper does not exist.

**Step 3: Implement accepted-id helpers**

In `push.rs`, add:

```rust
fn accepted_ids_by_table(
    response: &SyncPushBatchResponse,
) -> HashMap<String, HashSet<String>> {
    let mut result = HashMap::new();
    for ack in &response.tables {
        let ids = result.entry(ack.table.clone()).or_insert_with(HashSet::new);
        ids.extend(ack.accepted_created_ids.iter().cloned());
        ids.extend(ack.accepted_updated_ids.iter().cloned());
        ids.extend(ack.accepted_deleted_ids.iter().cloned());
    }
    result
}
```

**Step 4: Replace broad row marking**

Replace `mark_rows_synced_tx(table, filter_col, filter_value, skip_ids)` with a helper that marks only accepted IDs:

```rust
pub(super) async fn mark_rows_synced_by_id_tx(
    conn: &mut SqliteConnection,
    table: &str,
    accepted_ids: &HashSet<String>,
) -> Result<(), String>
```

Expected SQL shape:

```sql
UPDATE {table} SET is_synced = 1 WHERE id IN (?, ?, ...)
```

If `accepted_ids` is empty, return `Ok(())`.

**Step 5: Replace outbox marking**

Replace `mark_outbox_synced_except_tx` with accepted-only semantics:

```rust
pub(super) async fn mark_outbox_synced_by_accepted_ids_tx(
    conn: &mut SqliteConnection,
    synced_at: &str,
    accepted_ids_by_table: &HashMap<String, HashSet<String>>,
) -> Result<u64, String>
```

This must update only pending outbox rows whose `(table_name, row_id)` appears in the accepted map. Rejected and unsent rows stay pending.

**Step 6: Handle legacy dirty rows safely**

In `get_sync_local_state`, stop using `count_legacy_unsynced_rows` as a reason to run push unless the implementation backfills them into `sync_outbox`.

Preferred hardcut behavior:

- Keep a warning log if `legacy_dirty_count > 0`.
- Do not include legacy dirty rows in `local_dirty_count`.
- Do not mark legacy dirty rows synced.

This avoids silent data loss. A separate migration/backfill can be added only if needed.

**Step 7: Run tests and verify GREEN**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

**Step 8: Commit**

```bash
git add apps/pos-app/src-tauri/src/sync/outbox.rs apps/pos-app/src-tauri/src/sync/schema.rs apps/pos-app/src-tauri/src/sync/push.rs apps/pos-app/src-tauri/src/sync/commands.rs apps/pos-app/src-tauri/src/sync/mod.rs
git commit -m "fix(sync): mark only accepted push rows synced"
```

---

## Task 5: Add Delete Conflict Checks on API Push

**Files:**

- Modify: `apps/api/src/sync/__test__/service.test.ts`
- Modify: `apps/api/src/sync/service.ts`

**Step 1: Write failing service tests**

Add tests:

```ts
test("handlePushBatch rejects stale deletes when server row is newer", async () => {
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = makePushTxMock({
      existingRows: [{ id: "product-1", updatedAt: "2026-05-18T00:00:00.000Z" }],
    });
    return await fn(tx);
  });

  const result = await handlePushBatch("outlet-1", "merchant-1", {
    products: {
      created: [],
      updated: [],
      deleted: [{ id: "product-1", updatedAt: "2026-05-17T00:00:00.000Z" }],
      deletedIds: ["product-1"],
    },
  });

  expect(result.tables[0]?.acceptedDeletedIds).toEqual([]);
  expect(result.tables[0]?.rejected).toEqual([
    { id: "product-1", reason: "server_newer" },
  ]);
});
```

If the current protocol cannot carry delete timestamps, add a local-only normalized delete metadata type in decoded changes:

```ts
interface TableChangeSet {
  created: Record<string, unknown>[];
  updated: Record<string, unknown>[];
  deletedIds: string[];
  deleted?: Record<string, unknown>[];
}
```

The Rust push builder should include delete row metadata in JSON side only if the proto changes. If avoiding a proto change, API can only check existence, not staleness. Since the app is not launched, prefer changing the proto to add typed tombstones if necessary.

**Step 2: Run service test and verify RED**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: FAIL because deletes are accepted unconditionally.

**Step 3: Implement delete partitioning**

In `service.ts`, add per-table delete partitioning:

1. Prefetch existing rows for all delete IDs.
2. If delete metadata includes `updatedAt`, reject when server `updatedAt` is newer.
3. Soft-delete only accepted IDs.
4. Insert delete sync events only for accepted IDs.
5. Ack only accepted IDs.

If delete metadata is unavailable for a table, use conservative behavior:

- For existing row: accept delete only if client supplied timestamp is absent and no safer comparison exists.
- Add a `TODO(sync)` comment and a follow-up test to force proto tombstones before launch.

**Step 4: Run tests and verify GREEN**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/service.ts
git commit -m "fix(sync): reject stale delete pushes"
```

---

## Task 6: Move Pull Pagination into the Database Query

**Files:**

- Modify: `apps/api/src/sync/__test__/service.test.ts`
- Modify: `apps/api/src/sync/service.ts`

**Step 1: Write failing query-shape tests**

Add a service test that inspects the mock query chain enough to prove:

- `gt(syncEvents.id, lowerBound)` is part of the `where`
- table filtering is applied before fetch
- `limit(effectiveLimit + 1)` is called

Test behavior:

```ts
test("handlePullBatch fetches only one bounded event page from the database", async () => {
  const limit = vi.fn().mockResolvedValue([
    { id: 11, operation: "update", rowId: "product-1", tableName: "products" },
    { id: 12, operation: "update", rowId: "product-2", tableName: "products" },
  ]);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });

  mockSelect.mockImplementationOnce(() => ({
    from: vi.fn().mockReturnValue({ where }),
  }));

  // snapshot select mock here

  await handlePullBatch({
    afterEventId: 10,
    limit: 1,
    merchantId: "merchant-1",
    outletId: "outlet-1",
    pageCursor: "",
    tables: ["products"],
  });

  expect(limit).toHaveBeenCalledWith(2);
});
```

**Step 2: Run service test and verify RED**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: FAIL because current implementation fetches all events without a database `limit`.

**Step 3: Implement bounded event-page query**

In `handlePullBatch`:

1. Compute `normalizedLimit`.
2. Parse `pageCursor`.
3. Compute `lowerBound = Math.max(afterEventId, cursorEventId)`.
4. Build SQL filter:

```ts
and(
  getScopedEventsFilter(input.merchantId, input.outletId),
  gt(syncEvents.id, lowerBound),
  input.tables.length > 0 ? inArray(syncEvents.tableName, input.tables) : undefined
)
```

Do not pass `undefined` directly if Drizzle helper does not accept it; build a `conditions` array and spread it into `and(...)`.

5. Query:

```ts
const events = await db
  .select({
    id: syncEvents.id,
    operation: syncEvents.operation,
    rowId: syncEvents.rowId,
    tableName: syncEvents.tableName,
  })
  .from(syncEvents)
  .where(and(...conditions))
  .orderBy(asc(syncEvents.id))
  .limit(normalizedLimit + 1);
```

6. Remove JS-side event filtering in `normalizePullBatchResult`.

**Step 4: Fix baseline pull**

For baseline `afterEventId === 0 && !pageCursor`, keep snapshot behavior but compute `latestEventId` with a bounded latest-event query, not by loading all events.

**Step 5: Run tests and verify GREEN**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/service.ts
git commit -m "fix(sync): bound pull event pagination in SQL"
```

---

## Task 7: Bound Sync Status Queries

**Files:**

- Modify: `apps/api/src/sync/__test__/service.test.ts`
- Modify: `apps/api/src/sync/service.ts`

**Step 1: Write failing service tests**

Add tests proving `handleSyncStatus` does not need full event history:

- Latest event id is read with `orderBy(desc(syncEvents.id)).limit(1)`.
- Oldest available event id is read with `orderBy(asc(syncEvents.id)).limit(1)`.
- Changed tables are read only for `id > lastServerEventId`.

**Step 2: Run service test and verify RED**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: FAIL because current code fetches all events and computes in JS.

**Step 3: Implement bounded status queries**

Use three small queries:

1. Latest scoped event:

```ts
const [latestEvent] = await db
  .select({ id: syncEvents.id })
  .from(syncEvents)
  .where(getScopedEventsFilter(input.merchantId, input.outletId))
  .orderBy(desc(syncEvents.id))
  .limit(1);
```

2. Oldest scoped event:

```ts
const [oldestEvent] = await db
  .select({ id: syncEvents.id })
  .from(syncEvents)
  .where(getScopedEventsFilter(input.merchantId, input.outletId))
  .orderBy(asc(syncEvents.id))
  .limit(1);
```

3. Changed tables:

```ts
const changedTableRows = await db
  .select({ tableName: syncEvents.tableName })
  .from(syncEvents)
  .where(and(getScopedEventsFilter(...), gt(syncEvents.id, input.lastServerEventId)))
  .orderBy(asc(syncEvents.id));
```

Keep `new Set(...)` for uniqueness.

**Step 4: Run tests and verify GREEN**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/service.ts
git commit -m "fix(sync): bound sync status event queries"
```

---

## Task 8: Make Push Writes Batch-Aware

**Files:**

- Modify: `apps/api/src/sync/__test__/service.test.ts`
- Modify: `apps/api/src/sync/service.ts`

**Step 1: Write failing service tests for database call count**

Add tests that create 100 product updates and assert:

- existing rows are prefetched with one select for those IDs
- accepted rows are written with one bulk insert/update path
- sync events are inserted with one bulk `values(events)` call
- no per-row `insert(syncEvents).values(...)` loop occurs

**Step 2: Run service tests and verify RED**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: FAIL because `processPushBatchTable` currently loops row-by-row.

**Step 3: Add typed table metadata helpers**

In `service.ts`, create explicit table metadata:

```ts
const PUSH_TABLES = {
  products: { table: products, scope: "merchant" },
  categories: { table: categories, scope: "merchant" },
  outlet_products: { table: outletProducts, scope: "outlet" },
  orders: { table: orders, scope: "outlet" },
  order_items: { table: orderItems, scope: "outlet" },
  // include all sync tables
} as const;
```

If generic Drizzle typing gets awkward, implement table-specific functions for the hot tables first and keep JSON fallback tables on the existing path temporarily. Do not sacrifice correctness for generic cleverness.

**Step 4: Implement batch partitioning**

For each table and operation group:

1. Collect IDs.
2. Select existing `{ id, updatedAt }` rows with one query.
3. Partition accepted/rejected in memory.
4. Bulk write accepted rows.
5. Bulk insert sync events:

```ts
if (events.length > 0) {
  await tx.insert(syncEvents).values(events);
}
```

**Step 5: Run tests and verify GREEN**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/service.ts
git commit -m "perf(sync): batch push writes and sync events"
```

---

## Task 9: Harden Route Error Handling and Limits

**Files:**

- Modify: `apps/api/src/sync/__test__/routes-protobuf.test.ts`
- Modify: `apps/api/src/sync/routes.ts`
- Modify: `apps/api/src/lib/ts-proto-plugin.ts` only if invalid protobuf status mapping is wrong

**Step 1: Write failing route tests**

Add tests for:

- malformed protobuf returns `400`
- invalid pull cursor returns `400`
- `afterEventId > Number.MAX_SAFE_INTEGER` returns `400`
- missing outlet returns consistent `404` if access check allows the user and lookup returns empty
- push batch over row limit returns `413`
- push batch over byte limit returns `413`

**Step 2: Run route tests and verify RED**

Run:

```bash
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
```

Expected: FAIL for any currently unmapped route errors.

**Step 3: Implement route-level safe conversions**

Wrap `protobufInt64ToSafeNumber` and cursor parse errors so they return `400`, not `500`.

For missing outlet:

1. Do outlet lookup first.
2. Return `404` if not found.
3. Then call `verifyOutletAccess`.

This avoids missing records looking like permission failures.

**Step 4: Run route tests and verify GREEN**

Run:

```bash
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/sync/__test__/routes-protobuf.test.ts apps/api/src/sync/routes.ts apps/api/src/lib/ts-proto-plugin.ts
git commit -m "fix(sync): harden protobuf route errors"
```

---

## Task 10: Add End-to-End Rust Pull Apply Tests

**Files:**

- Modify: `apps/pos-app/src-tauri/src/sync/mod.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/pull.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/protobuf.rs`

**Step 1: Write failing pure/local apply test**

If `sync_pull_batch_inner` is too network-coupled, extract a helper first in a test-only way:

```rust
async fn apply_pull_batch_tables_tx(
    tx: &mut SqliteConnection,
    outlet_id: &str,
    tables: &[String],
    tables_map: &BTreeMap<String, Value>,
    server_time: &str,
    latest_event_id: i64,
) -> Result<usize, String>
```

Write a test that:

1. Opens an in-memory SQLite DB using existing migration/init helpers if available.
2. Creates a `products` table compatible with local schema.
3. Applies a typed decoded product row.
4. Asserts `price = 15000`, `is_synced = 1`, and no `price_minor_units` column is referenced.
5. Asserts `sync_cursors.last_server_event_id` advances only after apply succeeds.

**Step 2: Run Rust test and verify RED**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync::tests::apply_pull_batch_writes_typed_product_to_local_columns
```

Expected: FAIL until helper exists and mapping is correct.

**Step 3: Implement helper**

Move the transaction body from `sync_pull_batch_inner` into the helper. Keep behavior identical except for stronger testability.

**Step 4: Add failure test for cursor safety**

Add a test that sends a row with an invalid column/table and proves the transaction rolls back without cursor advancement.

**Step 5: Run tests and verify GREEN**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/pos-app/src-tauri/src/sync/mod.rs apps/pos-app/src-tauri/src/sync/pull.rs apps/pos-app/src-tauri/src/sync/protobuf.rs
git commit -m "test(sync): verify local apply of typed pull rows"
```

---

## Task 11: Final Sync Verification and Documentation Update

**Files:**

- Modify: `docs/adr/0008-use-idempotent-sync-batches-and-paged-pulls.md`
- Modify: `docs/DOCUMENTED-LOG-PREFIX.md` only if new log prefixes were added

**Step 1: Update ADR**

Add a short note to ADR 0008:

- Hardcut default endpoints use batch protobuf.
- Typed protobuf field names are transport-only; DB row mappers own the conversion.
- Full resync means baseline pull with event cursor zero.
- Client ack handling is accepted-ID based.

**Step 2: Run all scoped automated verification**

Run:

```bash
bun test apps/api/src/sync/__test__/protobuf.test.ts
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
bun test apps/api/src/sync/__test__/service.test.ts
bun test apps/pos-app/src/store/__test__/sync.test.ts
bun test apps/pos-app/src/lib/api/__test__/sync.test.ts
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
bun x ultracite check apps/api/src/sync apps/pos-app/src-tauri/src/sync apps/pos-app/src/store/sync.ts packages/protobuf/proto/sync.proto
```

Expected: PASS.

**Step 3: Search for removed/forbidden old API names**

Run:

```bash
rg -n "SyncPushRequest|SyncPullRequest|SyncPullEventsRequest|SyncPushResponse|SyncPullResponse|handlePush\\(|handlePull\\(|handleEventPull|pull-events|v2/(push|pull)-batch|sync_.*_v2" apps packages -S
```

Expected: no matches in active code. Test names mentioning "v2" may remain only if they describe historical plan context; prefer renaming active tests to "batch" or "hardcut".

**Step 4: Manual UI verification guide**

Manual UI steps:

1. Launch POS app and log in.
2. Select an outlet on a clean local DB.
3. Trigger sync and verify baseline pull completes.
4. Create a product with price `15000`, edit it, then sync.
5. Create a paid order with at least two items, then sync.
6. On another device or API fixture, update the product price and pull it to the first device.
7. Delete a product locally while a newer server update exists and verify the row stays pending/rejected instead of being cleared.
8. Restart the app and verify products/orders remain visible with correct prices.

Log checks:

```bash
PID="$(adb shell pidof -s com.sakti_dev.sakti_pos | tr -d '\r')" && adb logcat -v brief --pid="$PID" | grep --line-buffered -iE '\[(JS|RUST)\] \[(SYNC|DB|POS):'
```

State/database checks:

```sql
SELECT table_name, row_id, operation, synced_at FROM sync_outbox ORDER BY changed_at DESC LIMIT 20;
SELECT scope_type, scope_id, last_server_event_id, updated_at FROM sync_cursors;
SELECT id, name, price, is_synced FROM products ORDER BY updated_at DESC LIMIT 10;
SELECT id, total, is_synced FROM orders ORDER BY updated_at DESC LIMIT 10;
SELECT id, unit_price, subtotal, is_synced FROM order_items ORDER BY updated_at DESC LIMIT 10;
```

Edge cases:

- Network drops after server accepts push but before client marks outbox: rerun sync and verify idempotency returns the cached ack and accepted rows are marked synced.
- Pull page apply fails mid-transaction: verify local cursor remains at previous `last_server_event_id`.

**Step 5: Commit docs**

```bash
git add docs/adr/0008-use-idempotent-sync-batches-and-paged-pulls.md docs/DOCUMENTED-LOG-PREFIX.md
git commit -m "docs(sync): document hardcut batch sync invariants"
```

---

## Execution Order Summary

1. Tests for typed pull mapping.
2. Explicit typed pull mapping.
3. Full resync baseline cursor.
4. Accepted-ID-only push acknowledgements.
5. Delete conflict checks.
6. SQL-bounded pull pagination.
7. SQL-bounded status queries.
8. Batch-aware push writes.
9. Route error hardening.
10. End-to-end Rust local apply tests.
11. Final verification and docs.

Do not skip the RED phase. Each task starts by adding or strengthening tests, running them, and observing the expected failure before production code changes.
