# Sync Push Empty String FK Violation Fix

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix API sync push handler to normalize empty strings to null for all nullable columns, preventing FK constraint violations when POS rows are pushed to the API.

**Architecture:** The POS local SQLite stores empty strings (`""`) for nullable columns instead of SQL `NULL` (originating from both the pull path and raw SQL inserts). When these rows are pushed to the API, the empty strings violate FK constraints on nullable reference columns (`orders.register_id`, `orders.staff_id`, `order_items.product_id`, `products.category_id`, `staff.cloud_user_id`, `staff.outlet_id`). The fix normalizes all empty strings to null in the API push handler before insert/update, using a general-purpose helper applied to every row. The `normalizeOrderItemRow` function is simplified since the general normalization handles empty strings.

**Tech Stack:** TypeScript, Bun test, Drizzle ORM, Vi mocks

---

## Root Cause Analysis

The log shows two distinct 500 errors on `POST /api/sync/push`:

1. **First failure (08:32):** `insert into "order_items"` — params show `product_id` is empty string (`""`), violating FK constraint `product_id REFERENCES products(id)`.
2. **Second failure (08:37):** `insert into "orders"` — params show `register_id` is empty string (`""`), violating FK constraint `register_id REFERENCES registers(id)`.

**Why empty strings exist:** The POS local SQLite has no FK constraints. Rows arrive via two paths:
- **Pull path:** API rows may have `deleted_at = ""` (known pattern from GC bug doc). Pull stores them as-is.
- **Raw SQL inserts:** `createOrder` uses raw SQL that omits `deleted_at`, which gets SQLite column default (NULL). But when a pulled row is later re-pushed, the stored `""` survives.

**Why `normalizeOrderItemRow` doesn't catch it:**
```typescript
// Current code (BUGGY):
if (typeof row.productId !== "string" || row.productId.length === 0) {
    return row;  // empty string "" returns UNCHANGED
}
return { ...row, productId: null };  // only non-empty UUID gets nullified
```
When `productId = ""`, the condition `row.productId.length === 0` is true, so the row is returned with the empty string intact.

**Why `orders.registerId` fails:** There is no normalization function for orders at all. Empty string `registerId` reaches the insert directly.

## Nullable FK Columns at Risk

All of these API-schema columns have `REFERENCES` without `.notNull()` and will fail on empty string `""`:

| Table | Column | FK Target |
|-------|--------|-----------|
| `products` | `categoryId` | `categories(id)` |
| `orders` | `registerId` | `registers(id)` |
| `orders` | `staffId` | `staff(id)` |
| `order_items` | `productId` | `products(id)` |
| `staff` | `cloudUserId` | `users(id)` |
| `staff` | `outletId` | `outlets(id)` |

## Strategy

Add a single `normalizeEmptyToNull` helper that converts all empty string values in a row to `null`. Apply it universally in `handlePush` before any table-specific processing. This is safe because:
- Empty strings are never meaningful data in any sync table
- Non-FK nullable columns (`deleted_at`, `pin`, `address`) also benefit from normalization
- The POS never intentionally stores empty strings as meaningful values

Then simplify `normalizeOrderItemRow` to always set `productId: null` (order items are snapshots).

---

### Task 1: Test — empty string `productId` in order_items insert

**Files:**
- Test: `apps/api/src/__test__/sync.test.ts`

**Step 1: Write the failing test**

Add inside the `describe("handlePush")` block, after the existing "does not enforce product references" test:

```typescript
test("normalizes empty string productId to null for order item inserts", async () => {
    const insertedValues = vi.fn().mockResolvedValue(undefined);
    mockTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => {
            const tx = {
                insert: vi.fn().mockReturnValue({
                    values: insertedValues,
                }),
                select: vi.fn().mockReturnValue({
                    from: vi.fn().mockReturnValue({
                        where: vi.fn().mockReturnValue({
                            limit: vi.fn().mockResolvedValue([]),
                        }),
                    }),
                }),
            };
            await fn(tx);
        },
    );

    await handlePush("outlet-1", "merchant-1", {
        order_items: [
            {
                createdAt: "2026-05-10T00:39:47.185Z",
                id: "item-1",
                orderId: "order-1",
                productId: "",
                productName: "Nasi",
                quantity: 1,
                subtotal: 4000,
                unitPrice: 4000,
                updatedAt: "2026-05-10T00:39:47.185Z",
            },
        ],
    });

    expect(insertedValues).toHaveBeenCalledWith(
        expect.objectContaining({
            id: "item-1",
            productId: null,
        }),
    );
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test src/__test__/sync.test.ts`
Expected: FAIL — `productId` in the inserted values is `""` not `null`.

