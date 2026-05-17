# Sync Push Performance And Schema Organization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Hard-cut the money field schema names to explicit minor-unit names, then optimize typed protobuf sync push so API writes have low overhead, safe chunking, fewer database statements, and generated table-specific adapters.

**Architecture:** First align local schema, API schema, SQLite column names, protobuf field names, and TypeScript/Rust mapper names for money fields. Then extend `@repo/sync-proto-generator` to generate API push table adapters from Drizzle runtime reflection plus the sync manifest. Finally refactor `apps/api/src/sync/service.ts` so handwritten code only orchestrates sync decisions while generated adapters handle row mapping, column metadata, chunk sizing, conflict reads, and ordered bulk writes.

**Tech Stack:** Bun, TypeScript, Drizzle ORM SQLite/libSQL, Turso/libSQL, Elysia, ts-proto-generated protobuf, Rust/Tauri/prost, Vitest, Cargo tests, Ultracite/Biome.

---

## Non-Negotiable Constraints

- Use TDD for every behavior change: RED test, verify failure, GREEN implementation, verify pass, refactor.
- The app is not launched. Do a hard-cut schema migration. Do not add backward compatibility aliases unless a test proves an internal transitional path still needs it during the same branch.
- Preserve typed protobuf transport. Do not reintroduce `SyncJsonTableChanges`, `created_json`, `updated_json`, or JSON-over-protobuf table payloads.
- Preserve FK-safe table order for writes:
  - `merchants`
  - `outlets`
  - `registers`
  - `staff`
  - `categories`
  - `assets`
  - `products`
  - `outlet_products`
  - `orders`
  - `order_items`
- Do not parallelize writes across FK-dependent tables.
- Chunk by bind parameter count, not by arbitrary row count only.
- Keep protobuf fields in `snake_case`, ts-proto and Drizzle properties in `camelCase`, and SQLite columns in `snake_case`.
- Generated files must retain the generated-file header:
  - `packages/protobuf/proto/sync.proto`
  - `packages/protobuf/src/sync.ts`
  - `apps/api/src/sync/protobuf.generated.ts`
  - `apps/pos-app/src-tauri/src/sync/protobuf_generated.rs`
  - any new generated API push adapter file
- Do not manually edit generated files for durable changes. Change generator inputs/writers and regenerate.

## Money Field Rename Contract

Rename only fields where the unit is currently hidden.

| Current Drizzle Property | Current SQLite Column | New Drizzle Property | New SQLite Column |
| --- | --- | --- | --- |
| `products.price` | `price` | `products.priceMinorUnits` | `price_minor_units` |
| `outletProducts.price` | `price` | `outletProducts.priceMinorUnits` | `price_minor_units` |
| `orders.total` | `total` | `orders.totalMinorUnits` | `total_minor_units` |
| `orders.amountPaid` | `amount_paid` | `orders.amountPaidMinorUnits` | `amount_paid_minor_units` |
| `orders.changeAmount` | `change_amount` | `orders.changeAmountMinorUnits` | `change_amount_minor_units` |
| `orderItems.unitPrice` | `unit_price` | `orderItems.unitPriceMinorUnits` | `unit_price_minor_units` |
| `orderItems.originalPrice` | `original_price` | `orderItems.originalPriceMinorUnits` | `original_price_minor_units` |
| `orderItems.subtotal` | `subtotal` | `orderItems.subtotalMinorUnits` | `subtotal_minor_units` |

Keep these unchanged:

- `quantity`
- `sortOrder` / `sort_order`
- `byteSize` / `byte_size`
- `width`
- `height`
- `createdAt` / `created_at`
- `updatedAt` / `updated_at`
- `deletedAt` / `deleted_at`

## Target Push Shape

The final API push flow should look like:

1. Decode typed protobuf into table changes.
2. Start one transaction.
3. Load idempotency response, if present.
4. For pushed tables in `PUSH_TABLE_ORDER`, use generated adapters to convert proto rows directly into Drizzle insert rows.
5. Read existing conflict state using chunked, narrow selects:
   - normal tables: `id`, `updatedAt`
   - `order_items`: `id`, `createdAt`
6. Compute accepted/rejected rows in memory.
7. Soft-delete requested IDs directly with chunked `UPDATE ... WHERE id IN (...)`; do not do a deleted-ID existence read first.
8. Collect all sync events globally.
9. Execute ordered, chunked table writes.
10. Insert all sync events globally in chunks.
11. Read latest event ID.
12. Store idempotency response.
13. Commit.

---

## Task 1: Establish Schema Rename Tests

**Files:**
- Modify: `packages/sync-proto-generator/src/__test__/drizzle-reflection.test.ts`
- Modify: `packages/sync-proto-generator/src/__test__/manifest.test.ts`
- Modify: `apps/api/src/db/__test__/sync-events-schema.test.ts` or create `apps/api/src/db/__test__/money-schema.test.ts`
- Modify: `apps/pos-app/src/db/__test__/sync-schema.test.ts`

**Step 1: Write failing generator reflection test**

Add a test proving reflected sync columns now expose explicit minor-unit Drizzle property names for all money fields.

Expected assertions:

```ts
expect(product.columns.map((column) => column.tsName)).toContain(
  "priceMinorUnits"
);
expect(product.columns.map((column) => column.dbName)).toContain(
  "price_minor_units"
);
expect(product.columns.map((column) => column.tsName)).not.toContain("price");
```

Repeat for:

- `outletProducts.priceMinorUnits`
- `orders.totalMinorUnits`
- `orders.amountPaidMinorUnits`
- `orders.changeAmountMinorUnits`
- `orderItems.unitPriceMinorUnits`
- `orderItems.originalPriceMinorUnits`
- `orderItems.subtotalMinorUnits`

