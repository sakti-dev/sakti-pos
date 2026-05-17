# Sync Push Optimization Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix correctness and robustness gaps found in the sync push optimization review before committing the schema hard-cut and generated adapter implementation.

**Architecture:** Keep the generated adapter approach, but make generated SQL use actual SQLite column names, preserve real row data such as `staff.outletId`, enforce safe nullable int64 conversion, and harden idempotency so duplicate concurrent pushes cannot commit duplicate sync events. Defer prepared statements because current hot-path bottlenecks are variable-shape bulk operations and transaction-scoped queries, not fixed-shape metadata lookups.

**Tech Stack:** Bun, TypeScript, Drizzle ORM SQLite/libSQL, Elysia, ts-proto protobuf, Rust/Tauri/prost, Vitest/Bun test, Cargo tests, Ultracite/Biome.

---

## Current State

This plan assumes the implementation from `docs/plans/2026-05-18-sync-push-performance-and-schema-organization.md` exists in the working tree and is not yet committed.

Known review findings to fix:

1. Generated API push adapter uses Drizzle camelCase property names inside `excluded.*` SQL instead of SQLite column names.
2. Idempotency race fallback can return cached response after the duplicate transaction has already upserted rows and inserted duplicate sync events.
3. Generated row mapper drops `staff.outletId`.
4. Generated int64 conversion uses `Number(...)`, ignores safe int64 range checks, and converts nullable numeric fields to `0`.
5. Generated `push-adapters.generated.ts` is not covered by drift tests.
6. Generated adapter export order does not match FK-safe push order.
7. Ultracite currently fails on formatting/lint issues.
8. Task 15 prepared statements should remain skipped/deferred unless a later profile proves fixed-shape metadata query overhead matters.

## Non-Negotiable Constraints

- Use TDD: write each failing test first, run it and verify RED, then implement, then verify GREEN.
- Do not manually patch `apps/api/src/sync/push-adapters.generated.ts` for durable fixes. Fix `packages/sync-proto-generator/src/api-push-adapter-writer.ts`, regenerate, and let drift tests protect output.
- Keep typed protobuf transport only. Do not reintroduce JSON table payloads.
- Keep FK-safe push order.
- Do not implement prepared statements in this fix batch.
- Do not commit broken generated output. `bun run generate:sync-proto:write` and drift tests must agree.

---

## Task 1: Add Drift And Output Tests For Generated API Push Adapter

**Files:**
- Modify: `packages/sync-proto-generator/src/__test__/drift.test.ts`
- Modify: `packages/sync-proto-generator/src/__test__/file-output.test.ts`
- Modify: `packages/sync-proto-generator/src/__test__/api-push-adapter-writer.test.ts`

**Step 1: Write failing drift test**

In `packages/sync-proto-generator/src/__test__/drift.test.ts`, import:

```ts
import { renderApiPushAdapters } from "../api-push-adapter-writer";
```

Add:

```ts
test("checked-in API push adapter matches generator output", async () => {
  const localSchema = await import("@repo/database");
  const tables = reflectSyncTables(localSchema, syncManifest);
  const generated = renderApiPushAdapters(syncManifest, tables);
  const checkedIn = readFileSync(
    join(repoRoot, "apps", "api", "src", "sync", "push-adapters.generated.ts"),
    "utf8"
  );

  expect(checkedIn).toBe(generated);
});
```

**Step 2: Run test to verify RED if generated file has drift**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/drift.test.ts
```

Expected: PASS if current generated file already matches current writer, or FAIL if stale. If it passes, keep it as a regression guard.

**Step 3: Add file output test**

In `file-output.test.ts`, add:

```ts
test("write mode targets checked-in API push adapter", () => {
  expect(
    resolveGeneratorOutputPath("write", "api-push-adapters.ts").endsWith(
      "apps/api/src/sync/push-adapters.generated.ts"
    )
  ).toBe(true);
});
```

**Step 4: Add writer expectations for DB column names**

In `api-push-adapter-writer.test.ts`, add a test that currently fails:

```ts
test("renders upsert excluded references with SQLite column names", () => {
  const source = renderApiPushAdapters(syncManifest, tables);

  expect(source).toContain('priceMinorUnits: sql.raw("excluded.price_minor_units")');
  expect(source).toContain('updatedAt: sql.raw("excluded.updated_at")');
  expect(source).not.toContain("excluded.priceMinorUnits");
  expect(source).not.toContain("excluded.updatedAt");
});
```

Adjust quoting to match final writer style, but keep the behavior strict.

**Step 5: Run writer tests to verify RED**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/api-push-adapter-writer.test.ts packages/sync-proto-generator/src/__test__/file-output.test.ts
```

