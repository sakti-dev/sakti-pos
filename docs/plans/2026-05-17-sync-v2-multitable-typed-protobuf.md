# Sync V2 Multitable Typed Protobuf Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build sync v2 so the POS app can push and pull multi-table change sets in one API roundtrip, while using fully typed protobuf rows for the highest-payload stable tables.

**Architecture:** Add a versioned sync v2 protocol beside the existing v1 sync endpoints. V2 uses WatermelonDB-style table changes (`created`, `updated`, `deleted_ids`) and supports two payload lanes: JSON row changes for generic tables and typed protobuf changes for hot tables. Keep v1 working until v2 is verified end to end, then switch the app orchestration to v2 and remove v1 in a later cleanup.

**Tech Stack:** Protobuf/ts-proto, Rust prost, Tauri commands, SQLite/sqlx, Elysia, Drizzle ORM, Bun tests, Rust cargo tests.

---

## Scope

This plan implements:

- Multi-table push in one API roundtrip.
- Multi-table pull in one API roundtrip.
- A semantic change-set protocol: created, updated, deleted IDs.
- Typed protobuf payloads for high-value tables first.
- JSON row fallback for lower-volume or evolving tables.
- Per-table accepted/rejected push acknowledgements.
- Backward-compatible v1 endpoints during rollout.
- TDD for protocol, API service, API routes, Rust protobuf builders, Rust push/pull application, and Solid sync orchestration.
- Resumable pull checkpoints and progress state that can later be observed by Android setup/background infrastructure.

This plan does not implement:

- A single pull+push exchange endpoint.
- Field-level conflict resolution with changed columns.
- Sync consistency diagnostics.
- Full removal of v1 JSON-in-protobuf sync.
- Typed protobuf for every table.
- Android Foreground Service support.

Those should be separate follow-up plans after v2 is stable.

## Design Decisions

1. **Version v2 beside v1.**

   Keep `/api/sync/push`, `/api/sync/pull`, and `/api/sync/pull-events` unchanged. Add `/api/sync/v2/push-batch` and `/api/sync/v2/pull-batch`.

2. **Use semantic change sets.**

   Every table batch has explicit `created`, `updated`, and `deleted_ids`. Deleted rows are no longer inferred from `deleted_at` in the transport shape.

3. **Use typed protobuf for hot stable tables only.**

   Start with:

   - `products`
   - `outlet_products`
   - `orders`
   - `order_items`

   Keep JSON fallback for:

   - `merchants`
   - `outlets`
   - `registers`
   - `categories`
   - `assets`
   - `staff`

   `categories` and `assets` can graduate to typed messages later if payload measurements justify it.

4. **Keep row timestamps as ISO strings initially.**

   The current database and API already use ISO strings. Do not migrate timestamp representation to epoch millis in this plan.

5. **Represent money/count fields as `int64` where needed.**

   Use `int64` for values that can grow or represent money totals. Regenerate TypeScript protobuf with `forceLong=bigint`, not `forceLong=number` and not the default `long.js` representation. This is package-wide, so existing cursor fields such as `latestEventId` also become `bigint` in generated TypeScript and must be converted deliberately at API boundaries.

6. **Name typed protobuf money fields as minor units now.**

   Do not implement the full international currency feature in this plan, but avoid locking the sync contract into ambiguous money names. Typed protobuf rows should use names like `price_minor_units`, `subtotal_minor_units`, `tax_minor_units`, `total_minor_units`, and `unit_price_minor_units`. For now, map these to the current DB columns such as `price` and `total`. A later currency plan can add `currency_code`, `currency_exponent`, a `currencies` table, and order-level currency snapshots without renaming the sync v2 money fields.

7. **Use v2 response acks to replace `serverWins` gradually.**

   V2 response returns accepted IDs and rejected rows with reasons. V1 `serverWins` stays untouched.

8. **Use `sync_outbox.operation` as the source of truth for local operation type.**

   Do not infer `created` versus `updated` from `createdAt` and `updatedAt`. Offline-created rows can be updated before first sync. The local schema already stores `sync_outbox.operation` as `insert`, `update`, or `delete`; v2 local change-set builders must group by that value.

## Proposed V2 Proto Shape

Add this to `packages/protobuf/proto/sync.proto` without removing v1 messages:

```proto
message SyncJsonTableChanges {
  string table = 1;
  repeated string created_json = 2;
  repeated string updated_json = 3;
  repeated string deleted_ids = 4;
}

message SyncRejectedRow {
  string id = 1;
  string reason = 2;
}

message SyncTableAck {
  string table = 1;
  repeated string accepted_created_ids = 2;
  repeated string accepted_updated_ids = 3;
  repeated string accepted_deleted_ids = 4;
  repeated SyncRejectedRow rejected = 5;
}

message ProductRow {
  string id = 1;
  string merchant_id = 2;
  string name = 3;
  string description = 4;
  int64 price_minor_units = 5;
  string category_id = 6;
  string image_asset_id = 7;
  string created_at = 8;
  string updated_at = 9;
  string deleted_at = 10;
}

message OutletProductRow {
  string id = 1;
  string outlet_id = 2;
  string product_id = 3;
  int64 price_minor_units = 4;
  bool is_available = 5;
  string created_at = 6;
  string updated_at = 7;
  string deleted_at = 8;
}

message OrderRow {
  string id = 1;
  string outlet_id = 2;
  string register_id = 3;
  string staff_id = 4;
  int64 subtotal_minor_units = 5;
  int64 discount_total_minor_units = 6;
  int64 tax_total_minor_units = 7;
  int64 total_minor_units = 8;
  string status = 9;
  string created_at = 10;
  string updated_at = 11;
  string deleted_at = 12;
}

message OrderItemRow {
  string id = 1;
  string outlet_id = 2;
  string order_id = 3;
  string product_id = 4;
  string name = 5;
  int64 quantity = 6;
  int64 unit_price_minor_units = 7;
  int64 total_minor_units = 8;
  string created_at = 9;
  string updated_at = 10;
  string deleted_at = 11;
}

message ProductChanges {
  repeated ProductRow created = 1;
  repeated ProductRow updated = 2;
  repeated string deleted_ids = 3;
}

message OutletProductChanges {
  repeated OutletProductRow created = 1;
  repeated OutletProductRow updated = 2;
  repeated string deleted_ids = 3;
}

message OrderChanges {
  repeated OrderRow created = 1;
  repeated OrderRow updated = 2;
  repeated string deleted_ids = 3;
}

message OrderItemChanges {
  repeated OrderItemRow created = 1;
  repeated OrderItemRow updated = 2;
  repeated string deleted_ids = 3;
}

message SyncPushBatchRequest {
  string outlet_id = 1;
  string idempotency_key = 2;
  repeated SyncJsonTableChanges json_tables = 3;
  ProductChanges products = 10;
  OutletProductChanges outlet_products = 11;
  OrderChanges orders = 12;
  OrderItemChanges order_items = 13;
}

message SyncPushBatchResponse {
  repeated SyncTableAck tables = 1;
  string server_time = 2;
  int64 latest_event_id = 3;
}

message SyncPullBatchRequest {
  string outlet_id = 1;
  int64 after_event_id = 2;
  repeated string tables = 3;
  int32 limit = 4;
  string page_cursor = 5;
}

message SyncPullBatchResponse {
  repeated SyncJsonTableChanges json_tables = 1;
  ProductChanges products = 10;
  OutletProductChanges outlet_products = 11;
  OrderChanges orders = 12;
  OrderItemChanges order_items = 13;
  int64 latest_event_id = 20;
  bool needs_full_resync = 21;
  string server_time = 22;
  bool has_more = 23;
  string next_page_cursor = 24;
}
```

Before implementation, verify exact column names and nullable fields in:

- `packages/database/src/local-schema.ts`
- `packages/database/src/api-schema.ts`

Adjust row messages to match reality. Do not guess fields if schemas differ. If current DB/API columns are still named `price`, `subtotal`, or `total`, keep this plan's protobuf fields named `*_minor_units` and map between DB names and sync names in conversion helpers. Do not add `currency_code`, `currency_exponent`, or a `currencies` table in this sync-v2 implementation.

---

## Task 1: Protocol Contract Tests

**Files:**

- Modify: `packages/protobuf/proto/sync.proto`
- Generated: `packages/protobuf/src/sync.ts`
- Generated: `packages/protobuf/src/proto/sync.ts`
- Modify: `apps/api/src/sync/__test__/protobuf.test.ts`
- Modify: `apps/api/src/sync/protobuf.ts`

**Step 1: Write failing tests for v2 message roundtrip**

Add tests to `apps/api/src/sync/__test__/protobuf.test.ts`:

```ts
import {
  SyncPullBatchResponse,
  SyncPushBatchRequest,
} from "@repo/protobuf/sync";

test("encodes and decodes v2 multitable batch with typed product rows and json fallback", () => {
  const request = SyncPushBatchRequest.create({
    outletId: "outlet-1",
    products: {
      created: [
        {
          id: "product-1",
          merchantId: "merchant-1",
          name: "Kopi",
          priceMinorUnits: 15_000n,
          updatedAt: "2026-05-17T00:00:00.000Z",
        },
      ],
      updated: [],
      deletedIds: ["product-deleted"],
    },
    jsonTables: [
      {
        table: "categories",
        createdJson: [JSON.stringify({ id: "cat-1", name: "Minuman" })],
        updatedJson: [],
        deletedIds: [],
      },
    ],
  });

  const decoded = SyncPushBatchRequest.decode(
    SyncPushBatchRequest.encode(request).finish()
  );

  expect(decoded.outletId).toBe("outlet-1");
  expect(decoded.products?.created[0]?.name).toBe("Kopi");
  expect(decoded.products?.deletedIds).toEqual(["product-deleted"]);
  expect(decoded.jsonTables[0]?.table).toBe("categories");
});

test("encodes and decodes v2 pull batch response with server cursor", () => {
  const response = SyncPullBatchResponse.create({
    latestEventId: 42,
    needsFullResync: false,
    serverTime: "2026-05-17T00:00:00.000Z",
    orders: {
      created: [
        {
          id: "order-1",
          outletId: "outlet-1",
          totalMinorUnits: 20_000n,
          status: "paid",
          updatedAt: "2026-05-17T00:00:00.000Z",
        },
      ],
      updated: [],
      deletedIds: [],
    },
  });

  const decoded = SyncPullBatchResponse.decode(
    SyncPullBatchResponse.encode(response).finish()
  );

  expect(decoded.latestEventId).toBe(42n);
  expect(decoded.orders?.created[0]?.id).toBe("order-1");
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/api/src/sync/__test__/protobuf.test.ts
```

Expected: FAIL because `SyncPushBatchRequest` and `SyncPullBatchResponse` do not exist.

**Step 3: Add v2 proto messages**

Modify `packages/protobuf/proto/sync.proto` with the v2 messages above. Keep all existing v1 messages and field numbers unchanged.

**Step 4: Change ts-proto long handling and regenerate protobuf code**

First update `packages/protobuf/package.json` so the `generate` script uses:

```text
forceLong=bigint
```

instead of the current:

```text
forceLong=number
```

Then run the repo's protobuf generation command. First inspect `packages/protobuf/package.json`; expected command is likely one of:

```bash
bun --filter @repo/protobuf generate
```

or:

```bash
bun run --cwd packages/protobuf generate
```

If no script exists, follow the existing generation pattern used by previous protobuf work in `docs/plans/2026-05-10-protobuf-sync-implementation.md`.

**Step 5: Update existing TypeScript call sites for bigint cursors**

Because `forceLong=bigint` applies to all int64 fields, update existing TypeScript sync wrappers and tests that read or write int64 cursor fields:

- `apps/pos-app/src/lib/api/sync.ts`
- `apps/pos-app/src/lib/api/__test__/sync.test.ts`
- `apps/api/src/sync/protobuf.ts`
- `apps/api/src/sync/__test__/protobuf.test.ts`
- `apps/api/src/sync/__test__/routes-protobuf.test.ts`

Rules:

- Convert request number cursors with `BigInt(value)` when building protobuf messages.
- Convert response cursor `bigint` values with a helper that checks `value <= BigInt(Number.MAX_SAFE_INTEGER)` before `Number(value)`.
- Keep API service internals as `number` until a separate cursor migration is planned.
- Use `15000n` style literals for typed money fields in protobuf tests.

Add helper:

```ts
export function protobufInt64ToSafeNumber(value: bigint, fieldName: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${fieldName} exceeds Number.MAX_SAFE_INTEGER`);
  }
  return Number(value);
}
```

Place the helper in the smallest existing protobuf/sync utility module where both API and app tests can reasonably use it, or duplicate narrowly if sharing would introduce an awkward dependency.

**Step 6: Run tests to verify they pass**

Run:

```bash
bun test apps/api/src/sync/__test__/protobuf.test.ts
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
bun test apps/pos-app/src/lib/api/__test__/sync.test.ts
```

Expected: PASS.

**Step 7: Run formatting/lint**

Run:

```bash
bun x ultracite check
```

Expected: PASS or only pre-existing unrelated issues.

**Step 8: Commit**

```bash
git add packages/protobuf/package.json packages/protobuf/proto/sync.proto packages/protobuf/src/sync.ts packages/protobuf/src/proto/sync.ts apps/api/src/sync/__test__/protobuf.test.ts apps/api/src/sync/protobuf.ts apps/api/src/sync/__test__/routes-protobuf.test.ts apps/pos-app/src/lib/api/sync.ts apps/pos-app/src/lib/api/__test__/sync.test.ts
git commit -m "feat(sync): add v2 batch protobuf contract"
```

---

## Task 2: API V2 Encoding and Decoding Helpers

**Files:**

- Modify: `apps/api/src/sync/protobuf.ts`
- Modify: `apps/api/src/sync/__test__/protobuf.test.ts`

**Step 1: Write failing tests for decoding v2 push batches**

Add tests:

```ts
import {
  decodePushBatchRequest,
  encodePullBatchResponse,
  encodePushBatchResponse,
} from "../protobuf";

test("decodePushBatchRequest normalizes typed and json table changes", () => {
  const decoded = decodePushBatchRequest(
    SyncPushBatchRequest.create({
      outletId: "outlet-1",
      idempotencyKey: "sync-request-1",
      products: {
        created: [
          {
            id: "product-1",
            merchantId: "merchant-1",
            name: "Kopi",
            priceMinorUnits: 15_000n,
            updatedAt: "2026-05-17T00:00:00.000Z",
          },
        ],
      },
      jsonTables: [
        {
          table: "categories",
          createdJson: [JSON.stringify({ id: "cat-1", name: "Minuman" })],
        },
      ],
    })
  );

  expect(decoded.products.created[0]).toMatchObject({
    id: "product-1",
    name: "Kopi",
  });
  expect(decoded.categories.created[0]).toMatchObject({
    id: "cat-1",
  });
});

test("encodePushBatchResponse returns per-table accepted and rejected ids", () => {
  const encoded = encodePushBatchResponse({
    latestEventId: 12,
    serverTime: "2026-05-17T00:00:00.000Z",
    tables: [
      {
        table: "products",
        acceptedCreatedIds: ["product-1"],
        acceptedUpdatedIds: [],
        acceptedDeletedIds: [],
        rejected: [{ id: "product-2", reason: "server_newer" }],
      },
    ],
  });

  expect(encoded.tables[0]?.table).toBe("products");
  expect(encoded.tables[0]?.rejected[0]?.reason).toBe("server_newer");
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/api/src/sync/__test__/protobuf.test.ts
```

Expected: FAIL because helper functions do not exist.

**Step 3: Implement normalization types**

In `apps/api/src/sync/protobuf.ts`, add:

```ts
export interface TableChangeSet {
  created: Record<string, unknown>[];
  updated: Record<string, unknown>[];
  deletedIds: string[];
}

export type PushBatchChanges = Record<string, TableChangeSet>;

function emptyTableChangeSet(): TableChangeSet {
  return { created: [], updated: [], deletedIds: [] };
}

function parseJsonRows(table: string, rows: string[]): Record<string, unknown>[] {
  return rows.map((rowJson) => {
    const parsed: unknown = JSON.parse(rowJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`Invalid JSON row for ${table}`);
    }
    return parsed as Record<string, unknown>;
  });
}
```

Add conversion helpers from typed generated rows to plain records. Preserve generated camelCase property names because `service.ts` already expects camelCase from v1 decoded JSON.

**Step 4: Implement `decodePushBatchRequest`**

Add:

```ts
export function decodePushBatchRequest(request: SyncPushBatchRequest): PushBatchChanges {
  const changes: PushBatchChanges = {};

  for (const table of request.jsonTables) {
    changes[table.table] = {
      created: parseJsonRows(table.table, table.createdJson),
      updated: parseJsonRows(table.table, table.updatedJson),
      deletedIds: table.deletedIds,
    };
  }

  if (request.products) {
    changes.products = {
      created: request.products.created,
      updated: request.products.updated,
      deletedIds: request.products.deletedIds,
    };
  }

  if (request.outletProducts) {
    changes.outlet_products = {
      created: request.outletProducts.created,
      updated: request.outletProducts.updated,
      deletedIds: request.outletProducts.deletedIds,
    };
  }

  if (request.orders) {
    changes.orders = {
      created: request.orders.created,
      updated: request.orders.updated,
      deletedIds: request.orders.deletedIds,
    };
  }

  if (request.orderItems) {
    changes.order_items = {
      created: request.orderItems.created,
      updated: request.orderItems.updated,
      deletedIds: request.orderItems.deletedIds,
    };
  }

  return changes;
}
```

Adjust property names to match generated ts-proto output.

**Step 5: Implement v2 encoders**

Add:

```ts
export interface PushBatchResult {
  latestEventId: number;
  serverTime: string;
  tables: {
    table: string;
    acceptedCreatedIds: string[];
    acceptedUpdatedIds: string[];
    acceptedDeletedIds: string[];
    rejected: { id: string; reason: string }[];
  }[];
}

export function encodePushBatchResponse(result: PushBatchResult): SyncPushBatchResponse {
  return SyncPushBatchResponse.create(result);
}
```

Also add `encodePullBatchResponse` that maps normalized typed and JSON result records to `SyncPullBatchResponse`.

**Step 6: Run tests**

Run:

```bash
bun test apps/api/src/sync/__test__/protobuf.test.ts
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/api/src/sync/protobuf.ts apps/api/src/sync/__test__/protobuf.test.ts
git commit -m "feat(sync): add v2 batch protobuf helpers"
```

---

## Task 3: API Service Push Batch Semantics

**Files:**

- Modify: `apps/api/src/sync/service.ts`
- Modify: `apps/api/src/sync/__test__/service.test.ts`

**Step 1: Write failing service tests**

Add tests under a new `describe("handlePushBatch")` block:

```ts
test("handlePushBatch accepts created updated and deleted rows across tables in one transaction", async () => {
  const values = vi.fn().mockResolvedValue(undefined);
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  const update = vi.fn().mockReturnValue({ set });
  const insert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoNothing,
      onConflictDoUpdate,
    }),
  });

  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
    const tx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      insert,
      update,
    };
    await fn(tx);
  });

  const result = await handlePushBatch("outlet-1", "merchant-1", {
    products: {
      created: [{ id: "product-1", name: "Kopi", updatedAt: "2026-05-17T00:00:00.000Z" }],
      updated: [],
      deletedIds: [],
    },
    orders: {
      created: [{ id: "order-1", totalMinorUnits: 15000n, updatedAt: "2026-05-17T00:00:00.000Z" }],
      updated: [],
      deletedIds: [],
    },
  });

  expect(result.tables.find((table) => table.table === "products")?.acceptedCreatedIds).toEqual([
    "product-1",
  ]);
  expect(result.tables.find((table) => table.table === "orders")?.acceptedCreatedIds).toEqual([
    "order-1",
  ]);
  expect(insert.mock.calls.length).toBeLessThanOrEqual(4);
});