**Step 2: Run test to verify RED**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/drizzle-reflection.test.ts
```

Expected: FAIL because schemas still expose old money names.

**Step 3: Write failing manifest test**

Update manifest tests to expect money aliases are removed or reduced to none for renamed fields.

Expected assertions:

```ts
const products = syncManifest.tables.find((table) => table.tableName === "products");
expect(products?.fieldAliases?.price).toBeUndefined();
```

Also assert `order_items.fieldOrder` uses:

- `unitPriceMinorUnits`
- `originalPriceMinorUnits`
- `subtotalMinorUnits`

and no longer uses:

- `unitPrice`
- `originalPrice`
- `subtotal`

**Step 4: Run test to verify RED**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/manifest.test.ts
```

Expected: FAIL because manifest still contains old alias entries.

**Step 5: Commit tests only**

```bash
git add packages/sync-proto-generator/src/__test__/drizzle-reflection.test.ts packages/sync-proto-generator/src/__test__/manifest.test.ts apps/api/src/db/__test__ apps/pos-app/src/db/__test__
git commit -m "test(sync): define explicit minor-unit schema naming"
```

---

## Task 2: Rename Money Columns In Shared Drizzle Schemas

**Files:**
- Modify: `packages/database/src/api-schema.ts`
- Modify: `packages/database/src/local-schema.ts`

**Step 1: Implement minimal schema rename**

In `packages/database/src/api-schema.ts`, rename:

```ts
price: integer("price").notNull()
```

to:

```ts
priceMinorUnits: integer("price_minor_units").notNull()
```

Apply all renames from the Money Field Rename Contract.

In `packages/database/src/local-schema.ts`, apply the same property and SQLite column renames.

**Step 2: Run RED tests from Task 1**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/drizzle-reflection.test.ts packages/sync-proto-generator/src/__test__/manifest.test.ts
```

Expected: reflection test should move closer to GREEN; manifest test may still fail until Task 3.

**Step 3: Run database package typecheck**

Run:

```bash
bun run --cwd packages/database typecheck
```

Expected: FAIL with downstream references to old Drizzle properties or PASS if package-only does not compile consumers.

**Step 4: Commit schema rename**

```bash
git add packages/database/src/api-schema.ts packages/database/src/local-schema.ts
git commit -m "feat(db): rename money fields to minor units"
```

---

## Task 3: Update Initial SQL Migrations And Snapshots

**Files:**
- Modify: `apps/api/drizzle/0000_initial_api_schema.sql`
- Modify: `apps/api/drizzle/meta/0000_snapshot.json`
- Modify: `apps/pos-app/drizzle/0000_initial_device_schema.sql`
- Modify: `apps/pos-app/drizzle/meta/0000_snapshot.json`
- Modify: `apps/pos-app/src-tauri/src/db/migrations.rs`

**Step 1: Write failing SQL/schema tests**

If Task 1 did not add DB SQL tests, add tests now that read the SQL migration text and assert:

```ts
expect(sql).toContain("`price_minor_units` integer NOT NULL");
expect(sql).not.toContain("`price` integer NOT NULL");
```

Use table-specific context if simple substring checks become ambiguous because multiple tables contain price fields.

For Rust migration text, add or update a Rust unit test if an existing migration test exists. If not, add a TypeScript test that reads `apps/pos-app/src-tauri/src/db/migrations.rs` and asserts new column names are present.

**Step 2: Run tests to verify RED**

Run:

```bash
bun test apps/api/src/db/__test__ apps/pos-app/src/db/__test__/sync-schema.test.ts
```

Expected: FAIL because SQL migrations still use old column names.

**Step 3: Update SQL migrations and snapshots**

Replace DB column names according to the Money Field Rename Contract.

Important:

- This is a hard cut. Do not add ALTER migrations for old production data unless the branch already has generated migration conventions requiring separate numbered migrations.
- Keep `quantity`, `sort_order`, `byte_size`, dimensions, and timestamps unchanged.
- Update snapshots consistently if tests or Drizzle Kit expects them.

**Step 4: Update Rust local migration SQL**

In `apps/pos-app/src-tauri/src/db/migrations.rs`, update local SQLite table definitions and any embedded test SQL/data to use new money column names.

**Step 5: Run tests to verify GREEN**

Run:

```bash
bun test apps/api/src/db/__test__ apps/pos-app/src/db/__test__/sync-schema.test.ts
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml db:: --lib
```

Expected: PASS.

**Step 6: Commit migration changes**

```bash
git add apps/api/drizzle apps/pos-app/drizzle apps/pos-app/src-tauri/src/db/migrations.rs apps/api/src/db/__test__ apps/pos-app/src/db/__test__
git commit -m "feat(db): hard-cut money column names"
```

---

## Task 4: Update Sync Manifest And Regenerate Typed Protobuf

**Files:**
- Modify: `packages/sync-proto-generator/src/manifest.ts`
- Generated: `packages/protobuf/proto/sync.proto`
- Generated: `packages/protobuf/src/sync.ts`
- Generated: `apps/api/src/sync/protobuf.generated.ts`
- Generated: `apps/pos-app/src-tauri/src/sync/protobuf_generated.rs`
- Modify tests under: `packages/sync-proto-generator/src/__test__/`
- Modify tests under: `apps/api/src/sync/__test__/`
- Modify tests under: `apps/pos-app/src-tauri/src/sync/`

**Step 1: Update manifest minimally**

Remove money `fieldAliases` that only existed to map old storage names to explicit proto names.

For `order_items.fieldOrder`, use:

```ts
[
  "id",
  "orderId",
  "outletId",
  "productId",
  "productName",
  "quantity",
  "unitPriceMinorUnits",
  "originalPriceMinorUnits",
  "subtotalMinorUnits",
  "deletedAt",
  "createdAt",
  "updatedAt",
]
```

Validate `products`, `orders`, and `outlet_products` no longer need money aliases if reflected names already match desired proto fields.

**Step 2: Run manifest tests**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/manifest.test.ts packages/sync-proto-generator/src/__test__/drizzle-reflection.test.ts
```

Expected: PASS for manifest/reflection tests.

**Step 3: Run generator write**

Run:

```bash
bun run generate:sync-proto:write
```