Expected: API push adapter writer test FAILS because current writer emits `excluded.${propertyName}`.

**Step 6: Commit tests only if working in commit-per-task mode**

```bash
git add packages/sync-proto-generator/src/__test__/drift.test.ts packages/sync-proto-generator/src/__test__/file-output.test.ts packages/sync-proto-generator/src/__test__/api-push-adapter-writer.test.ts
git commit -m "test(sync): guard generated API push adapter drift"
```

If the implementation is still one uncommitted working tree, skip commit and continue, but preserve RED/GREEN evidence in notes.

---

## Task 2: Generate Upsert Sets With SQLite Column Names

**Files:**
- Modify: `packages/sync-proto-generator/src/api-push-adapter-writer.ts`
- Generated: `apps/api/src/sync/push-adapters.generated.ts`
- Test: `packages/sync-proto-generator/src/__test__/api-push-adapter-writer.test.ts`
- Test: `packages/sync-proto-generator/src/__test__/drift.test.ts`

**Step 1: Implement column-aware upsert set generation**

Change the writer to use reflected `column.columnName` for SQL and `column.propertyName` for the Drizzle set key.

Target generated shape:

```ts
const productsUpsertSet = {
  merchantId: sql.raw("excluded.merchant_id"),
  categoryId: sql.raw("excluded.category_id"),
  name: sql.raw("excluded.name"),
  priceMinorUnits: sql.raw("excluded.price_minor_units"),
  imageUrl: sql.raw("excluded.image_url"),
  imageAssetId: sql.raw("excluded.image_asset_id"),
  isActive: sql.raw("excluded.is_active"),
  sortOrder: sql.raw("excluded.sort_order"),
  deletedAt: sql.raw("excluded.deleted_at"),
  createdAt: sql.raw("excluded.created_at"),
  updatedAt: sql.raw("excluded.updated_at"),
};
```

Implementation guidance:

- Remove generic `buildExcludedSet(columns: readonly string[])` or change it to receive tuples:

```ts
function buildExcludedSet(
  columns: readonly { columnName: string; propertyName: string }[]
): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  for (const column of columns) {
    if (column.propertyName === "id") {
      continue;
    }
    set[column.propertyName] = sql.raw(`excluded.${column.columnName}`);
  }
  return set;
}
```

- Prefer generating static object literals rather than rebuilding on every upsert call if the implementation stays simple and clean.
- Do not include `id`.

**Step 2: Regenerate API push adapter**

Run:

```bash
bun run generate:sync-proto:write
```

Expected: `apps/api/src/sync/push-adapters.generated.ts` changes and no longer contains `excluded.priceMinorUnits` or `excluded.updatedAt`.

**Step 3: Verify GREEN**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/api-push-adapter-writer.test.ts packages/sync-proto-generator/src/__test__/drift.test.ts
```

Expected: PASS.

**Step 4: Commit**

```bash
git add packages/sync-proto-generator/src/api-push-adapter-writer.ts packages/sync-proto-generator/src/__test__/api-push-adapter-writer.test.ts packages/sync-proto-generator/src/__test__/drift.test.ts packages/sync-proto-generator/src/__test__/file-output.test.ts apps/api/src/sync/push-adapters.generated.ts
git commit -m "fix(sync): generate upsert sets with db column names"
```

---

## Task 3: Preserve Non-Owned `merchantId` / `outletId` Fields Such As Staff Outlet Assignment

**Files:**
- Modify: `packages/sync-proto-generator/src/api-push-adapter-writer.ts`
- Generated: `apps/api/src/sync/push-adapters.generated.ts`
- Test: `packages/sync-proto-generator/src/__test__/api-push-adapter-writer.test.ts`
- Test: `apps/api/src/sync/__test__/service.test.ts`

**Step 1: Write failing writer test**

Add:

```ts
test("keeps staff outletId as row data while server-owning merchantId", () => {
  const source = renderApiPushAdapters(syncManifest, tables);

  expect(source).toContain("function staffRowToInsertRow");
  expect(source).toContain("outletId: nullableStringField(row.outletId)");
  expect(source).toContain('return applyContextOwnership(normalized, context, "merchantId")');
});
```

Expected current behavior: FAIL because `outletId` is skipped.

**Step 2: Run test to verify RED**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/api-push-adapter-writer.test.ts
```