test("handlePushBatch rejects stale updates with reason", async () => {
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
    const tx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "product-1", updatedAt: "2026-05-18T00:00:00.000Z" },
            ]),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
    };
    await fn(tx);
  });

  const result = await handlePushBatch("outlet-1", "merchant-1", {
    products: {
      created: [],
      updated: [{ id: "product-1", name: "Old", updatedAt: "2026-05-17T00:00:00.000Z" }],
      deletedIds: [],
    },
  });

  expect(result.tables[0]?.rejected).toEqual([
    { id: "product-1", reason: "server_newer" },
  ]);
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: FAIL because `handlePushBatch` does not exist.

**Step 3: Introduce service types**

In `apps/api/src/sync/service.ts`, add:

```ts
export interface TableChangeSet {
  created: Record<string, unknown>[];
  updated: Record<string, unknown>[];
  deletedIds: string[];
}

export type PushBatchChanges = Record<string, TableChangeSet>;

export interface PushBatchTableAck {
  table: string;
  acceptedCreatedIds: string[];
  acceptedUpdatedIds: string[];
  acceptedDeletedIds: string[];
  rejected: { id: string; reason: string }[];
}
```

**Step 4: Refactor existing push helpers for operation-aware bulk calls**

Keep `handlePush` intact for v1, but do not implement v2 by looping rows through `upsertRowForTableName`. V2 must process one table operation in bulk so a large offline batch does not become thousands of sequential Turso queries.

Target per table:

- created rows: one `insert(...).values(rows).onConflictDoUpdate(...)`
- updated rows: one `insert(...).values(rows).onConflictDoUpdate(...)`
- deleted IDs: one bulk soft-delete `update(...).set({ deletedAt, updatedAt }).where(inArray(id, deletedIds))`
- sync events: one bulk `insert(syncEvents).values(events)` for accepted rows

The created and updated write path must be a maximum of two batch write queries per table. Do not perform one write per row.

For conflict detection, prefetch existing rows for all IDs in one query per operation group before writing:

```ts
const existingRows = await tx
  .select({ id: table.id, updatedAt: table.updatedAt })
  .from(table)
  .where(inArray(table.id, rowIds));
```

Then partition incoming rows in memory:

- accepted if row is new or client timestamp is newer/equal
- rejected if server timestamp is newer

Only accepted rows go into the bulk write. Rejected rows go into the ack with `reason: "server_newer"`.

Implement table-specific bulk helpers rather than a generic dynamic Drizzle table abstraction if generic typing becomes awkward. Duplication across the first four hot tables is acceptable if it keeps types clear.

Example shape:

```ts
async function processPushBatchTable(input: {
  merchantId: string;
  outletId: string;
  tableName: string;
  changes: TableChangeSet;
  tx: TransactionTx;
}): Promise<PushBatchTableAck> {
  const ack: PushBatchTableAck = {
    table: input.tableName,
    acceptedCreatedIds: [],
    acceptedUpdatedIds: [],
    acceptedDeletedIds: [],
    rejected: [],
  };

  const acceptedCreated = await partitionAcceptedRows(input, input.changes.created);
  const acceptedUpdated = await partitionAcceptedRows(input, input.changes.updated);
  const acceptedDeletedIds = await partitionAcceptedDeleteIds(input, input.changes.deletedIds);

  await bulkUpsertRows(input, acceptedCreated.accepted, "insert");
  await bulkUpsertRows(input, acceptedUpdated.accepted, "update");
  await bulkSoftDeleteRows(input, acceptedDeletedIds.acceptedIds);
  await bulkInsertSyncEvents(input, [
    ...acceptedCreated.events,
    ...acceptedUpdated.events,
    ...acceptedDeletedIds.events,
  ]);

  ack.acceptedCreatedIds.push(...acceptedCreated.accepted.map((row) => row.id as string));
  ack.acceptedUpdatedIds.push(...acceptedUpdated.accepted.map((row) => row.id as string));
  ack.acceptedDeletedIds.push(...acceptedDeletedIds.acceptedIds);
  ack.rejected.push(
    ...acceptedCreated.rejected,
    ...acceptedUpdated.rejected,
    ...acceptedDeletedIds.rejected
  );

  return ack;
}
```

Do not use `for await` or sequential row loops for normal push writes. Small loops to build arrays in memory are fine; database I/O must be batched by table and operation.

**Step 5: Implement `handlePushBatch`**

```ts
export async function handlePushBatch(
  outletId: string,
  merchantId: string,
  changes: PushBatchChanges
) {
  const tables: PushBatchTableAck[] = [];

  await db.transaction(async (tx) => {
    for (const tableName of PUSH_TABLE_ORDER) {
      const tableChanges = changes[tableName];
      if (!tableChanges) {
        continue;
      }

      const ack = await processPushBatchTable({
        merchantId,
        outletId,
        tableName,
        changes: tableChanges,
        tx,
      });
      tables.push(ack);
    }
  });

  return {
    latestEventId: 0,
    serverTime: new Date().toISOString(),
    tables,
  };
}
```

Set `latestEventId` correctly in a later task once event IDs can be read after transaction writes.

**Step 6: Run tests**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: PASS for new tests and existing push tests.

**Step 7: Commit**

```bash
git add apps/api/src/sync/service.ts apps/api/src/sync/__test__/service.test.ts
git commit -m "feat(sync): add v2 push batch service"
```

---

## Task 4: API V2 Routes

**Files:**

- Modify: `apps/api/src/sync/routes.ts`
- Modify: `apps/api/src/sync/__test__/routes-protobuf.test.ts`

**Step 1: Write failing route tests for push batch**

Add a route test:

```ts
import {
  SyncPushBatchRequest,
  SyncPushBatchResponse,
} from "@repo/protobuf/sync";

test("POST /api/sync/v2/push-batch accepts protobuf batch and returns protobuf ack", async () => {
  mockHandlePushBatch.mockResolvedValueOnce({
    latestEventId: 12,
    serverTime: "2026-05-17T00:00:00.000Z",
    tables: [
      {
        table: "products",
        acceptedCreatedIds: ["product-1"],
        acceptedUpdatedIds: [],
        acceptedDeletedIds: [],
        rejected: [],
      },
    ],
  });

  const body = SyncPushBatchRequest.encode(
    SyncPushBatchRequest.create({
      outletId: "outlet-1",
      idempotencyKey: "sync-request-1",
      products: {
        created: [{ id: "product-1", name: "Kopi", updatedAt: "2026-05-17T00:00:00.000Z" }],
      },
    })
  ).finish();

  const response = await app.handle(
    new Request("http://localhost/api/sync/v2/push-batch", {
      body,
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/x-protobuf",
      },
      method: "POST",
    })
  );

  expect(response.status).toBe(200);
  const decoded = SyncPushBatchResponse.decode(new Uint8Array(await response.arrayBuffer()));
  expect(decoded.tables[0]?.acceptedCreatedIds).toEqual(["product-1"]);
});
```

**Step 2: Run route tests to verify they fail**

Run:

```bash
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
```

Expected: FAIL because route and mock do not exist.

**Step 3: Wire route imports**

Modify `apps/api/src/sync/routes.ts`:

```ts
import {
  SyncPullBatchRequest,
  SyncPullBatchResponse,
  SyncPushBatchRequest,
  SyncPushBatchResponse,
} from "@repo/protobuf/sync";
```

Import v2 helpers:

```ts
import {
  decodePushBatchRequest,
  encodePullBatchResponse,
  encodePushBatchResponse,
} from "./protobuf";
```

Import v2 services:

```ts
import {
  handlePullBatch,
  handlePushBatch,
} from "./service";
```

**Step 4: Add `/v2/push-batch` route**

Add under `syncRoutes`:

```ts
.post(
  "/v2/push-batch",
  async ({ body, session, set }) => {
    const pushRequest = body as SyncPushBatchRequest;
    throwIfFalse(
      await verifyOutletAccess(session.userId, pushRequest.outletId),
      new ForbiddenRequestError()
    );

    const [outlet] = await db
      .select({ merchantId: outlets.merchantId })
      .from(outlets)
      .where(eq(outlets.id, pushRequest.outletId))
      .limit(1);

    if (!outlet) {
      set.status = 404;
      return { error: "Outlet not found" };
    }

    const changes = decodePushBatchRequest(pushRequest);
    const result = await handlePushBatch(pushRequest.outletId, outlet.merchantId, changes);
    return encodePushBatchResponse(result);
  },
  {
    proto: {
      req: SyncPushBatchRequest,
      res: SyncPushBatchResponse,
    },
  }
)
```

**Step 5: Run route tests**

Run:

```bash
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
```

Expected: PASS for push route.

**Step 6: Commit**

```bash
git add apps/api/src/sync/routes.ts apps/api/src/sync/__test__/routes-protobuf.test.ts
git commit -m "feat(sync): expose v2 push batch route"
```

---

## Task 5: API Pull Batch Service and Route

**Files:**

- Modify: `apps/api/src/sync/service.ts`
- Modify: `apps/api/src/sync/routes.ts`
- Modify: `apps/api/src/sync/protobuf.ts`
- Modify: `apps/api/src/sync/__test__/service.test.ts`
- Modify: `apps/api/src/sync/__test__/routes-protobuf.test.ts`

**Step 1: Write failing service tests for pull batch**

Add tests:

```ts
test("handlePullBatch returns typed hot table rows and json fallback rows from events", async () => {
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([
        { id: 10, rowId: "product-1", tableName: "products" },
        { id: 11, rowId: "cat-1", tableName: "categories" },
      ]),
    }),
  });

  // Mock subsequent selectSnapshotsForEvents queries according to existing service test style.

  const result = await handlePullBatch({
    afterEventId: 9,
    limit: 2_000,
    merchantId: "merchant-1",
    outletId: "outlet-1",
    pageCursor: "",
    tables: ["products", "categories"],
  });

  expect(result.latestEventId).toBe(11);
  expect(result.hasMore).toBe(false);
  expect(result.needsFullResync).toBe(false);
  expect(result.products.updated[0]).toMatchObject({ id: "product-1" });
  expect(result.jsonTables.find((table) => table.table === "categories")).toBeDefined();
});
```

Use the existing `handleEventPull` tests as the mock template.

**Step 2: Run service tests to verify they fail**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: FAIL because `handlePullBatch` does not exist.

**Step 3: Implement `handlePullBatch`**

Add:

```ts
export interface PullBatchInput {
  afterEventId: number;
  limit: number;
  merchantId: string;
  outletId: string;
  pageCursor: string;
  tables: string[];
}

export async function handlePullBatch(input: PullBatchInput) {
  const eventPull = await handleEventPull({
    afterEventId: input.afterEventId,
    limit: input.limit,
    merchantId: input.merchantId,
    outletId: input.outletId,
    pageCursor: input.pageCursor,
  });

  return normalizePullBatchResult(eventPull, input.tables);
}
```

Implement `normalizePullBatchResult` so:

- `products`, `outlet_products`, `orders`, `order_items` become typed changes.
- other tables become `jsonTables`.
- rows from event pulls are treated as `updated` unless event operation can be safely included. If operation is available in `sync_events`, extend `handleEventPull` to select operation and split into created/updated/deleted.

Preferred improvement: include `operation` in event selection:

```ts
.select({
  id: syncEvents.id,
  operation: syncEvents.operation,
  rowId: syncEvents.rowId,
  tableName: syncEvents.tableName,
})
```

Then map:

- `insert` -> `created`
- `update` -> `updated`
- `delete` -> `deletedIds`

Apply bounded pagination in this service. The API must enforce a server-side maximum `limit` of 2,000 rows or a smaller configured value, regardless of the client-provided limit. If there are more rows after the page, return `hasMore: true` and a stable `nextPageCursor`. The cursor can initially be the last processed event ID encoded as a string; if the query later needs multi-column ordering, version the cursor string instead of overloading it silently.

**Step 4: Write failing route test for pull batch**

Add:

```ts
test("POST /api/sync/v2/pull-batch returns protobuf batch changes", async () => {
  mockHandlePullBatch.mockResolvedValueOnce({
    latestEventId: 12,
    needsFullResync: false,
    serverTime: "2026-05-17T00:00:00.000Z",
    products: {
      created: [],
      updated: [{ id: "product-1", name: "Kopi", updatedAt: "2026-05-17T00:00:00.000Z" }],
      deletedIds: [],
    },
    jsonTables: [],
  });

  const body = SyncPullBatchRequest.encode(
    SyncPullBatchRequest.create({
      afterEventId: 10,
      limit: 2_000,
      outletId: "outlet-1",
      pageCursor: "",
      tables: ["products"],
    })
  ).finish();

  const response = await app.handle(
    new Request("http://localhost/api/sync/v2/pull-batch", {
      body,
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/x-protobuf",
      },
      method: "POST",
    })
  );

  expect(response.status).toBe(200);
  const decoded = SyncPullBatchResponse.decode(new Uint8Array(await response.arrayBuffer()));
  expect(decoded.products?.updated[0]?.id).toBe("product-1");
});
```

**Step 5: Implement `/v2/pull-batch` route**

Add route mirroring `/pull-events`, but call `handlePullBatch` and `encodePullBatchResponse`.

**Step 6: Run tests**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/api/src/sync/service.ts apps/api/src/sync/routes.ts apps/api/src/sync/protobuf.ts apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts
git commit -m "feat(sync): add v2 pull batch API"
```

---

## Task 6: Rust V2 Protobuf Builders

**Files:**

- Modify: `apps/pos-app/src-tauri/src/sync/protobuf.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/mod.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/schema.rs`

**Step 1: Write failing Rust tests for v2 builders**

Add tests in `apps/pos-app/src-tauri/src/sync/mod.rs`:

```rust
#[test]
fn build_push_batch_request_groups_typed_products_and_json_fallback() {
    let mut tables = serde_json::Map::new();
    tables.insert(
        "products".to_string(),
        serde_json::json!({
            "created": [{ "id": "product-1", "merchantId": "merchant-1", "name": "Kopi", "priceMinorUnits": 15000, "updatedAt": "2026-05-17T00:00:00.000Z" }],
            "updated": [],
            "deletedIds": ["product-deleted"]
        }),
    );
    tables.insert(
        "categories".to_string(),
        serde_json::json!({
            "created": [{ "id": "cat-1", "name": "Minuman" }],
            "updated": [],
            "deletedIds": []
        }),
    );

    let request = build_sync_push_batch_request("outlet-1", serde_json::Value::Object(tables))
        .expect("batch request should build");

    assert_eq!(request.outlet_id, "outlet-1");
    assert_eq!(request.products.as_ref().unwrap().created[0].id, "product-1");
    assert_eq!(request.json_tables[0].table, "categories");
}
```

**Step 2: Run Rust tests to verify they fail**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync::tests::build_push_batch_request_groups_typed_products_and_json_fallback
```

Expected: FAIL because builder does not exist.

**Step 3: Implement typed row conversion helpers**

In `apps/pos-app/src-tauri/src/sync/protobuf.rs`, add helpers like:

```rust
fn json_string(value: &serde_json::Value, key: &str) -> String {
    value.get(key).and_then(|value| value.as_str()).unwrap_or_default().to_string()
}

fn json_i64(value: &serde_json::Value, key: &str) -> i64 {
    value.get(key).and_then(|value| value.as_i64()).unwrap_or_default()
}

fn json_bool(value: &serde_json::Value, key: &str) -> bool {
    value.get(key).and_then(|value| value.as_bool()).unwrap_or(false)
}
```

Implement converters:

```rust
fn product_row_from_json(value: &serde_json::Value) -> ProductRow {
    ProductRow {
        id: json_string(value, "id"),
        merchant_id: json_string(value, "merchantId"),
        name: json_string(value, "name"),
        description: json_string(value, "description"),
        price_minor_units: json_i64(value, "priceMinorUnits"),
        category_id: json_string(value, "categoryId"),
        image_asset_id: json_string(value, "imageAssetId"),
        created_at: json_string(value, "createdAt"),
        updated_at: json_string(value, "updatedAt"),
        deleted_at: json_string(value, "deletedAt"),
    }
}
```

Add equivalent helpers for `OutletProductRow`, `OrderRow`, and `OrderItemRow` after verifying actual local row keys.

**Step 4: Implement `build_sync_push_batch_request`**