Expected: generated artifacts update. `sync.proto` should keep wire names like `price_minor_units`, but the generated API mapper should no longer map `row.price` into `priceMinorUnits`.

**Step 4: Update generator tests for new no-alias behavior**

Update tests that currently expect old alias fallback behavior, for example:

- `packages/sync-proto-generator/src/__test__/ts-mapper-compare.test.ts`
- `packages/sync-proto-generator/src/__test__/ts-mapper-writer.test.ts`
- `packages/sync-proto-generator/src/__test__/rust-mapper-writer.test.ts`
- `packages/sync-proto-generator/src/__test__/rust-mapper-compare.test.ts`

Remove expectations like:

```ts
priceMinorUnits: int64Field(row.price ?? row.priceMinorUnits)
```

Prefer expectations like:

```ts
priceMinorUnits: int64Field(row.priceMinorUnits)
```

For Rust, remove fallback keys such as `"price"` when building typed push rows from local values after the schema has been renamed.

**Step 5: Run sync generator verification**

Run:

```bash
bun run sync-proto:check
bun test packages/sync-proto-generator/src
rustfmt --edition 2021 --check apps/pos-app/src-tauri/src/sync/protobuf_generated.rs
```

Expected: PASS.

**Step 6: Commit manifest and generated artifacts**

```bash
git add packages/sync-proto-generator packages/protobuf/proto/sync.proto packages/protobuf/src/sync.ts apps/api/src/sync/protobuf.generated.ts apps/pos-app/src-tauri/src/sync/protobuf_generated.rs
git commit -m "feat(sync): align protobuf money fields with schema names"
```

---

## Task 5: Update POS App TypeScript Data Layer For New Money Names

**Files:**
- Modify: `apps/pos-app/src/db/orders.ts`
- Modify: `apps/pos-app/src/db/dashboard.ts`
- Modify: `apps/pos-app/src/store/cart.ts`
- Modify: `apps/pos-app/src/pages/pos/use-pos.ts`
- Modify: `apps/pos-app/src/components/pos/product-grid.tsx`
- Modify: `apps/pos-app/src/components/pos/cart-panel.tsx`
- Modify product/category settings files that read/write `products.price`
- Modify tests under `apps/pos-app/src/**/__test__`

**Step 1: Write failing focused POS DB tests**

Update or add tests proving:

- product rows use `priceMinorUnits`
- order rows use `totalMinorUnits`, `amountPaidMinorUnits`, `changeAmountMinorUnits`
- order item rows use `unitPriceMinorUnits`, `originalPriceMinorUnits`, `subtotalMinorUnits`

Use existing tests:

```bash
bun test apps/pos-app/src/db/__test__/orders.test.ts apps/pos-app/src/db/__test__/menu.test.ts apps/pos-app/src/db/__test__/dashboard.test.ts
```

Expected: FAIL after schema rename because code still references old fields/columns.

**Step 2: Update SQL strings in POS DB code**

In `apps/pos-app/src/db/orders.ts`, update raw SQL column lists:

```sql
total_minor_units, amount_paid_minor_units, change_amount_minor_units
unit_price_minor_units, original_price_minor_units, subtotal_minor_units
```

Update selected Drizzle fields:

```ts
products.priceMinorUnits
orders.totalMinorUnits
orderItems.subtotalMinorUnits
```

**Step 3: Update internal app-facing types carefully**

Decision:

- Storage/domain types that directly represent DB rows should use `MinorUnits` suffix.
- UI form fields may keep `price` labels if they represent user-facing form names, but conversion boundaries must be explicit.
- Cart UI may keep `product.priceMinorUnits` or use a view model alias only if tests document it.

Preferred hard-cut:

```ts
product.priceMinorUnits
item.unitPriceMinorUnits
order.totalMinorUnits
```

Use helper names like `formatIDR(product.priceMinorUnits)` so unit meaning is obvious.

**Step 4: Update dashboard aggregation**

Replace:

```ts
orders.total
orderItems.subtotal
```

with:

```ts
orders.totalMinorUnits
orderItems.subtotalMinorUnits
```

Keep UI labels as “total revenue”, “subtotal”, etc. The code names carry unit semantics; product copy does not need to expose “minor units”.

**Step 5: Update POS UI/tests**

Run:

```bash
bun test apps/pos-app/src/db/__test__/orders.test.ts apps/pos-app/src/db/__test__/menu.test.ts apps/pos-app/src/db/__test__/dashboard.test.ts apps/pos-app/src/pages/pos/__test__/pos-utils.test.ts apps/pos-app/src/store/__test__/cart.test.ts
```

Expected: PASS.

**Step 6: Run POS typecheck**

Run:

```bash
bun run --cwd apps/pos-app typecheck
```

Expected: PASS.

**Step 7: Commit POS TS update**

```bash
git add apps/pos-app/src
git commit -m "feat(pos): use explicit minor-unit money fields"
```

---

## Task 6: Update POS Rust Sync Bridge For New Money Names

**Files:**
- Modify: `apps/pos-app/src-tauri/src/sync/outbox.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/schema.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/push.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/pull.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/protobuf.rs`
- Generated already updated: `apps/pos-app/src-tauri/src/sync/protobuf_generated.rs`

**Step 1: Update failing Rust tests**

Update Rust sync tests to expect JSON bridge keys with `MinorUnits` suffix where the local row map mirrors Drizzle TS names:

```rust
assert_eq!(tables["products"][0]["priceMinorUnits"], json!(15_000));
assert!(tables["products"][0].get("price").is_none());
```

For order items:

```rust
assert_eq!(tables["order_items"][0]["unitPriceMinorUnits"], json!(15_000));
assert_eq!(tables["order_items"][0]["subtotalMinorUnits"], json!(30_000));
```