Expected: FAIL.

**Step 3: Fix ownership skipping logic**

Change `renderRowMapper` so it skips only the server-owned context column for that table.

Current bad rule:

```ts
if (column.propertyName === "merchantId" || column.propertyName === "outletId") {
  continue;
}
```

Correct rule:

```ts
if (column.propertyName === ownershipColumn) {
  continue;
}
```

This means:

- `staff.merchantId` is injected from context.
- `staff.outletId` is preserved from row data.
- `outlets.merchantId` is injected.
- `orders.outletId` is injected.
- `merchants` skips nothing because ownership column is `null`.

**Step 4: Regenerate**

Run:

```bash
bun run generate:sync-proto:write
```

**Step 5: Add/adjust service test**

In `apps/api/src/sync/__test__/service.test.ts`, add or update a test that pushes a staff row:

```ts
staff: {
  created: [{
    id: "staff-1",
    merchantId: "client-merchant-should-be-overridden",
    outletId: "outlet-1",
    name: "Cashier",
    role: "cashier",
    isActive: true,
    createdAt: "2026-05-17T00:00:00.000Z",
    updatedAt: "2026-05-17T00:00:00.000Z",
  }],
  updated: [],
  deletedIds: [],
}
```

Assert written row contains:

```ts
expect(writtenRows).toContainEqual(
  expect.objectContaining({
    id: "staff-1",
    merchantId: "merchant-1",
    outletId: "outlet-1",
  })
);
```

**Step 6: Verify GREEN**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/api-push-adapter-writer.test.ts apps/api/src/sync/__test__/service.test.ts
```

Expected: PASS.

**Step 7: Commit**

```bash
git add packages/sync-proto-generator/src/api-push-adapter-writer.ts packages/sync-proto-generator/src/__test__/api-push-adapter-writer.test.ts apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/push-adapters.generated.ts
git commit -m "fix(sync): preserve non-owned outlet fields in push adapters"
```

---

## Task 4: Generate Safe Nullable Int64 Conversion

**Files:**
- Modify: `packages/sync-proto-generator/src/api-push-adapter-writer.ts`
- Generated: `apps/api/src/sync/push-adapters.generated.ts`
- Test: `packages/sync-proto-generator/src/__test__/api-push-adapter-writer.test.ts`
- Test: `apps/api/src/sync/__test__/service.test.ts`

**Step 1: Write failing writer tests**

Add tests proving generated code distinguishes required and nullable int64 fields.

Expected required examples:

```ts
expect(source).toContain(
  'priceMinorUnits: requiredInt64NumberField(row.priceMinorUnits, "products.priceMinorUnits")'
);
expect(source).toContain(
  'sortOrder: requiredInt64NumberField(row.sortOrder, "products.sortOrder")'
);
```

Expected nullable examples:

```ts
expect(source).toContain(
  'width: nullableInt64NumberField(row.width, "assets.width")'
);
expect(source).toContain(
  'amountPaidMinorUnits: nullableInt64NumberField(row.amountPaidMinorUnits, "orders.amountPaidMinorUnits")'
);
expect(source).toContain(
  'originalPriceMinorUnits: nullableInt64NumberField(row.originalPriceMinorUnits, "order_items.originalPriceMinorUnits")'
);
```

**Step 2: Run writer test to verify RED**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/api-push-adapter-writer.test.ts
```

Expected: FAIL because current code has only `int64NumberField(...)`.

**Step 3: Generate safe helper functions**

Generated adapter should import or implement safe conversion.

Preferred: import existing safe helper:

```ts
import { protobufInt64ToSafeNumber } from "./protobuf";
```

Generated helpers:

```ts
function requiredInt64NumberField(value: unknown, fieldName: string): number {
  if (typeof value === "bigint") {
    return protobufInt64ToSafeNumber(value, fieldName);
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value === "string" && INTEGER_STRING_PATTERN.test(value)) {
    return protobufInt64ToSafeNumber(BigInt(value), fieldName);
  }
  return 0;
}

function nullableInt64NumberField(value: unknown, fieldName: string): number | null {
  if (value == null || value === "") {
    return null;
  }
  return requiredInt64NumberField(value, fieldName);
}
```

Important:

- `number` inputs must be safe integers.
- `bigint` and numeric strings must go through safe range check.
- Nullable integer DB columns must preserve null instead of becoming `0`.
- Do not use `Number(bigint)` directly.