```rust
pub(super) fn build_sync_push_batch_request(
    outlet_id: &str,
    tables: serde_json::Value,
) -> Result<SyncPushBatchRequest, String> {
    let mut request = SyncPushBatchRequest {
        outlet_id: outlet_id.to_string(),
        json_tables: Vec::new(),
        products: None,
        outlet_products: None,
        orders: None,
        order_items: None,
    };

    let map = tables
        .as_object()
        .ok_or_else(|| "Push batch tables must be a JSON object".to_string())?;

    for (table, changes) in map {
        match table.as_str() {
            "products" => request.products = Some(product_changes_from_json(changes)?),
            "outlet_products" => request.outlet_products = Some(outlet_product_changes_from_json(changes)?),
            "orders" => request.orders = Some(order_changes_from_json(changes)?),
            "order_items" => request.order_items = Some(order_item_changes_from_json(changes)?),
            _ => request.json_tables.push(json_table_changes_from_json(table, changes)?),
        }
    }

    Ok(request)
}
```

**Step 5: Run Rust tests**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync::tests::build_push_batch_request_groups_typed_products_and_json_fallback
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/pos-app/src-tauri/src/sync/protobuf.rs apps/pos-app/src-tauri/src/sync/mod.rs
git commit -m "feat(sync): add rust v2 protobuf batch builders"
```

---

## Task 7: Local Change-Set Builder in Rust

**Files:**

- Modify: `apps/pos-app/src-tauri/src/sync/schema.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/push.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/mod.rs`

**Step 1: Write failing tests for outbox-operation grouping**

Add a pure helper test:

```rust
#[test]
fn groups_rows_by_sync_outbox_operation_not_timestamps() {
    let rows = vec![
        OutboxRowForSync {
            operation: "insert".to_string(),
            row: serde_json::json!({
                "id": "new-but-edited-offline",
                "createdAt": "2026-05-17T12:01:00.000Z",
                "updatedAt": "2026-05-17T12:03:00.000Z"
            }),
        },
        OutboxRowForSync {
            operation: "update".to_string(),
            row: serde_json::json!({
                "id": "updated",
                "createdAt": "2026-05-16T00:00:00.000Z",
                "updatedAt": "2026-05-17T00:00:00.000Z"
            }),
        },
        OutboxRowForSync {
            operation: "delete".to_string(),
            row: serde_json::json!({
                "id": "deleted",
                "deletedAt": "2026-05-17T00:00:00.000Z"
            }),
        },
    ];

    let changes = outbox_rows_to_table_changes(rows).expect("rows should group");

    assert_eq!(changes["created"].as_array().unwrap().len(), 1);
    assert_eq!(changes["created"][0]["id"], "new-but-edited-offline");
    assert_eq!(changes["updated"].as_array().unwrap().len(), 1);
    assert_eq!(changes["deletedIds"].as_array().unwrap(), &vec![serde_json::json!("deleted")]);
}
```

**Step 2: Run Rust tests to verify failure**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync::tests::groups_rows_by_sync_outbox_operation_not_timestamps
```

Expected: FAIL because helper does not exist.

**Step 3: Implement operation-aware row grouping helper**

Add:

```rust
#[derive(Debug)]
pub(super) struct OutboxRowForSync {
    pub operation: String,
    pub row: serde_json::Value,
}

pub(super) fn outbox_rows_to_table_changes(
    rows: Vec<OutboxRowForSync>,
) -> Result<serde_json::Value, String> {
    let mut created = Vec::new();
    let mut updated = Vec::new();
    let mut deleted_ids = Vec::new();

    for item in rows {
        match item.operation.as_str() {
            "insert" => created.push(item.row),
            "update" => updated.push(item.row),
            "delete" => {
                let id = item
                    .row
                    .get("id")
                    .and_then(|value| value.as_str())
                    .ok_or_else(|| "Deleted outbox row is missing id".to_string())?;
                deleted_ids.push(serde_json::Value::String(id.to_string()));
            }
            other => return Err(format!("Unknown sync outbox operation: {}", other)),
        }
    }

    Ok(serde_json::json!({
        "created": created,
        "updated": updated,
        "deletedIds": deleted_ids,
    }))
}
```

Do not use `createdAt == updatedAt` or `deletedAt` inference for v2 operation grouping. `sync_outbox.operation` is the only source of truth.

**Step 4: Refactor unsynced row reading to join `sync_outbox`**

Keep `read_unsynced_rows` for v1. Add:

```rust
pub(super) async fn read_unsynced_table_changes_from_outbox(
    pool: &SqlitePool,
    table: &str,
    filter_value: &str,
) -> Result<serde_json::Value, String> {
    let filter_col = get_table_filter_column(table);
    let query = format!(
        "SELECT t.*, o.operation AS __sync_operation
         FROM {table} t
         INNER JOIN sync_outbox o ON o.table_name = ?2 AND o.row_id = t.id AND o.synced_at IS NULL
         WHERE t.{filter_col} = ?1
         ORDER BY o.changed_at ASC"
    );

    let rows = sqlx::query(&query)
        .bind(filter_value)
        .bind(table)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to read v2 outbox changes for {}: {}", table, e))?;

    let mut result = Vec::new();
    for row in &rows {
        let operation = row
            .try_get::<String, _>("__sync_operation")
            .map_err(|e| format!("Failed to read sync operation for {}: {}", table, e))?;
        let mut obj = serde_json::Map::new();
        for (idx, col) in row.columns().iter().enumerate() {
            let name = col.name();
            if name == "__sync_operation" || LOCAL_ONLY_COLUMNS.contains(&name) {
                continue;
            }
            obj.insert(snake_to_camel(name), sqlite::sqlx_value_to_json(row, idx));
        }
        result.push(OutboxRowForSync {
            operation,
            row: serde_json::Value::Object(obj),
        });
    }

    outbox_rows_to_table_changes(result)
}
```

If a legacy `is_synced = 0` row has no `sync_outbox` entry, keep it on the v1 push path or backfill an outbox row before v2 push. Do not let v2 infer the operation from timestamps.

**Step 5: Run tests**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync::tests::groups_rows_by_sync_outbox_operation_not_timestamps
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/pos-app/src-tauri/src/sync/schema.rs apps/pos-app/src-tauri/src/sync/mod.rs
git commit -m "feat(sync): group v2 changes by outbox operation"
```

---

## Task 8: Rust Push Batch Command

**Files:**

- Modify: `apps/pos-app/src-tauri/src/sync/push.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/commands.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/dto.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`
- Modify: `apps/pos-app/src/store/__test__/sync.test.ts`

**Step 1: Write failing frontend orchestration test**

In `apps/pos-app/src/store/__test__/sync.test.ts`, add:

```ts
test("uses v2 push batch command when local changes exist and no server changes", async () => {
  mockRequestUploadPendingProductImages.mockResolvedValueOnce(0);
  mockInvoke.mockResolvedValueOnce({
    last_server_event_id: 10,
    local_dirty_count: 1,
  });

  mockGetSyncStatus.mockResolvedValueOnce({
    changedTables: [],
    hasChanges: false,
    latestEventId: 10,
    needsFullResync: false,
    oldestAvailableEventId: 1,
  });

  mockInvoke.mockResolvedValueOnce({
    pull: { rows_received: 0, server_time: "" },
    purged: 0,
    push: {
      server_time: "2026-05-17T00:00:00.000Z",
      server_wins_count: 0,
      tables_synced: ["products"],
    },
  });

  await syncNow();

  expect(mockInvoke).toHaveBeenLastCalledWith("sync_push_batch_v2", {
    apiUrl: expect.any(String),
    outletId: "outlet-1",
    sessionToken: "test-session-token",
  });
});
```

**Step 2: Run frontend test to verify failure**

Run:

```bash
bun test apps/pos-app/src/store/__test__/sync.test.ts
```

Expected: FAIL because store still calls `sync_push_outbox`.

**Step 3: Write failing Rust test for request URL**

Add a pure test for endpoint builder if practical, or add a unit test for `build_sync_push_batch_request` endpoint use.

**Step 4: Implement `sync_push_batch_inner`**

In `apps/pos-app/src-tauri/src/sync/push.rs`, add a v2 function parallel to `sync_push_inner`:

```rust
pub(super) async fn sync_push_batch_inner(
    pool: &SqlitePool,
    outlet_id: &str,
    api_url: &str,
    session_token: &str,
) -> Result<PushResult, String> {
    let client = build_client(session_token)?;
    let merchant_id = resolve merchant_id as existing code does;

    let mut tables_json = serde_json::Map::new();
    for table in SYNC_TABLES {
        let filter_value = get_filter_value(table, outlet_id, &merchant_id)?;
        let changes = read_unsynced_table_changes_from_outbox(pool, table, filter_value).await?;
        tables_json.insert(table.to_string(), changes);
    }

    let request = build_sync_push_batch_request(outlet_id, serde_json::Value::Object(tables_json))?;
    let request_body = request.encode_to_vec();

    let response = client
        .post(format!("{}/api/sync/v2/push-batch", api_url))
        .header(reqwest::header::CONTENT_TYPE, "application/x-protobuf")
        .header(reqwest::header::ACCEPT, "application/x-protobuf")
        .body(request_body)
        .send()
        .await
        .map_err(|e| format!("Sync v2 push batch failed: {}", e))?;

    decode SyncPushBatchResponse;
    mark accepted rows synced;
    keep rejected rows dirty;
    mark accepted outbox rows synced;
    return PushResult;
}
```

For the first implementation, reuse `mark_rows_synced_tx` with rejected IDs as skip IDs. Later improve accepted-only marking if needed.

**Step 5: Add Tauri command**

In `apps/pos-app/src-tauri/src/sync/commands.rs`:

```rust
#[command]
pub async fn sync_push_batch_v2(
    outlet_id: String,
    api_url: String,
    session_token: String,
    state: State<'_, AppState>,
) -> Result<SyncNowResult, String> {
    let push = super::push::sync_push_batch_inner(
        &state.db_pool,
        &outlet_id,
        &api_url,
        &session_token,
    ).await?;

    Ok(SyncNowResult {
        pull: super::dto::empty_pull_result(),
        push,
        purged: 0,
    })
}
```

Register command in `apps/pos-app/src-tauri/src/lib.rs`.

**Step 6: Switch store push-only branch**

In `apps/pos-app/src/store/sync.ts`, change only the push-only branch to call `sync_push_batch_v2`.

Do not switch full sync or pull-only yet.

**Step 7: Run tests**

Run:

```bash
bun test apps/pos-app/src/store/__test__/sync.test.ts
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