**Step 2: Run Rust sync tests to verify RED**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync:: --lib
```

Expected: FAIL until Rust SQL/schema bridge is updated.

**Step 3: Update Rust SQL and JSON key handling**

Update any embedded SQL in Rust sync code:

- `price` -> `price_minor_units`
- `total` -> `total_minor_units`
- `amount_paid` -> `amount_paid_minor_units`
- `change_amount` -> `change_amount_minor_units`
- `unit_price` -> `unit_price_minor_units`
- `original_price` -> `original_price_minor_units`
- `subtotal` -> `subtotal_minor_units`

Update JSON object keys to match Drizzle/ts-proto style:

- `priceMinorUnits`
- `totalMinorUnits`
- `amountPaidMinorUnits`
- `changeAmountMinorUnits`
- `unitPriceMinorUnits`
- `originalPriceMinorUnits`
- `subtotalMinorUnits`

**Step 4: Run Rust tests to verify GREEN**

Run:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync:: --lib
rustfmt --edition 2021 --check apps/pos-app/src-tauri/src/sync/protobuf_generated.rs
```

Expected: PASS.

**Step 5: Commit Rust sync bridge update**

```bash
git add apps/pos-app/src-tauri/src/sync apps/pos-app/src-tauri/src/db/migrations.rs
git commit -m "feat(sync): update rust bridge for minor-unit money fields"
```

---

## Task 7: Update API Sync Tests And Service For New Money Names

**Files:**
- Modify: `apps/api/src/sync/service.ts`
- Modify: `apps/api/src/sync/__test__/service.test.ts`
- Modify: `apps/api/src/sync/__test__/protobuf.test.ts`
- Modify: `apps/api/src/sync/__test__/routes-protobuf.test.ts`
- Modify: `apps/api/src/sync/__test__/payload-size.test.ts`
- Modify: `apps/api/src/lib/sync-simulator.ts`
- Modify: `apps/api/src/scripts/sync-simulate-product.ts`

**Step 1: Update failing API tests**

Update test fixtures to expect API DB rows use new money property names:

```ts
expect(writtenRows).toContainEqual(
  expect.objectContaining({
    id: "product-1",
    priceMinorUnits: 15_000,
  })
);
```

Remove old expectations:

```ts
price: 15_000
total: 15_000
unitPrice: 15_000
```

**Step 2: Run tests to verify RED**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/__test__/protobuf.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts
```

Expected: FAIL until service normalization and fixtures are updated.

**Step 3: Update service normalization**

In `normalizePushBatchRowForTableName`, remove semantic remaps like:

```ts
price: normalizeBatchInt64(row.priceMinorUnits)
```

Replace with:

```ts
priceMinorUnits: normalizeBatchInt64(row.priceMinorUnits)
```

Apply all renamed money fields.

**Step 4: Update simulator and route fixtures**

Replace old DB row field names in API simulator/test data.

**Step 5: Run API tests to verify GREEN**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/__test__/protobuf.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts apps/api/src/sync/__test__/payload-size.test.ts
bun run --cwd apps/api typecheck
```

Expected: PASS.

**Step 6: Commit API rename update**

```bash
git add apps/api/src
git commit -m "feat(api): use minor-unit money fields in sync"
```

---

## Task 8: Generate API Push Table Adapters

**Files:**
- Create: `apps/api/src/sync/push-adapters.generated.ts`
- Modify: `packages/sync-proto-generator/src/ts-mapper-writer.ts` or create `packages/sync-proto-generator/src/api-push-adapter-writer.ts`
- Modify: `packages/sync-proto-generator/src/file-output.ts`
- Modify: `packages/sync-proto-generator/src/cli.ts`
- Modify: `packages/sync-proto-generator/src/index.ts`
- Create/modify tests:
  - `packages/sync-proto-generator/src/__test__/api-push-adapter-writer.test.ts`
  - `packages/sync-proto-generator/src/__test__/api-push-adapter-drift.test.ts`
  - `packages/sync-proto-generator/src/__test__/file-output.test.ts`

**Step 1: Write failing writer test**

Test that generated source contains:

```ts
// AUTO-GENERATED FILE. DO NOT EDIT.
// Generated by @repo/sync-proto-generator.
```

and exports:

```ts
export const PUSH_TABLE_ADAPTERS = [...]
export type PushTableAdapter = ...
```

**Step 2: Verify RED**

Run:

```bash
bun test packages/sync-proto-generator/src/__test__/api-push-adapter-writer.test.ts
```

Expected: FAIL because writer does not exist.

**Step 3: Define generated adapter shape**

The generated file should import API Drizzle tables:

```ts
import {
  assets,
  categories,
  merchants,
  orderItems,
  orders,
  outletProducts,
  outlets,
  products,
  registers,
  staff,
  syncEvents,
} from "@repo/database/api-schema";
```

Recommended generated type:

```ts
export interface PushTableAdapter {
  readonly serviceKey: string;
  readonly tableName: string;
  readonly table: unknown;
  readonly idColumn: unknown;
  readonly timestampColumnName: "createdAt" | "updatedAt";
  readonly writeColumnCount: number;
  readonly scope: "merchant" | "outlet";
  readonly toInsertRow: (row: Record<string, unknown>, context: PushAdapterContext) => Record<string, unknown>;
  readonly buildConflictSelect: (tx: TransactionLike, ids: string[]) => Promise<ExistingPushRow[]>;
  readonly buildUpsertQuery: (tx: TransactionLike, rows: Record<string, unknown>[]) => unknown;
  readonly buildSoftDeleteQuery: (tx: TransactionLike, ids: string[], now: string) => unknown;
}
```

Adjust types to what Drizzle accepts without introducing `any`; prefer `unknown` plus local narrowed helper types if exact Drizzle generic types become too complex.

**Step 4: Generate direct row mapping**

For each table, generated `toInsertRow` must:

- use ts-proto/Drizzle camelCase names directly
- inject `merchantId` or `outletId` only where server ownership requires it
- normalize empty strings to null for nullable string fields
- normalize int64 bigint/number values to safe JS numbers for integer columns
- strip local-only columns such as `isSynced`

Example expected generated code for products after rename:

```ts
function productToInsertRow(
  row: Record<string, unknown>,
  context: PushAdapterContext
): Record<string, unknown> {
  return {
    id: stringField(row.id),
    merchantId: context.merchantId,
    categoryId: nullableStringField(row.categoryId),
    name: stringField(row.name),
    priceMinorUnits: int64NumberField(row.priceMinorUnits, "products.priceMinorUnits"),
    imageUrl: nullableStringField(row.imageUrl),
    imageAssetId: nullableStringField(row.imageAssetId),
    isActive: booleanField(row.isActive),
    sortOrder: int64NumberField(row.sortOrder, "products.sortOrder"),
    createdAt: stringField(row.createdAt),
    updatedAt: stringField(row.updatedAt),
    deletedAt: nullableStringField(row.deletedAt),
  };
}
```

**Step 5: Generate upsert set statically**

Do not build `set` from `Object.keys(rows)` at runtime. Generate:

```ts
const productUpsertSet = {
  merchantId: sql.raw("excluded.merchant_id"),
  categoryId: sql.raw("excluded.category_id"),
  name: sql.raw("excluded.name"),
  priceMinorUnits: sql.raw("excluded.price_minor_units"),
  ...
};
```

Do not include `id`.

**Step 6: Generate narrow conflict select**

Generated select should be table-specific:

```ts
return await tx
  .select({ id: products.id, updatedAt: products.updatedAt })
  .from(products)
  .where(inArray(products.id, ids));
```

For `order_items`:

```ts
return await tx
  .select({ id: orderItems.id, createdAt: orderItems.createdAt })
  .from(orderItems)
  .where(inArray(orderItems.id, ids));
```

**Step 7: Generate soft delete query**

Generated soft delete query:

```ts
return tx
  .update(products)
  .set({ deletedAt: now, updatedAt: now })
  .where(inArray(products.id, ids));
```

**Step 8: Hook writer into CLI output**

Update `file-output.ts` so write mode targets:

```text
apps/api/src/sync/push-adapters.generated.ts
```

and compare mode targets:

```text
.logs/sync-proto-compare/push-adapters.generated.ts
```

**Step 9: Run generator and tests**

Run:

```bash
bun run generate:sync-proto:write
bun test packages/sync-proto-generator/src
bun run sync-proto:check
```

Expected: PASS after drift tests are updated.

**Step 10: Commit generated adapter support**

```bash
git add packages/sync-proto-generator apps/api/src/sync/push-adapters.generated.ts
git commit -m "feat(sync): generate API push table adapters"
```

---

## Task 9: Add Bind-Aware Chunking Utilities

**Files:**
- Create: `apps/api/src/sync/chunking.ts`
- Create: `apps/api/src/sync/__test__/chunking.test.ts`

**Step 1: Write failing chunking tests**

Test exact behavior:

```ts
test("calculates write chunk size from bind limit and column count", () => {
  expect(getWriteChunkSize({ columnCount: 12, maxBindParams: 30_000, maxRowsPerChunk: 500 })).toBe(500);
  expect(getWriteChunkSize({ columnCount: 100, maxBindParams: 1000, maxRowsPerChunk: 500 })).toBe(10);
});

test("never returns zero chunk size", () => {
  expect(getWriteChunkSize({ columnCount: 50_000, maxBindParams: 30_000, maxRowsPerChunk: 500 })).toBe(1);
});

test("chunks rows without mutating input", () => {
  const rows = [1, 2, 3, 4, 5];
  expect(chunkArray(rows, 2)).toEqual([[1, 2], [3, 4], [5]]);
  expect(rows).toEqual([1, 2, 3, 4, 5]);
});
```

**Step 2: Run test to verify RED**

Run:

```bash
bun test apps/api/src/sync/__test__/chunking.test.ts
```

Expected: FAIL because module does not exist.

**Step 3: Implement utility**

Use constants:

```ts
export const SQLITE_BIND_PARAM_LIMIT = 32_766;
export const SAFE_SQLITE_BIND_PARAM_LIMIT = 30_000;
export const DEFAULT_MAX_ROWS_PER_WRITE_CHUNK = 500;
export const DEFAULT_MAX_IDS_PER_READ_CHUNK = 1000;
export const DEFAULT_MAX_EVENTS_PER_INSERT_CHUNK = 1000;
```

Implement:

```ts
export function getWriteChunkSize(input: {
  columnCount: number;
  maxBindParams?: number;
  maxRowsPerChunk?: number;
}): number;

export function chunkArray<T>(rows: readonly T[], chunkSize: number): T[][];
```

Throw descriptive `Error` for invalid chunk size inputs.

**Step 4: Run test to verify GREEN**

Run:

```bash
bun test apps/api/src/sync/__test__/chunking.test.ts
```

Expected: PASS.

**Step 5: Commit chunk utility**

```bash
git add apps/api/src/sync/chunking.ts apps/api/src/sync/__test__/chunking.test.ts
git commit -m "feat(sync): add bind-aware chunking utilities"
```

---

## Task 10: Refactor Conflict Reads To Generated Narrow Chunked Selects

**Files:**
- Modify: `apps/api/src/sync/service.ts`
- Modify: `apps/api/src/sync/__test__/service.test.ts`
- Uses generated: `apps/api/src/sync/push-adapters.generated.ts`
- Uses: `apps/api/src/sync/chunking.ts`

**Step 1: Write failing service test**

Add a test proving a product push selects only `id` and `updatedAt`, not a full row.

With mocks, assert `select` receives:

```ts
expect(select).toHaveBeenCalledWith({
  id: expect.anything(),
  updatedAt: expect.anything(),
});
```

For `order_items`, assert:

```ts
expect(select).toHaveBeenCalledWith({
  createdAt: expect.anything(),
  id: expect.anything(),
});
```

**Step 2: Write failing chunked read test**

Use a low injected read chunk size or many IDs and assert generated conflict select is called multiple times.

If injection is awkward, export a small helper:

```ts
selectExistingRowsChunked(adapter, tx, ids, chunkSize)
```