---

### Task 2: Test — empty string `registerId` in orders insert

**Files:**
- Test: `apps/api/src/__test__/sync.test.ts`

**Step 1: Write the failing test**

Add inside the `describe("handlePush")` block:

```typescript
test("normalizes empty string registerId to null for order inserts", async () => {
    const insertedValues = vi.fn().mockResolvedValue(undefined);
    mockTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => {
            const tx = {
                insert: vi.fn().mockReturnValue({
                    values: insertedValues,
                }),
                select: vi.fn().mockReturnValue({
                    from: vi.fn().mockReturnValue({
                        where: vi.fn().mockReturnValue({
                            limit: vi.fn().mockResolvedValue([]),
                        }),
                    }),
                }),
            };
            await fn(tx);
        },
    );

    await handlePush("outlet-1", "merchant-1", {
        orders: [
            {
                createdAt: "2026-05-10T00:39:47.185Z",
                id: "order-1",
                orderNumber: "2026-05-10-001",
                paymentMethod: "cash",
                registerId: "",
                staffId: "staff-1",
                status: "completed",
                total: 18000,
                updatedAt: "2026-05-10T00:39:47.185Z",
            },
        ],
    });

    expect(insertedValues).toHaveBeenCalledWith(
        expect.objectContaining({
            id: "order-1",
            registerId: null,
            staffId: "staff-1",
        }),
    );
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test src/__test__/sync.test.ts`
Expected: FAIL — `registerId` in the inserted values is `""` not `null`.

---

### Task 3: Test — empty string `categoryId` in products insert

**Files:**
- Test: `apps/api/src/__test__/sync.test.ts`

**Step 1: Write the failing test**

Add inside the `describe("handlePush")` block:

```typescript
test("normalizes empty string categoryId to null for product inserts", async () => {
    const insertedValues = vi.fn().mockResolvedValue(undefined);
    mockTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => {
            const tx = {
                insert: vi.fn().mockReturnValue({
                    values: insertedValues,
                }),
                select: vi.fn().mockReturnValue({
                    from: vi.fn().mockReturnValue({
                        where: vi.fn().mockReturnValue({
                            limit: vi.fn().mockResolvedValue([]),
                        }),
                    }),
                }),
            };
            await fn(tx);
        },
    );

    const now = new Date().toISOString();
    await handlePush("outlet-1", "merchant-1", {
        products: [
            {
                categoryId: "",
                createdAt: now,
                id: "prod-1",
                merchantId: "merchant-1",
                name: "Nasi Goreng",
                price: 15000,
                updatedAt: now,
            },
        ],
    });

    expect(insertedValues).toHaveBeenCalledWith(
        expect.objectContaining({
            categoryId: null,
            id: "prod-1",
            name: "Nasi Goreng",
        }),
    );
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test src/__test__/sync.test.ts`
Expected: FAIL — `categoryId` in the inserted values is `""` not `null`.

---

### Task 4: Test — full order + order_items push with empty strings (integration)

**Files:**
- Test: `apps/api/src/__test__/sync.test.ts`

**Step 1: Write the failing test**

This test reproduces the exact scenario from the log: pushing an order with `registerId: ""` and order_items with `productId: ""` in a single payload, verifying both are normalized.

Add inside the `describe("handlePush")` block:

```typescript
test("normalizes empty strings across orders and order_items in a single push", async () => {
    const insertedValues: Record<string, unknown>[] = [];
    mockTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => {
            const tx = {
                insert: vi.fn().mockReturnValue({
                    values: vi.fn((value: Record<string, unknown>) => {
                        insertedValues.push(value);
                        return Promise.resolve();
                    }),
                }),
                select: vi.fn().mockReturnValue({
                    from: vi.fn().mockReturnValue({
                        where: vi.fn().mockReturnValue({
                            limit: vi.fn().mockResolvedValue([]),
                        }),
                    }),
                }),
            };
            await fn(tx);
        },
    );

    await handlePush("outlet-1", "merchant-1", {
        order_items: [
            {
                createdAt: "2026-05-10T00:39:47.185Z",
                id: "item-1",
                orderId: "order-1",
                productId: "",
                productName: "Nasi",
                quantity: 1,
                subtotal: 4000,
                unitPrice: 4000,
                updatedAt: "2026-05-10T00:39:47.185Z",
            },
        ],
        orders: [
            {
                createdAt: "2026-05-10T00:39:47.185Z",
                id: "order-1",
                orderNumber: "2026-05-10-001",
                paymentMethod: "cash",
                registerId: "",
                staffId: "staff-1",
                status: "completed",
                total: 4000,
                updatedAt: "2026-05-10T00:39:47.185Z",
            },
        ],
    });

    const order = insertedValues.find((v) => v.id === "order-1");
    const item = insertedValues.find((v) => v.id === "item-1");

    expect(order).toEqual(
        expect.objectContaining({
            registerId: null,
            staffId: "staff-1",
        }),
    );
    expect(item).toEqual(
        expect.objectContaining({
            productId: null,
            productName: "Nasi",
        }),
    );
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test src/__test__/sync.test.ts`
Expected: FAIL — `registerId` and `productId` are `""` not `null`.

---

### Task 5: Implement — add `normalizeEmptyToNull` helper and apply in push pipeline

**Files:**
- Modify: `apps/api/src/lib/sync.ts`

**Step 1: Add the helper function**

Add this function near the top of the file (after the imports and constants, around line 41):

```typescript
function normalizeEmptyToNull(
    row: Record<string, unknown>,
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
        result[key] = typeof value === "string" && value.length === 0 ? null : value;
    }
    return result;
}
```

**Step 2: Apply in the push loop**

In `handlePush`, change line 96 from:

```typescript
const row = stripLocalOnlyColumns(rawRow);
```

to:

```typescript
const row = normalizeEmptyToNull(stripLocalOnlyColumns(rawRow));
```

**Step 3: Simplify `normalizeOrderItemRow`**

Since `normalizeEmptyToNull` now handles empty string → null conversion, `normalizeOrderItemRow` only needs to nullify valid `productId` references (order items are immutable snapshots). Replace the entire function:

```typescript
function normalizeOrderItemRow(
    row: Record<string, unknown>,
): Record<string, unknown> {
    return { ...row, productId: null };
}
```

**Step 4: Run all tests to verify they pass**

Run: `cd apps/api && bun test src/__test__/sync.test.ts`
Expected: ALL PASS — the four new tests pass, and all existing tests still pass.

---

### Task 6: Verify — run full test suite and type checks

**Step 1: Run API tests**

Run: `cd apps/api && bun test`
Expected: All tests pass (should be ~68-69 tests with the 4 new ones).

**Step 2: Run API type check**

Run: `cd apps/api && bun run check-types`
Expected: PASS, no type errors.

**Step 3: Run linter**

Run: `bun x ultracite check apps/api/src/lib/sync.ts apps/api/src/__test__/sync.test.ts`
Expected: PASS, no lint issues.

---

### Task 7: Commit

```bash
git add apps/api/src/lib/sync.ts apps/api/src/__test__/sync.test.ts
git commit -m "fix: normalize empty strings to null in sync push to prevent FK violations"
```

## What This Does NOT Change (Intentionally)

- **POS-side code:** The Rust sync layer correctly preserves whatever SQLite stores. Fixing empty strings at the source would require changing the pull upsert path and all raw SQL insert statements. The API-side normalization is the defensive boundary.
- **API schema:** No schema changes needed. The FK constraints are correct; they just need clean input.
- **`deleted_at` handling:** Empty string `deleted_at` values are also normalized to null, which is correct behavior (empty string ≠ deleted). The `getAcceptedOperation` function uses `row.deletedAt` which is falsy for both `null` and `""` → `null`, so it correctly treats these as non-deleted.

## Retest Instructions

After implementing:

1. Restart the API dev server: `cd apps/api && bun run dev`
2. Run API DB schema push (no schema changes in this fix, but good practice): `cd apps/api && bun run db:push`
3. Rebuild/reopen the POS app (no Rust changes in this fix, but if stale): `cd apps/pos-app && bun run tauri android dev`
4. Watch logs:
```bash
adb logcat -c && adb logcat -s "Tauri/Console:*" "RustStdoutStderr:*" | grep -E "\[SYNC-DEBUG\]|\[CLOUD-AUTH\]|\[CLOUD-LOGIN\]|\[AUTH\]|FAILED|Failed|Error"
```
5. Expected: push succeeds with no 500 errors, categories/products/orders/order_items all synced.