**Step 4: Use column nullability**

In row mapping generation:

```ts
if (column.protoType === "int64") {
  expr = column.notNull
    ? `requiredInt64NumberField(row.${column.propertyName}, "${table.tableName}.${column.propertyName}")`
    : `nullableInt64NumberField(row.${column.propertyName}, "${table.tableName}.${column.propertyName}")`;
}
```

**Step 5: Regenerate**

Run:

```bash
bun run generate:sync-proto:write
```

**Step 6: Add service tests for null and unsafe int64**

Add test for nullable values:

```ts
orders: {
  created: [{
    id: "order-1",
    orderNumber: "001",
    totalMinorUnits: 15000n,
    amountPaidMinorUnits: 0n, // if payment requires zero
    changeAmountMinorUnits: undefined,
    paymentMethod: "cash",
    status: "completed",
    createdAt: "...",
    updatedAt: "...",
  }],
  updated: [],
  deletedIds: [],
}
```

Assert nullable columns that are missing are `null`, not `0`, where schema permits null.

Add unsafe int64 test:

```ts
priceMinorUnits: BigInt(Number.MAX_SAFE_INTEGER) + 1n
```

Expected:

```ts
await expect(handlePushBatch(...)).rejects.toThrow("outside safe integer range");
```

Use exact error text from `protobufInt64ToSafeNumber`.

**Step 7: Verify GREEN**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/api-push-adapter-writer.test.ts apps/api/src/sync/__test__/service.test.ts
bun run --cwd apps/api typecheck
```

Expected: PASS.

**Step 8: Commit**

```bash
git add packages/sync-proto-generator/src/api-push-adapter-writer.ts packages/sync-proto-generator/src/__test__/api-push-adapter-writer.test.ts apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/push-adapters.generated.ts
git commit -m "fix(sync): generate safe nullable int64 push mapping"
```

---

## Task 5: Fix Idempotency Race Without Duplicate Sync Events

**Files:**
- Modify: `apps/api/src/sync/service.ts`
- Modify: `apps/api/src/sync/__test__/service.test.ts`

**Step 1: Write failing duplicate-event race test**

The current test only checks returned response. Add a stronger test that proves duplicate transaction writes are not committed when idempotency insert races.

Recommended test shape:

- Mock transaction callback.
- First cache lookup returns empty.
- No table changes are needed or include one product change.
- Insert into `sync_batch_requests` throws unique constraint.
- Fallback reload returns cached response.
- Assert no new sync event insert was committed, or assert transaction rollback path is used.

Because unit mocks cannot model real DB rollback unless service exposes transaction boundaries, prefer testing new helper behavior if refactored.

Expected behavior:

```ts
expect(syncEventInsertValues).toHaveLength(0);
expect(result).toEqual(cachedResponse);
```

If the implementation chooses reservation-before-writes, the test should assert row upsert/event insert never happen after detecting existing idempotency key.

**Step 2: Run test to verify RED**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: FAIL because current code inserts sync events before unique-conflict fallback.

**Step 3: Refactor to reserve idempotency before writes**

Preferred robust design:

1. At transaction start, load existing idempotency response.
2. If absent, insert a pending idempotency row before any table writes.
3. If pending insert hits unique constraint:
   - load existing response
   - if completed and hash matches, return it before any writes
   - if same hash but response is pending/empty, throw conflict/retryable error rather than writing duplicate events
4. Process table writes and sync events.
5. Update the idempotency row with final response.

Schema currently has `responseJson` and `serverTime` as `notNull`, so a pending row needs valid placeholder values:

```ts
responseJson: JSON.stringify({ latestEventId: 0, serverTime: now, tables: [] })
latestEventId: 0
serverTime: now
```

Then finalization should update the row:

```ts
await tx
  .update(syncBatchRequests)
  .set({
    latestEventId: response.latestEventId,
    responseJson: JSON.stringify(response),
    serverTime: response.serverTime,
    updatedAt: now,
  })
  .where(...)