and test it directly.

**Step 3: Run tests to verify RED**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: FAIL because current service uses full `select()` and no read chunking.

**Step 4: Refactor service to use adapters**

Replace switch-based `selectExistingRowsForTableName` with:

```ts
const adapter = getPushTableAdapter(input.tableName);
const existingRows = await selectExistingRowsChunked(
  adapter,
  input.tx,
  ids
);
```

Preserve `clientRowWins` behavior:

- use `createdAt` for `order_items`
- use `updatedAt` for all other tables

**Step 5: Run tests to verify GREEN**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: PASS.

**Step 6: Commit conflict read refactor**

```bash
git add apps/api/src/sync/service.ts apps/api/src/sync/__test__/service.test.ts
git commit -m "perf(sync): use narrow chunked conflict reads"
```

---

## Task 11: Refactor Bulk Upserts To Generated Static Sets And Chunking

**Files:**
- Modify: `apps/api/src/sync/service.ts`
- Modify: `apps/api/src/sync/__test__/service.test.ts`
- Uses generated: `apps/api/src/sync/push-adapters.generated.ts`
- Uses: `apps/api/src/sync/chunking.ts`

**Step 1: Write failing test for chunked upserts**

Add a test with an artificially low max write chunk size, or test an exported helper:

```ts
await upsertRowsChunked({
  adapter,
  tx,
  rows: [row1, row2, row3],
  chunkSize: 2,
});
```

Assert `.values(...)` is called with:

- first call length `2`
- second call length `1`

**Step 2: Write failing test that runtime `Object.keys` set builder is not used**

Remove direct tests for `buildExcludedSet`, or add a test proving the generated adapter's static `upsertSet` is passed to `onConflictDoUpdate`.

Expected:

```ts
expect(onConflictDoUpdate).toHaveBeenCalledWith(
  expect.objectContaining({
    set: productAdapter.upsertSet,
  })
);
```

**Step 3: Run tests to verify RED**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: FAIL because current code does one unchunked upsert and builds set dynamically.

**Step 4: Implement chunked adapter upsert**

Replace `bulkUpsertRowsForTableName` and `bulkUpsertRows` switch logic with adapter-driven logic:

```ts
async function upsertRowsChunked(input: {
  adapter: PushTableAdapter;
  tx: TransactionTx;
  rows: Record<string, unknown>[];
}) {
  const chunkSize = getWriteChunkSize({ columnCount: input.adapter.writeColumnCount });
  for (const chunk of chunkArray(input.rows, chunkSize)) {
    await input.adapter.upsert(input.tx, chunk);
  }
}
```

Do not use `Promise.all`.

**Step 5: Run tests to verify GREEN**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
bun run --cwd apps/api typecheck
```

Expected: PASS.

**Step 6: Commit upsert refactor**

```bash
git add apps/api/src/sync/service.ts apps/api/src/sync/__test__/service.test.ts
git commit -m "perf(sync): chunk generated bulk upserts"
```

---

## Task 12: Remove Deleted-ID Existence Reads

**Files:**
- Modify: `apps/api/src/sync/service.ts`
- Modify: `apps/api/src/sync/__test__/service.test.ts`

**Step 1: Write failing test**

Add a test with only `deletedIds` for a table and assert:

- service does not run a select for existing delete IDs
- service runs update with `WHERE id IN (...)`
- ack still includes all requested deleted IDs
- sync events are still generated for all requested deleted IDs

Expected ack:

```ts
expect(result.tables[0]?.acceptedDeletedIds).toEqual(["deleted-1", "missing-1"]);
```

**Step 2: Run test to verify RED**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: FAIL because current code calls `existingRowIdsForTableName`.

**Step 3: Remove existence read**

Delete:

- `existingRowIdsForTableName`
- the filtering logic in `processTimestamplessDeletedIds`

Replace with:

```ts
await softDeleteRowsChunked({
  adapter,
  tx,
  ids: input.changes.deletedIds,
  now,
});
```

Continue accepting all delete IDs in ack.

**Step 4: Run tests to verify GREEN**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: PASS.

**Step 5: Commit delete optimization**

```bash
git add apps/api/src/sync/service.ts apps/api/src/sync/__test__/service.test.ts
git commit -m "perf(sync): remove deleted id existence reads"
```

---

## Task 13: Collect And Insert Sync Events Globally In Chunks

**Files:**
- Modify: `apps/api/src/sync/service.ts`
- Modify: `apps/api/src/sync/__test__/service.test.ts`

**Step 1: Write failing global event insert test**

Create a push with multiple tables, for example `products`, `orders`, and `order_items`.

Assert:

- event rows are inserted after table row writes
- event insert receives events across all tables
- with small event chunk size, event insert chunks are deterministic

If test injection is needed, extract:

```ts
insertSyncEventsChunked(tx, events, chunkSize)
```

and test directly.

**Step 2: Run test to verify RED**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: FAIL because current code inserts sync events inside each table process.

**Step 3: Refactor process shape**

Change `processPushBatchTable` to return:

```ts
interface ProcessedPushTable {
  ack: PushBatchTableAck;
  syncEvents: Record<string, unknown>[];
}
```

In `handlePushBatch`, collect:

```ts
const allSyncEventRows: Record<string, unknown>[] = [];
```

After all table writes/deletes complete, run:

```ts
await insertSyncEventsChunked(tx, allSyncEventRows);
```

**Step 4: Preserve latest event behavior**

Keep `latestEventId` lookup after inserting all sync events.

**Step 5: Run tests to verify GREEN**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: PASS.

**Step 6: Commit global event insertion**

```bash
git add apps/api/src/sync/service.ts apps/api/src/sync/__test__/service.test.ts
git commit -m "perf(sync): insert sync events globally in chunks"
```

---

## Task 14: Preserve Ordered Write Phase And Evaluate `db.batch`

**Files:**
- Modify: `apps/api/src/sync/service.ts`
- Modify: `apps/api/src/sync/__test__/service.test.ts`
- Optional doc update: `docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md`

**Step 1: Write failing order test**

Add a test that pushes FK-dependent tables and records operation order.

Expected operation order:

```text
products upsert before order_items upsert
orders upsert before order_items upsert
outlet_products before orders is allowed by table order, but do not move order_items earlier
sync_events insert after all row writes
```

**Step 2: Run test to verify RED or protect current behavior**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: It may PASS if current sequential loop already preserves this. If it passes, keep it as a regression test before refactoring.

**Step 3: Investigate Drizzle/libSQL batch support in current types**

Check whether transaction object supports `batch`:

```bash
rg -n "batch\\(" node_modules/drizzle-orm apps/api/node_modules packages -g '*.d.ts'
```

If needed, use official Drizzle docs for the current version.

**Step 4: Decide implementation**

Use this decision rule:

- If `tx.batch(...)` is supported and type-safe for Drizzle libSQL transactions, collect ordered write query builders and execute `await tx.batch(queries)`.
- If only `db.batch(...)` is supported outside an interactive transaction, do not use it yet unless tests prove idempotency + writes + latest event + response storage remain atomic.
- If neither is safe, keep sequential awaited writes inside `db.transaction(...)`; the earlier chunking/narrow reads/global events are still valuable.

**Step 5: Add explicit code comment if batch is not used**

If keeping sequential writes, add a short comment near write execution:

```ts
// Keep writes inside the interactive transaction. Drizzle/libSQL batch is only used here after verifying it preserves the same atomic idempotency semantics.
```

**Step 6: Run tests**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
bun run --cwd apps/api typecheck
```