**Step 8: Commit**

```bash
git add apps/pos-app/src/store/sync.ts apps/pos-app/src/store/__test__/sync.test.ts apps/pos-app/src-tauri/src/sync/push.rs apps/pos-app/src-tauri/src/sync/commands.rs apps/pos-app/src-tauri/src/sync/dto.rs apps/pos-app/src-tauri/src/lib.rs
git commit -m "feat(sync): push local changes with v2 batch command"
```

---

## Task 9: Rust Pull Batch Command

**Files:**

- Modify: `apps/pos-app/src-tauri/src/sync/commands.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/protobuf.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/push.rs`
- Modify: `apps/pos-app/src/store/sync.ts`
- Modify: `apps/pos-app/src/store/__test__/sync.test.ts`

**Step 1: Write failing frontend test**

Change or add test:

```ts
test("uses v2 pull batch command when server changes exist and no local changes", async () => {
  mockRequestUploadPendingProductImages.mockResolvedValueOnce(0);
  mockInvoke.mockResolvedValueOnce({
    last_server_event_id: 10,
    local_dirty_count: 0,
  });

  mockGetSyncStatus.mockResolvedValueOnce({
    changedTables: ["products", "orders"],
    hasChanges: true,
    latestEventId: 12,
    needsFullResync: false,
    oldestAvailableEventId: 1,
  });

  mockInvoke.mockResolvedValueOnce({
    pull: { rows_received: 2, server_time: "2026-05-17T00:00:00.000Z" },
    purged: 0,
    push: { server_time: "", server_wins_count: 0, tables_synced: [] },
  });

  await syncNow();

  expect(mockInvoke).toHaveBeenLastCalledWith("sync_pull_batch_v2", {
    apiUrl: expect.any(String),
    latestEventId: 12,
    outletId: "outlet-1",
    sessionToken: "test-session-token",
    tables: ["products", "orders"],
  });
});
```

**Step 2: Run test to verify failure**

Run:

```bash
bun test apps/pos-app/src/store/__test__/sync.test.ts
```

Expected: FAIL because store still calls `sync_pull_events`.

**Step 3: Implement pull batch decoder**

In `apps/pos-app/src-tauri/src/sync/protobuf.rs`, add:

```rust
pub(super) fn pull_batch_response_to_json_map(
    response: SyncPullBatchResponse,
) -> Result<serde_json::Value, String> {
    let mut map = serde_json::Map::new();
    map.insert("products".to_string(), typed_product_changes_to_json(response.products));
    map.insert("outlet_products".to_string(), typed_outlet_product_changes_to_json(response.outlet_products));
    map.insert("orders".to_string(), typed_order_changes_to_json(response.orders));
    map.insert("order_items".to_string(), typed_order_item_changes_to_json(response.order_items));

    for table in response.json_tables {
        let mut rows = Vec::new();
        rows.extend(parse json created_json);
        rows.extend(parse json updated_json);
        for id in table.deleted_ids {
            rows.push(serde_json::json!({ "id": id, "deletedAt": response.server_time }));
        }
        map.insert(table.table, serde_json::Value::Array(rows));
    }

    Ok(serde_json::Value::Object(map))
}
```

The result shape should remain compatible with existing `upsert_row`.

**Step 4: Implement `sync_pull_batch_v2`**

Add Tauri command:

```rust
#[command]
pub async fn sync_pull_batch_v2(
    outlet_id: String,
    api_url: String,
    session_token: String,
    latest_event_id: i64,
    tables: Vec<String>,
    state: State<'_, AppState>,
) -> Result<SyncNowResult, String> {
    let pool = &state.db_pool;
    let client = super::http::build_client(&session_token)?;
    let after_event_id = get_last_server_event_id(pool, &outlet_id).await?;
    let request = SyncPullBatchRequest { outlet_id: outlet_id.clone(), after_event_id, tables };
    post to /api/sync/v2/pull-batch;
    decode SyncPullBatchResponse;
    if needs_full_resync return Err;
    convert response to JSON rows;
    upsert rows with existing upsert_row;
    set_last_server_event_id_tx to response.latest_event_id or latest_event_id fallback;
    return SyncNowResult;
}
```

**Step 5: Register command and switch store pull-only branch**

Register in `apps/pos-app/src-tauri/src/lib.rs`.

In `apps/pos-app/src/store/sync.ts`, change pull-only branch to call `sync_pull_batch_v2` with `tables: serverStatus.changedTables`.

**Step 6: Run tests**

Run:

```bash
bun test apps/pos-app/src/store/__test__/sync.test.ts
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/pos-app/src/store/sync.ts apps/pos-app/src/store/__test__/sync.test.ts apps/pos-app/src-tauri/src/sync/commands.rs apps/pos-app/src-tauri/src/sync/protobuf.rs apps/pos-app/src-tauri/src/lib.rs
git commit -m "feat(sync): pull server changes with v2 batch command"
```

---

## Task 10: Full Sync Uses V2 Internals

**Files:**

- Modify: `apps/pos-app/src-tauri/src/sync/commands.rs`
- Modify: `apps/pos-app/src/store/sync.ts`
- Modify: `apps/pos-app/src/store/__test__/sync.test.ts`

**Step 1: Write failing test for full sync path**

Add:

```ts
test("uses v2 full sync command when local and server changes both exist", async () => {
  mockRequestUploadPendingProductImages.mockResolvedValueOnce(0);
  mockInvoke.mockResolvedValueOnce({
    last_server_event_id: 10,
    local_dirty_count: 1,
  });

  mockGetSyncStatus.mockResolvedValueOnce({
    changedTables: ["products"],
    hasChanges: true,
    latestEventId: 12,
    needsFullResync: false,
    oldestAvailableEventId: 1,
  });

  mockInvoke.mockResolvedValueOnce({
    pull: { rows_received: 1, server_time: "2026-05-17T00:00:00.000Z" },
    purged: 0,
    push: {
      server_time: "2026-05-17T00:00:00.000Z",
      server_wins_count: 0,
      tables_synced: ["products"],
    },
  });

  await syncNow();

  expect(mockInvoke).toHaveBeenLastCalledWith("sync_now_v2", {
    apiUrl: expect.any(String),
    latestEventId: 12,
    outletId: "outlet-1",
    sessionToken: "test-session-token",
    tables: ["products"],
  });
});
```

**Step 2: Run test to verify failure**

Run:

```bash
bun test apps/pos-app/src/store/__test__/sync.test.ts
```

Expected: FAIL because store calls `sync_now`.

**Step 3: Implement `sync_now_v2`**

In `commands.rs`, add a v2 full command that:

1. Calls internal pull batch function.
2. Calls internal push batch function.
3. Runs existing garbage collection.
4. Returns `SyncNowResult`.

Prefer extracting GC into a helper so v1 and v2 share it.

**Step 4: Implement `sync_full_resync_v2`**

Add v2 full resync command parallel to v1:

1. Pull full table set using v2 or fallback v1 full pull if v2 replacement is not ready.
2. Push local dirty rows using v2.
3. Set event cursor.

For this plan, it is acceptable for baseline/full resync to keep using v1 pull temporarily if v2 event pull cannot represent full baseline yet. Document that as a temporary bridge in code comments and tests.

**Step 5: Switch store full branches**

Update:

- local+server changes -> `sync_now_v2`
- baseline/full resync -> `sync_full_resync_v2`

**Step 6: Run tests**

Run:

```bash
bun test apps/pos-app/src/store/__test__/sync.test.ts
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/pos-app/src/store/sync.ts apps/pos-app/src/store/__test__/sync.test.ts apps/pos-app/src-tauri/src/sync/commands.rs
git commit -m "feat(sync): route full sync through v2 batch flow"
```

---

## Task 11: Measure Payload Size and Keep Typed Tables Honest

**Files:**

- Create: `apps/api/src/sync/__test__/payload-size.test.ts`
- Modify: `docs/knowledge/APP-LOGGING-DOCS.md` only if adding new log prefixes