```

Important: `loadPushBatchResponse` must treat placeholder/pending response carefully. If using a placeholder, add an explicit status column only if schema migration is acceptable. Simpler alternative: use placeholder but same transaction finalizes before commit; other transactions should only see committed rows. With SQLite transaction isolation, concurrent reader should not see uncommitted pending row. Unique conflict on concurrent insert should occur after first commit, at which point final response should be available.

**Step 4: Alternative if pending reservation is too risky**

If Drizzle/libSQL transaction behavior makes reservation hard, use a two-transaction pattern:

1. Try to insert idempotency reservation outside the write transaction.
2. If unique conflict, load existing response and return/throw before writes.
3. Run writes in a transaction.
4. Update reservation with response.

Only use this if tests prove no duplicate sync events and failure modes are understood.

**Step 5: Verify same-key/different-body behavior**

Existing behavior must remain:

```ts
await expect(handlePushBatch(...sameKeyDifferentHash...)).rejects.toThrow(
  "idempotency key reused with different request body"
);
```

**Step 6: Verify GREEN**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
bun run --cwd apps/api typecheck
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/api/src/sync/service.ts apps/api/src/sync/__test__/service.test.ts
git commit -m "fix(sync): reserve idempotency before push writes"
```

---

## Task 6: Align Adapter Order With FK-Safe Push Order

**Files:**
- Modify: `packages/sync-proto-generator/src/api-push-adapter-writer.ts`
- Generated: `apps/api/src/sync/push-adapters.generated.ts`
- Test: `packages/sync-proto-generator/src/__test__/api-push-adapter-writer.test.ts`

**Step 1: Write failing test**

Add:

```ts
test("exports adapters in manifest push order", () => {
  const source = renderApiPushAdapters(syncManifest, tables);
  const adapterList = source.slice(
    source.indexOf("export const PUSH_TABLE_ADAPTERS = ["),
    source.indexOf("] as const;")
  );

  expect(adapterList.indexOf("StaffPushTableAdapter()")).toBeLessThan(
    adapterList.indexOf("CategoriesPushTableAdapter()")
  );
  expect(adapterList.indexOf("OrdersPushTableAdapter()")).toBeLessThan(
    adapterList.indexOf("OrderItemsPushTableAdapter()")
  );
});
```

Expected current behavior: FAIL for staff/category order if reflected table order differs from `PUSH_TABLE_ORDER`.

**Step 2: Run test to verify RED**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/api-push-adapter-writer.test.ts
```

Expected: FAIL if adapter export order is not manifest order.

**Step 3: Render adapters in `manifest.tables` order**

Build `tablesByName` and iterate `manifest.tables` when:

- rendering row mappers/adapters
- rendering `PUSH_TABLE_ADAPTERS`

Do not rely on reflected schema object order.

**Step 4: Regenerate**

Run:

```bash
bun run generate:sync-proto:write
```

Expected generated `PUSH_TABLE_ADAPTERS` order:

```ts
MerchantsPushTableAdapter(),
OutletsPushTableAdapter(),
RegistersPushTableAdapter(),
StaffPushTableAdapter(),
CategoriesPushTableAdapter(),
AssetsPushTableAdapter(),
ProductsPushTableAdapter(),
OutletProductsPushTableAdapter(),
OrdersPushTableAdapter(),
OrderItemsPushTableAdapter(),
```

**Step 5: Verify GREEN**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/api-push-adapter-writer.test.ts packages/sync-proto-generator/src/__test__/drift.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add packages/sync-proto-generator/src/api-push-adapter-writer.ts packages/sync-proto-generator/src/__test__/api-push-adapter-writer.test.ts apps/api/src/sync/push-adapters.generated.ts
git commit -m "fix(sync): order push adapters by manifest"
```

---

## Task 7: Make Ultracite Clean

**Files:**
- Modify as reported by `bun x ultracite check`

**Step 1: Run scoped Ultracite check**

Run:

```bash
bun x ultracite check apps/api/src/sync packages/sync-proto-generator/src apps/pos-app/src/db apps/pos-app/src/pages/pos apps/pos-app/src/store/cart.ts
```

Expected current known failures include:

- numeric separators for `1000`
- import sorting
- generator writer formatting
- unused `CAMEL_TO_SNAKE_PATTERN`
- unused `manifestTable` parameter
- `noTemplateCurlyInString` in generator string literal

**Step 2: Apply formatting fixes**

Run:

```bash
bun x ultracite fix apps/api/src/sync packages/sync-proto-generator/src apps/pos-app/src/db apps/pos-app/src/pages/pos apps/pos-app/src/store/cart.ts
```

Review all changes. Do not accept semantic changes blindly.

**Step 3: Manually fix remaining lint**

Expected manual fixes:

- remove unused `CAMEL_TO_SNAKE_PATTERN`
- rename unused parameter to `_manifestTable` if keeping signature
- avoid suspicious template placeholder string in generator by composing generated code without literal `${column}` inside a normal string, or by generating static object literals as in Task 2.

**Step 4: Verify GREEN**

Run:

```bash
bun x ultracite check apps/api/src/sync packages/sync-proto-generator/src apps/pos-app/src/db apps/pos-app/src/pages/pos apps/pos-app/src/store/cart.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/sync packages/sync-proto-generator/src apps/pos-app/src/db apps/pos-app/src/pages/pos apps/pos-app/src/store/cart.ts
git commit -m "chore(sync): format push optimization changes"
```

---

## Task 8: Document Prepared Statement Decision

**Files:**
- Modify: `docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md`
- Modify: `docs/plans/2026-05-18-sync-push-performance-and-schema-organization.md` only if you want the original plan to reflect the deferred decision

**Step 1: Add documentation note**

In `docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md`, add:

```md
### Prepared Statement Guidance

Do not prepare variable-size sync push bulk upserts or `WHERE id IN (...)` conflict reads. Their SQL shape changes with chunk size.

Prepared statements are only candidates for fixed-shape metadata lookups outside the hot write transaction, such as route-level outlet lookup. As of this implementation, Task 15 is intentionally deferred because the hot-path wins come from generated adapters, safe chunked bulk writes, narrow reads, and idempotency correctness.
```

**Step 2: Run doc check**

Run:

```bash
bun x ultracite check docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md
```

Expected: PASS or no files checked.

**Step 3: Commit**

```bash
git add docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md docs/plans/2026-05-18-sync-push-performance-and-schema-organization.md
git commit -m "docs(sync): defer prepared statements for push path"
```

---

## Task 9: Full Verification

**Files:** No intended changes. Fix only issues found by verification.

**Step 1: Regenerate and drift-check**

Run:

```bash
bun run generate:sync-proto:write
bun run sync-proto:check
bun test packages/sync-proto-generator/src
```

Expected: PASS and no generated drift.

**Step 2: API sync verification**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/__test__/chunking.test.ts apps/api/src/sync/__test__/protobuf.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts apps/api/src/sync/__test__/payload-size.test.ts
bun run --cwd apps/api typecheck
```

Expected: PASS.

**Step 3: POS TypeScript verification**

Run:

```bash
bun test apps/pos-app/src/db/__test__/orders.test.ts apps/pos-app/src/db/__test__/menu.test.ts apps/pos-app/src/db/__test__/dashboard.test.ts apps/pos-app/src/store/__test__/cart.test.ts apps/pos-app/src/pages/pos/__test__/pos-utils.test.ts apps/pos-app/src/pages/pos/__test__/pos.test.tsx
bun run --cwd apps/pos-app typecheck
```

Expected: PASS.

**Step 4: Rust verification**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync:: --lib
rustfmt --edition 2021 --check apps/pos-app/src-tauri/src/sync/protobuf_generated.rs
```

Expected: PASS.

**Step 5: Lint verification**

Run:

```bash
bun x ultracite check apps/api/src/sync packages/sync-proto-generator/src apps/pos-app/src/db apps/pos-app/src/pages/pos apps/pos-app/src/store/cart.ts docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md
```

Expected: PASS.

**Step 6: Stale artifact check**

Run:

```bash
find packages/protobuf -path '*/generated/*' -print
find packages/sync-proto-generator -path '*/generated/*' -print
git status --short
```

Expected:

- no generated comparison artifacts
- only intended working tree changes remain, or clean if all fixes are committed

**Step 7: Final commit if verification required fixes**

```bash
git add .
git commit -m "test(sync): verify push optimization review fixes"
```

Only commit if verification produced additional changes.

---

## Real-Device Regression Checklist

After automated verification:

1. Install fresh dev app or clear app data because schema names hard-cut money columns.
2. Create category/product/order offline.
3. Include staff assignment with `outletId` if UI path exists.
4. Push sync.
5. Confirm API DB:

```sql
SELECT id, price_minor_units FROM products LIMIT 5;
SELECT id, outlet_id FROM staff LIMIT 5;
SELECT table_name, row_id, operation FROM sync_events ORDER BY id DESC LIMIT 20;
```

6. Retry same idempotency key/body if you can simulate it; sync events should not duplicate.
7. Pull to another fresh device/session and confirm money values, staff outlet assignment, and order totals are correct.