Expected: PASS.

**Step 7: Commit ordered write phase**

```bash
git add apps/api/src/sync/service.ts apps/api/src/sync/__test__/service.test.ts docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md
git commit -m "perf(sync): preserve ordered transactional write phase"
```

---

## Task 15: Add Prepared Statements Only For Fixed-Shape Metadata Queries

**Files:**
- Modify: `apps/api/src/sync/service.ts`
- Modify: `apps/api/src/sync/routes.ts`
- Modify tests under: `apps/api/src/sync/__test__/`

**Step 1: Write failing tests for fixed-shape query wrappers**

Extract small functions if needed:

- `loadPushBatchResponse`
- `getLatestScopedEventId`
- `getOutletMerchantId`

Add tests that verify behavior, not Drizzle internals:

- same idempotency key + same hash returns cached response
- same idempotency key + different hash throws conflict
- latest event returns `0` when none exists

These tests likely already exist partially; strengthen them before changing implementation.

**Step 2: Verify current tests pass before optimization**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts
```

Expected: PASS.

**Step 3: Implement prepared metadata queries only if type-safe**

Use Drizzle prepared statements for fixed-shape queries as documented:

- idempotency lookup by scope/idempotency key
- latest scoped event lookup if the OR condition can be parameterized cleanly
- outlet merchant lookup in route if it stays fixed shape

Do not prepare variable-size `IN (...)` conflict reads or bulk upserts in this phase.

**Step 4: Run tests**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts
bun run --cwd apps/api typecheck
```

Expected: PASS.

**Step 5: Commit prepared metadata query optimization**

If implemented:

```bash
git add apps/api/src/sync/service.ts apps/api/src/sync/routes.ts apps/api/src/sync/__test__
git commit -m "perf(sync): prepare fixed-shape metadata queries"
```

If not implemented because Drizzle/libSQL typing or Worker lifecycle makes it unsafe, commit a documentation note instead:

```bash
git add docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md
git commit -m "docs(sync): document prepared statement constraints"
```

---

## Task 16: Harden Idempotency Race Behavior

**Files:**
- Modify: `apps/api/src/sync/service.ts`
- Modify: `apps/api/src/sync/__test__/service.test.ts`

**Step 1: Write failing race test**

Simulate:

- `loadPushBatchResponse` returns null
- `storePushBatchResponse` insert throws unique constraint error
- service reloads cached response and returns it

Expected:

```ts
await expect(handlePushBatch(...)).resolves.toEqual(cachedResponse);
```

For different request hash, expected conflict remains:

```ts
await expect(handlePushBatch(...differentHash...)).rejects.toThrow(
  "idempotency key reused with different request body"
);
```

**Step 2: Run test to verify RED**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: FAIL because current insert race is not handled.

**Step 3: Implement unique conflict handling**

Create helper:

```ts
function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /unique|constraint/i.test(error.message);
}
```

When `storePushBatchResponse` fails with unique constraint:

1. call `loadPushBatchResponse`
2. return cached if hash matches
3. throw original/conflict if hash differs or cache cannot be loaded

Keep this inside the transaction only if supported. If a failed insert poisons the transaction for libSQL, move the retry outside the transaction with a test proving behavior.