**Step 1: Write payload comparison test**

Add:

```ts
import {
  SyncPushBatchRequest,
  SyncPushRequest,
} from "@repo/protobuf/sync";

test("typed v2 product batch is smaller than v1 json payload for repeated product rows", () => {
  const jsonProducts = Array.from({ length: 100 }, (_, index) => ({
    id: `product-${index}`,
    merchantId: "merchant-1",
    name: `Product ${index}`,
    priceMinorUnits: 15_000 + index,
    updatedAt: "2026-05-17T00:00:00.000Z",
  }));
  const typedProducts = jsonProducts.map((product) => ({
    ...product,
    priceMinorUnits: BigInt(product.priceMinorUnits),
  }));

  const v1 = SyncPushRequest.encode(
    SyncPushRequest.create({
      outletId: "outlet-1",
      payloadJson: JSON.stringify({ products: jsonProducts }),
    })
  ).finish();

  const v2 = SyncPushBatchRequest.encode(
    SyncPushBatchRequest.create({
      outletId: "outlet-1",
      idempotencyKey: "sync-request-1",
      products: { created: typedProducts, updated: [], deletedIds: [] },
    })
  ).finish();

  expect(v2.byteLength).toBeLessThan(v1.byteLength);
});
```

**Step 2: Run test**

Run:

```bash
bun test apps/api/src/sync/__test__/payload-size.test.ts
```

Expected: PASS once typed protobuf is in place.

**Step 3: Add optional debug log only if needed**

If adding payload metrics logs, use existing logger docs first:

```bash
sed -n '1,220p' docs/knowledge/APP-LOGGING-DOCS.md
```

Then add a `[SYNC:...]` prefix and document it in the same change.

**Step 4: Commit**

```bash
git add apps/api/src/sync/__test__/payload-size.test.ts
git commit -m "test(sync): compare v1 and v2 protobuf payload sizes"
```

---

## Task 12: End-to-End Route and Store Regression Tests

**Files:**

- Modify: `apps/api/src/sync/__test__/routes-protobuf.test.ts`
- Modify: `apps/api/src/sync/__test__/service.test.ts`
- Modify: `apps/pos-app/src/store/__test__/sync.test.ts`
- Modify: `apps/pos-app/src/lib/api/__test__/sync.test.ts`

**Step 1: Add API auth/access regression tests**

Test both v2 endpoints:

- return `401` without session
- return `403` when `verifyOutletAccess` fails
- return `404` when outlet is missing
- reject invalid JSON fallback rows with `400`

**Step 2: Add store decision regression tests**

Assert:

- no local/no server changes still skips transfer
- local-only uses `sync_push_batch_v2`
- server-only uses `sync_pull_batch_v2`
- local+server uses `sync_now_v2`
- full resync uses `sync_full_resync_v2`
- v2 failure sets `syncStatus` to `offline`

**Step 3: Run scoped test suites**

Run:

```bash
bun test apps/api/src/sync/__test__/protobuf.test.ts
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
bun test apps/api/src/sync/__test__/service.test.ts
bun test apps/pos-app/src/store/__test__/sync.test.ts
bun test apps/pos-app/src/lib/api/__test__/sync.test.ts
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/api/src/sync/__test__ apps/pos-app/src/store/__test__/sync.test.ts apps/pos-app/src/lib/api/__test__/sync.test.ts
git commit -m "test(sync): cover v2 batch sync decisions and routes"
```

---

## Task 13: Push Idempotency and Batch Guardrails

**Files:**

- Modify: `packages/database/src/api-schema.ts`
- Create: `apps/api/drizzle/0008_sync_idempotency.sql` or next available migration number
- Modify: `apps/api/src/sync/routes.ts`
- Modify: `apps/api/src/sync/service.ts`
- Modify: `apps/api/src/sync/__test__/routes-protobuf.test.ts`
- Modify: `apps/api/src/sync/__test__/service.test.ts`
- Modify: `apps/pos-app/src-tauri/src/sync/push.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/protobuf.rs`

**Step 1: Write failing API idempotency tests**

Add route/service tests that prove:

- a push batch without `idempotencyKey` returns `400`
- the first request stores the successful protobuf response against the idempotency key
- a duplicate request with the same key returns the stored response without calling `handlePushBatch` again
- failed/transient server errors are not cached as successful idempotency responses

Example route test shape:

```ts
test("POST /api/sync/v2/push-batch replays stored response for duplicate idempotency key", async () => {
  mockHandlePushBatch.mockResolvedValueOnce({
    latestEventId: 12,
    serverTime: "2026-05-17T00:00:00.000Z",
    tables: [],
  });
  mockReadIdempotencyResponse
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(existingEncodedResponseBytes);

  const request = SyncPushBatchRequest.create({
    idempotencyKey: "push-outlet-1-uuid",
    outletId: "outlet-1",
  });

  await postPushBatch(request);
  const duplicate = await postPushBatch(request);

  expect(mockHandlePushBatch).toHaveBeenCalledTimes(1);
  expect(duplicate.status).toBe(200);
});
```

**Step 2: Run tests to verify failure**

Run:

```bash
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: FAIL because idempotency persistence does not exist.

**Step 3: Add idempotency table**

Add an API table:

```ts
export const syncIdempotencyKeys = sqliteTable("sync_idempotency_keys", {
  key: text("key").primaryKey(),
  outletId: text("outlet_id").notNull(),
  requestHash: text("request_hash").notNull(),
  responseBodyBase64: text("response_body_base64").notNull(),
  createdAt: text("created_at").notNull(),
});
```

Use the repo's existing Drizzle migration pattern to add the SQL migration.

**Step 4: Implement idempotency around push batch transaction**

The idempotency record must be written in the same database transaction as the business writes. Store only successful protobuf response bodies. Do not cache `4xx` validation failures caused by malformed requests or `5xx` transient failures.

Implementation rules:

- compute a stable request hash from the protobuf request body
- if key exists and hash matches, return stored response bytes
- if key exists and hash differs, return `409`
- if key does not exist, run push transaction and insert idempotency record with encoded response bytes before commit

**Step 5: Generate idempotency keys in Rust**

In `sync_push_batch_inner`, generate a UUID idempotency key per network attempt and set it on `SyncPushBatchRequest.idempotency_key`. Reuse the same key for retries of the same encoded push batch. If the command restarts from scratch later, a new key is acceptable because row IDs and server upserts are still idempotent; the key primarily protects lost acknowledgements during immediate retry.

**Step 6: Add batch guardrails**

Enforce request limits before processing:

- max rows per push batch: 2,000 total changed rows
- max protobuf request body bytes: choose an initial conservative value such as 2 MiB
- max pull limit: 2,000 rows

Return structured `413` or `400` errors when limits are exceeded. Keep the constants in one API sync module.

**Step 7: Run tests**

Run:

```bash
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
bun test apps/api/src/sync/__test__/service.test.ts
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

**Step 8: Commit**

```bash
git add packages/database/src/api-schema.ts apps/api/drizzle apps/api/src/sync apps/pos-app/src-tauri/src/sync
git commit -m "feat(sync): add v2 push idempotency and batch limits"
```

---

## Task 14: Pull Pagination and Local Checkpointing

**Files:**

- Modify: `apps/api/src/sync/service.ts`
- Modify: `apps/api/src/sync/protobuf.ts`
- Modify: `apps/api/src/sync/__test__/service.test.ts`
- Modify: `apps/pos-app/src-tauri/src/sync/commands.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/local_state.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/mod.rs`

**Step 1: Write failing API pagination tests**

Add tests proving:

- `handlePullBatch` caps `limit` at server max
- when more events remain, response includes `hasMore: true`
- `nextPageCursor` is stable and lets the next request continue after the previous page
- `latestEventId` only reflects rows included in the committed page

**Step 2: Run API tests to verify failure**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: FAIL because pagination is not implemented.

**Step 3: Implement event-page query**

Update `handlePullBatch` so event selection applies:

- scoped merchant/outlet filter
- `event.id > afterEventId`
- optional `event.id > decodedPageCursor`
- order by event id ascending
- limit `effectiveLimit + 1`

Use the extra row to determine `hasMore`. Return only `effectiveLimit` rows.

**Step 4: Write failing Rust checkpoint test**

Add a unit test around cursor selection/checkpoint helpers:

```rust
#[test]
fn pull_batch_checkpoint_uses_last_committed_event_id() {
    let response = SyncPullBatchResponse {
        latest_event_id: 42,
        has_more: true,
        next_page_cursor: "42".to_string(),
        ..Default::default()
    };

    assert_eq!(next_pull_checkpoint(&response), 42);
}
```

**Step 5: Implement Rust paginated pull loop**

In `sync_pull_batch_v2`, loop while `has_more`:

1. request page with `after_event_id`, `limit`, and `page_cursor`
2. decode response
3. apply rows in one SQLite transaction
4. update `sync_cursors.last_server_event_id` to the page's committed `latest_event_id`
5. set `page_cursor = response.next_page_cursor`
6. continue until `has_more` is false

Do not keep all pages in memory. Decode, apply, and drop each page.

Also persist lightweight progress after each page so new-device baseline restore can be observed and resumed later:

- sync phase, such as `initial_pull`, `incremental_pull`, or `push`
- current table group or page cursor
- rows applied in the latest page
- total rows applied in the current run when known
- last committed event id
- updated timestamp

This progress state is for UI/support visibility and future Android Foreground Service integration. It must not replace the correctness cursor in `sync_cursors`.

**Step 6: Run tests**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/api/src/sync apps/pos-app/src-tauri/src/sync
git commit -m "feat(sync): paginate v2 pulls with local checkpoints"
```

---

## Task 15: Android SQLite Sync Pragmas

**Files:**

- Modify: `apps/pos-app/src-tauri/src/db/sqlite.rs`
- Modify: `apps/pos-app/src-tauri/src/db/mod.rs`
- Modify: `apps/pos-app/src-tauri/src/db/__test__` if Rust DB tests exist, otherwise add tests near existing Rust DB module tests
- Modify: `docs/adr/0005-use-sync-v2-batches-with-typed-hot-tables.md`

**Step 1: Inspect current SQLite initialization**

Read:

```bash
sed -n '1,220p' apps/pos-app/src-tauri/src/db/sqlite.rs
sed -n '1,220p' apps/pos-app/src-tauri/src/db/mod.rs
```

Confirm where the shared `SqlitePool` is created.

**Step 2: Write failing Rust test for pragma application**

Add a test that opens a temporary SQLite DB through the same init helper and verifies:

```sql
PRAGMA journal_mode;
PRAGMA synchronous;
PRAGMA busy_timeout;
PRAGMA mmap_size;
```

Expected target:

- `journal_mode = wal`
- `synchronous = NORMAL`
- `busy_timeout >= 5000`
- `mmap_size <= 33554432`

**Step 3: Run test to verify failure**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sqlite_pragmas
```

Expected: FAIL if pragmas are not currently applied.

**Step 4: Apply pragmas during pool setup**

Use SQLx connection options or post-connect setup so every connection gets:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA mmap_size = 33554432;
```

Be careful with Android paths and existing migration order. Apply pragmas after opening the database and before sync-heavy operations.

**Step 5: Run tests**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sqlite_pragmas
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/pos-app/src-tauri/src/db docs/adr/0005-use-sync-v2-batches-with-typed-hot-tables.md
git commit -m "perf(db): tune sqlite pragmas for android sync"
```

---

## Task 16: Documentation and Verification Guide

**Files:**

- Modify: `docs/adr/0004-use-smart-sync-with-local-outbox-and-server-events.md`
- Create: `docs/adr/0005-use-sync-v2-batches-with-typed-hot-tables.md`
- Modify: `docs/DOCUMENTED-LOG-PREFIX.md` only if new log prefixes were added

**Step 1: Create ADR**

Find next ADR number:

```bash
ls docs/adr
```

Create `docs/adr/0005-use-sync-v2-batches-with-typed-hot-tables.md` unless a newer number already exists.

Content:

```md
---
id: 5
title: Use Sync V2 Batches With Typed Hot Tables
date: 2026-05-17
status: accepted
domains: [sync, sqlite, api, protobuf]
---

# 5. Use Sync V2 Batches With Typed Hot Tables

## Context

The previous sync protobuf transport used typed protobuf envelopes but carried row payloads as JSON strings. This was flexible, but it limited payload-size wins and made row operation semantics implicit.

## Decision

Use a v2 sync protocol with multi-table batch requests and explicit created, updated, and deleted change sets. Keep JSON row payloads for lower-volume or evolving tables, and use typed protobuf rows for high-volume stable tables: products, outlet products, orders, and order items.

## Consequences

The app can sync multiple tables in one API roundtrip with clearer operation semantics. Hot tables get smaller protobuf payloads. The protocol now has two lanes, so generated types and conversion helpers must be tested whenever sync table schemas change.
```

**Step 2: Update ADR 0004**

Append a short note that v2 preserves the smart sync decision model but changes the transfer payload shape.

**Step 3: Add Verification Guide to final PR notes**

Manual UI steps:

```text
1. Launch POS app and log in.
2. Select an outlet.
3. Create or edit a product.
4. Create a paid order with at least two items.
5. Trigger manual sync.
6. Confirm sync status returns to idle.
7. Restart app and confirm product/order remains visible.
```

Log checks:

```bash
PID="$(adb shell pidof -s com.sakti_dev.sakti_pos | tr -d '\r')" && adb logcat -v brief --pid="$PID" | grep --line-buffered -iE '\[(JS|RUST)\] \[(SYNC|DB|POS):'
```

API tests:

```bash
bun test apps/api/src/sync/__test__/protobuf.test.ts
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
bun test apps/api/src/sync/__test__/service.test.ts
```

POS tests:

```bash
bun test apps/pos-app/src/store/__test__/sync.test.ts
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Formatting:

```bash
bun x ultracite check
```

**Step 4: Commit**

```bash
git add docs/adr/0004-use-smart-sync-with-local-outbox-and-server-events.md docs/adr/0005-use-sync-v2-batches-with-typed-hot-tables.md
git commit -m "docs(sync): document v2 batch protobuf decision"
```

---

## Task 17: Final Verification

**Files:**

- No code changes expected.

**Step 1: Run full scoped verification**

Run:

```bash
bun test apps/api/src/sync/__test__/protobuf.test.ts
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
bun test apps/api/src/sync/__test__/service.test.ts
bun test apps/pos-app/src/store/__test__/sync.test.ts
bun test apps/pos-app/src/lib/api/__test__/sync.test.ts
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
bun x ultracite check
```

Expected: all pass.

**Step 2: Run generated type check**

Run:

```bash
bun x ultracite doctor
```

Expected: PASS or only unrelated pre-existing warnings.

**Step 3: Inspect git diff**

Run:

```bash
git diff --stat
git diff -- packages/protobuf/proto/sync.proto apps/api/src/sync apps/pos-app/src-tauri/src/sync apps/pos-app/src/store/sync.ts
```

Expected:

- v1 messages still present.
- v2 messages added.
- v2 endpoints added.
- store calls v2 commands.
- no unrelated refactors.

**Step 4: Manual Android verification**

Run app on Android dev device and test:

1. Fresh login and outlet select.
2. Product create/edit sync.
3. Order create sync.
4. Offline product/order creation, then reconnect and sync.
5. Second device/server change, then pull to first device.

Use logcat:

```bash
PID="$(adb shell pidof -s com.sakti_dev.sakti_pos | tr -d '\r')" && adb logcat -v brief --pid="$PID" | grep --line-buffered -iE '\[(JS|RUST)\] \[(SYNC|DB|POS):|AndroidRuntime|libc|fatal|exception|crash'
```

Expected:

- Sync mode decisions are visible.
- V2 push/pull command logs are visible if added.
- No crash or native exception.
- Sync status returns to idle.

**Step 5: Final commit if needed**

Only commit if verification required final changes:

```bash
git add <changed-files>
git commit -m "fix(sync): address v2 batch verification issues"
```

---

## Risk Register

1. **Typed field mismatch between SQLite, Rust, TS, and API schema.**

   Mitigation: verify `local-schema.ts` and `api-schema.ts` before finalizing proto fields. Add encode/decode tests for every typed hot table.

2. **Delete semantics may need existing server row context.**

   Mitigation: implement soft-delete by updating existing rows where possible instead of constructing incomplete delete rows.

3. **Event operation mapping may be incomplete.**

   Mitigation: include `operation` in `handlePullBatch` event queries and split pull response into created/updated/deleted based on `sync_events.operation`.

4. **Payload batch can become too large.**

   Mitigation: enforce initial v2 max rows, max request bytes, and pull pagination limits. Add a later plan for adaptive byte-based chunking if field data distribution makes row-count limits insufficient.

5. **Two protocol lanes increase maintenance.**

   Mitigation: centralize table classification in one helper on API and Rust sides. Tests must fail if a typed table accidentally appears in JSON fallback.

6. **Generated protobuf changes can be noisy.**

   Mitigation: commit proto contract separately before service changes.

7. **Idempotency persistence can accidentally cache the wrong response.**

   Mitigation: store only successful push responses, bind the key to a request hash, and write the idempotency row in the same transaction as the sync mutation.

8. **Pull checkpoints can advance past unapplied rows.**

   Mitigation: update local `sync_cursors` only after each pull page has been fully applied and committed to SQLite.

---

## Future Follow-Ups

1. Add `changed_columns_json` to `sync_outbox` and implement field-aware conflict resolution.
2. Add explicit replacement sync mode with server-authoritative full dataset.
3. Replace `/status` + `/pull-batch` with one `pull-changes` endpoint for clean no-op behavior.
4. Evaluate one `exchange` endpoint after v2 push and pull are stable.
5. Add sync consistency diagnostics comparing local SQLite to full server state.
6. Graduate `categories` and `assets` to typed protobuf if payload metrics justify it.
7. Evaluate Hybrid Logical Clocks in a separate ADR if server event IDs and server-side conflict checks become insufficient.
8. Add Android Foreground Service support for long user-visible sync, especially new-device baseline restore. Sync v2 should already expose resumable checkpoints and progress state so the future service can wrap the Rust sync engine without redesigning the protocol.