**Step 4: Run tests to verify GREEN**

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
```

Expected: PASS.

**Step 5: Commit idempotency hardening**

```bash
git add apps/api/src/sync/service.ts apps/api/src/sync/__test__/service.test.ts
git commit -m "fix(sync): handle concurrent idempotent pushes"
```

---

## Task 17: Update Documentation And Agent Guidance

**Files:**
- Modify: `docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md`
- Modify: `AGENTS.md`
- Optional modify: `docs/knowledge/APP-LOGGING-DOCS.md` only if new log prefixes are added
- Optional modify: `logs/capture-adb-logcat.sh` only if new log prefixes are added

**Step 1: Update sync generator docs**

Document:

- money fields must use `MinorUnits` in Drizzle TS names
- SQLite columns must use `_minor_units`
- protobuf fields should naturally match via snake_case
- generated API push adapters are source-generated and should not be hand-edited
- push optimization rules:
  - generated adapters
  - bind-aware chunking
  - narrow conflict reads
  - no deleted-ID existence reads
  - global sync event insert
  - FK-safe table order

**Step 2: Update AGENTS.md**

In the sync schema/protobuf guidance, add:

- before adding a money column, use `MinorUnits` naming
- after schema changes, run `bun run generate:sync-proto:write`
- never manually patch generated adapter/protobuf files

**Step 3: If logs were added, update logging docs**

If implementation adds any new operational logs:

- update `docs/knowledge/APP-LOGGING-DOCS.md`
- update `logs/capture-adb-logcat.sh` `LOG_FILTER`

If no logs were added, do not edit logging files just to satisfy habit.

**Step 4: Run doc-safe checks**

Run:

```bash
bun x ultracite check docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md AGENTS.md
```

Expected: PASS.

**Step 5: Commit docs**

```bash
git add docs/knowledge/SYNC-TYPED-PROTOBUF-GENERATOR.md AGENTS.md docs/knowledge/APP-LOGGING-DOCS.md logs/capture-adb-logcat.sh
git commit -m "docs(sync): document optimized typed protobuf push workflow"
```

---

## Task 18: Full Verification Pass

**Files:** No intended code changes. Fix only if verification exposes issues.

**Step 1: Run sync generator verification**

```bash
bun run generate:sync-proto:write
bun run sync-proto:check
bun test packages/sync-proto-generator/src
```

Expected: PASS and no generated drift.

**Step 2: Run API sync tests**

```bash
bun test apps/api/src/sync/__test__/service.test.ts apps/api/src/sync/__test__/protobuf.test.ts apps/api/src/sync/__test__/routes-protobuf.test.ts apps/api/src/sync/__test__/payload-size.test.ts
bun run --cwd apps/api typecheck
```

Expected: PASS.

**Step 3: Run POS app focused tests**

```bash
bun test apps/pos-app/src/db/__test__/orders.test.ts apps/pos-app/src/db/__test__/menu.test.ts apps/pos-app/src/db/__test__/dashboard.test.ts apps/pos-app/src/store/__test__/cart.test.ts apps/pos-app/src/pages/pos/__test__/pos-utils.test.ts
bun run --cwd apps/pos-app typecheck
```

Expected: PASS.

**Step 4: Run Rust sync tests**

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml sync:: --lib
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml db:: --lib
rustfmt --edition 2021 --check apps/pos-app/src-tauri/src/sync/protobuf_generated.rs
```

Expected: PASS.

**Step 5: Run lint/format checks**

```bash
bun x ultracite check packages/database packages/sync-proto-generator packages/protobuf apps/api/src/sync apps/pos-app/src
```

Expected: PASS.

**Step 6: Run full test if time permits**

```bash
bun test
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: PASS.

**Step 7: Verify no stale generated compare artifacts**

```bash
find packages/protobuf -path '*/generated/*' -print
find packages/sync-proto-generator -path '*/generated/*' -print
```

Expected: no output.

**Step 8: Verify no old DB money columns remain in schemas/migrations**

Run:

```bash
rg -n "\\b(price|total|amount_paid|change_amount|unit_price|original_price|subtotal)\\b" packages/database apps/api/drizzle apps/pos-app/drizzle apps/pos-app/src-tauri/src/db/migrations.rs
```

Expected:

- No old money DB column definitions remain.
- Some UI/domain words like “total” may remain in non-storage context. Review results manually.

**Step 9: Commit verification fixes if any**

```bash
git add .
git commit -m "test(sync): verify optimized minor-unit push path"
```

Only commit if verification required code/test/doc fixes.

---

## Manual Verification Guide

After automated verification passes, test on a real device before considering the sync feature production-ready.

### Manual UI Steps

1. Install a fresh dev build so the local database is created with hard-cut column names.
2. Login and pair/register the outlet.
3. Create a category.
4. Create a product with a price and optional image.
5. Create an order with one item and cash payment.
6. Go offline.
7. Create another product and another order.
8. Edit a product price.
9. Delete or deactivate a product/category if the UI supports it.
10. Go online and trigger sync.
11. Pull from a second fresh device/session if available.
12. Confirm products, prices, orders, order items, totals, payment amounts, and deleted state match.

### Log Checks

Before changing log filters, read `docs/knowledge/APP-LOGGING-DOCS.md`.

Use:

```bash
bash logs/capture-adb-logcat.sh
```

Or PID-scoped:

```bash
PID="$(adb shell pidof -s com.sakti_dev.sakti_pos | tr -d '\r')" && adb logcat -v brief --pid="$PID" | grep --line-buffered -iE '\[(JS|RUST)\] \[(SYNC|DB|POS):|AndroidRuntime|libc|fatal|exception|crash'
```

Expected:

- no protobuf decode errors
- no SQLite missing-column errors
- no sync push 413 unless intentionally testing over-limit payload
- no bind parameter limit errors
- sync outbox drains after successful push

### API DB Checks

Use Turso/local SQLite inspection to verify columns and values:

```sql
SELECT id, price_minor_units FROM products LIMIT 5;
SELECT id, total_minor_units, amount_paid_minor_units, change_amount_minor_units FROM orders LIMIT 5;
SELECT id, unit_price_minor_units, original_price_minor_units, subtotal_minor_units FROM order_items LIMIT 5;
SELECT table_name, row_id, operation FROM sync_events ORDER BY id DESC LIMIT 20;
```

Expected:

- new `_minor_units` columns exist
- old money columns do not exist
- sync events are present for accepted pushed rows/deletes

### Edge Cases

- Push 1500-2000 order items from offline mode to exercise chunking near route limits.
- Push deleted IDs that do not exist on the server; API should accept them and not fail.
- Retry the exact same idempotency key/request; response should be cached.
- Retry the same idempotency key with a changed request; API should return conflict.
- Push stale client update where server timestamp is newer; row should be rejected with `server_newer`.

---

## Rollback Notes

Because this is a hard-cut pre-launch schema change, rollback means reverting the branch commits and recreating local/dev databases. Do not attempt mixed old/new schema compatibility unless product requirements change.

If a real device has a pre-hard-cut local DB during development, uninstall app or clear app data before testing the hard-cut branch.
