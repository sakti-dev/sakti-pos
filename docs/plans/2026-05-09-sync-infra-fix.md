# Sync Infrastructure Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the sync infrastructure so that all shared tables sync correctly between local SQLite and cloud API, enabling multi-device support and proper reinstallation flow.

**Architecture:** The sync system uses outlet-scoped pull/push via a custom Rust sync engine. Pull fetches changed rows from cloud API and upserts into local DB. Push reads unsynced local rows and POSTs to cloud API. GC hard-deletes soft-deleted rows after confirmed sync. The system has 6 critical bugs preventing it from working at all. This plan fixes the schema mismatches, the push filter bug, the column mapping issues, and adds proper support for merchants/outlets/registers sync.

**Tech Stack:** TypeScript, Drizzle ORM, Elysia, Rust/sqlx, Tauri, Vitest

---

## Bug Summary

| # | Severity | Issue |
|---|----------|-------|
| 1 | CRITICAL | Push binds `outlet_id` but filter column is `merchant_id` for categories/products/staff — push NEVER finds rows |
| 2 | CRITICAL | `SELECT *` includes `is_synced` column which doesn't exist in cloud DB — push crashes |
| 3 | CRITICAL | `deleted_at` missing in cloud schema for `staff` and `outlet_products` — push crashes on soft-deletes |
| 4 | CRITICAL | `order_items` missing `updated_at` in local schema — pull crashes when server returns it |
| 5 | CRITICAL | Server `handlePush` sets raw row including `is_synced` — all push operations fail |
| 6 | HIGH | No `serverWins` handling — local data diverges silently |
| 7 | HIGH | `merchants`, `outlets`, `registers` not synced — multi-device broken |
| 8 | MEDIUM | Pull uses single `since` timestamp from `orders` for all tables |

---

## Task 1: Align cloud and local schemas

Add missing columns so both schemas have compatible column sets for synced tables.

**Files:**
- Modify: `packages/database/src/api-schema.ts`
- Modify: `packages/database/src/local-schema.ts`

**Step 1: Add `deleted_at` to cloud `staff` table**

In `packages/database/src/api-schema.ts`, add `deleted_at` to the `staff` table:

```typescript
export const staff = sqliteTable("staff", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => uuidv7()),
	merchantId: text("merchant_id")
		.notNull()
		.references((): SQLiteColumn => merchants.id),
	outletId: text("outlet_id").references((): SQLiteColumn => outlets.id),
	name: text("name").notNull(),
	pin: text("pin"),
	role: text("role", { enum: ["cashier", "manager", "owner"] }).notNull(),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	deletedAt: text("deleted_at"),          // <-- ADD THIS
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});
```

**Step 2: Add `deleted_at` to cloud `outlet_products` table**

In `packages/database/src/api-schema.ts`, add `deleted_at` to the `outletProducts` table:

```typescript
export const outletProducts = sqliteTable("outlet_products", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => uuidv7()),
	outletId: text("outlet_id")
		.notNull()
		.references((): SQLiteColumn => outlets.id),
	productId: text("product_id")
		.notNull()
		.references((): SQLiteColumn => products.id),
	price: integer("price"),
	isAvailable: integer("is_available", { mode: "boolean" })
		.notNull()
		.default(true),
	sortOrder: integer("sort_order"),
	deletedAt: text("deleted_at"),          // <-- ADD THIS
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});
```

**Step 3: Add `updated_at` to local `order_items` table**

In `packages/database/src/local-schema.ts`, add `updatedAt` to the `orderItems` table (before `deletedAt`):

```typescript
export const orderItems = sqliteTable("order_items", {
	// ... existing columns ...
	subtotal: integer("subtotal").notNull(),
	updatedAt: text("updated_at")            // <-- ADD THIS
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	deletedAt: text("deleted_at"),
	isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
	// ...
});
```

**Step 4: Add `deleted_at` to cloud `merchants` table**

In `packages/database/src/api-schema.ts`, add `deleted_at` to the `merchants` table:

```typescript
export const merchants = sqliteTable("merchants", {
	id: text("id").primaryKey().$defaultFn(() => uuidv7()),
	name: text("name").notNull(),
	deletedAt: text("deleted_at"),          // <-- ADD THIS
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});
```

**Step 5: Add `deleted_at` to cloud `outlets` table**

In `packages/database/src/api-schema.ts`, add `deleted_at` to the `outlets` table:

```typescript
export const outlets = sqliteTable("outlets", {
	// ... existing columns ...
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	deletedAt: text("deleted_at"),          // <-- ADD THIS
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});
```

**Step 6: Add `deleted_at` to cloud `registers` table**

In `packages/database/src/api-schema.ts`, add `deleted_at` to the `registers` table:

```typescript
export const registers = sqliteTable("registers", {
	// ... existing columns ...
	lastSeenAt: text("last_seen_at"),
	deletedAt: text("deleted_at"),          // <-- ADD THIS
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});
```

**Step 7: Run lint**

Run: `bun x ultracite check packages/database/src/api-schema.ts packages/database/src/local-schema.ts`
Expected: CLEAN

**Step 8: Commit**

```bash
git add packages/database/src/api-schema.ts packages/database/src/local-schema.ts
git commit -m "fix: align cloud and local schemas for sync compatibility"
```

---

## Task 2: Generate API database migration

The cloud DB (Turso/D1) needs migration for the new columns.

**Files:**
- Create: `apps/api/drizzle/XXXX_add_sync_columns.sql` (generated)

**Step 1: Generate migration**

Run: `cd apps/api && bunx drizzle-kit generate`
Expected: New SQL migration file

**Step 2: Verify migration contents**

The generated SQL should contain:
- `ALTER TABLE staff ADD deleted_at text;`
- `ALTER TABLE outlet_products ADD deleted_at text;`
- `ALTER TABLE merchants ADD deleted_at text;`
- `ALTER TABLE outlets ADD deleted_at text;`
- `ALTER TABLE registers ADD deleted_at text;`

**Step 3: Commit**

```bash
git add apps/api/drizzle/
git commit -m "migration: add deleted_at to staff, outlet_products, merchants, outlets, registers"
```

---

## Task 3: Generate local database migration

The local SQLite DB needs migration for `updated_at` on `order_items`.

**Files:**
- Create: `apps/pos-app/drizzle/0003_XXXX.sql` (generated)
- Modify: `apps/pos-app/src-tauri/src/drizzle_proxy.rs`

**Step 1: Generate migration**

Run: `cd apps/pos-app && bunx drizzle-kit generate`
Expected: New SQL migration file with `ALTER TABLE order_items ADD updated_at text NOT NULL DEFAULT ...;`

**Step 2: Register migration in Rust runner**

In `apps/pos-app/src-tauri/src/drizzle_proxy.rs`, add the new migration to the `MIGRATIONS` array:

```rust
const MIGRATIONS: &[(&str, &str)] = &[
    ("0001_medical_puppet_master", include_str!("../../drizzle/0001_medical_puppet_master.sql")),
    ("0002_peaceful_rhino", include_str!("../../drizzle/0002_peaceful_rhino.sql")),
    ("0003_NEW_NAME", include_str!("../../drizzle/0003_NEW_NAME.sql")),  // <-- ADD
];
```

**Step 3: Commit**

```bash
git add apps/pos-app/drizzle/ apps/pos-app/src-tauri/src/drizzle_proxy.rs
git commit -m "migration: add updated_at to order_items in local schema"
```

---

## Task 4: Fix push filter mismatch (merchant_id vs outlet_id)

The sync push binds `outlet_id` as the filter value, but categories/products/staff use `merchant_id` as the filter column. We need to resolve `merchant_id` from `outlet_id` first.

**Files:**
- Modify: `apps/pos-app/src-tauri/src/sync.rs`

**Step 1: Read the current `sync_push_inner` function**

In `apps/pos-app/src-tauri/src/sync.rs`, the `sync_push_inner` function at ~line 222 does:

```rust
for table in SYNC_TABLES {
    let rows = read_unsynced_rows(pool, table, outlet_id).await?;
    tables_json.insert(table.to_string(), Value::Array(rows));
}
```

**Step 2: Add merchant_id resolution**

Before the loop, resolve the merchant_id from the outlet_id:

```rust
// Resolve merchant_id from outlet_id for merchant-scoped tables
let merchant_id: Option<String> = {
    let query = "SELECT merchant_id FROM outlets WHERE id = ?1";
    let result = sqlx::query_scalar::<_, String>(query)
        .bind(outlet_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to resolve merchant_id: {}", e))?;
    result
};
```

**Step 3: Create a helper to get the correct filter value**

Add a new function after `get_table_filter_column`:

```rust
fn get_filter_value(table: &str, outlet_id: &str, merchant_id: &Option<String>) -> Result<&str, String> {
    match get_table_filter_column(table) {
        "merchant_id" => merchant_id.as_deref().ok_or("Cannot push merchant-scoped table: merchant_id not resolved"),
        _ => Ok(outlet_id),
    }
}
```

**Step 4: Update `sync_push_inner` to use the helper**

Replace the push loop:

```rust
for table in SYNC_TABLES {
    let filter_value = get_filter_value(table, outlet_id, &merchant_id)?;
    let rows = read_unsynced_rows_with_value(pool, table, filter_value).await?;
    tables_json.insert(table.to_string(), Value::Array(rows));
}
```

**Step 5: Create `read_unsynced_rows_with_value` function**

Duplicate `read_unsynced_rows` but take the filter value as a parameter instead of outlet_id:

```rust
async fn read_unsynced_rows_with_value(
    pool: &SqlitePool,
    table: &str,
    filter_value: &str,
) -> Result<Vec<Value>, String> {
    let filter_col = get_table_filter_column(table);
    let query = format!(
        "SELECT * FROM {} WHERE {} = ?1 AND is_synced = 0",
        table, filter_col
    );
    // ... same as read_unsynced_rows but binds filter_value instead of outlet_id
}
```

Or better: refactor `read_unsynced_rows` to accept the filter value directly:

```rust
async fn read_unsynced_rows(
    pool: &SqlitePool,
    table: &str,
    filter_value: &str,
) -> Result<Vec<Value>, String> {
    let filter_col = get_table_filter_column(table);
    let query = format!(
        "SELECT * FROM {} WHERE {} = ?1 AND is_synced = 0",
        table, filter_col
    );
    let rows = sqlx::query(&query)
        .bind(filter_value)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to read unsynced rows for {}: {}", table, e))?;
    // ... rest unchanged
}
```

**Step 6: Update ALL callers of `read_unsynced_rows`**

Every call currently passes `outlet_id`. Update them to pass the correct filter value:
- `sync_push_inner`: pass `get_filter_value(table, outlet_id, &merchant_id)?`
- `sync_pull_inner` GC: also needs merchant_id resolution

**Step 7: Also fix `mark_table_synced_tx` the same way**

It has the same issue — binds `outlet_id` but uses `merchant_id` for some tables.

**Step 8: Commit**

```bash
git add apps/pos-app/src-tauri/src/sync.rs
git commit -m "fix: resolve merchant_id from outlet_id for push/push filter columns"
```

---

## Task 5: Strip sync-only columns before push

The `is_synced` column exists only in the local DB. `SELECT *` includes it, and the server's `handlePush` tries to set it on cloud tables that don't have it.

**Files:**
- Modify: `apps/pos-app/src-tauri/src/sync.rs`
- Modify: `apps/api/src/lib/sync.ts`

**Step 1: Define sync-only columns in Rust**

Add a constant for columns that should be stripped before sending to server:

```rust
const LOCAL_ONLY_COLUMNS: &[&str] = &["is_synced"];
```

**Step 2: Strip columns in `read_unsynced_rows`**

After building the JSON object from each row, remove local-only columns:

```rust
for (idx, col) in row.columns().iter().enumerate() {
    let name = col.name().to_string();
    if LOCAL_ONLY_COLUMNS.contains(&name.as_str()) {
        continue;
    }
    // ... existing value extraction
}
```

**Step 3: Update server `handlePush` to strip unknown columns**

In `apps/api/src/lib/sync.ts`, the `upsertRow` or individual upsert functions receive raw row data. Add a helper to strip `is_synced`:

```typescript
function stripLocalOnlyColumns(row: Record<string, unknown>): Record<string, unknown> {
    const { is_synced: _, ...clean } = row;
    return clean;
}
```

Apply this in `handlePush` before passing rows to upsert functions.

**Step 4: Commit**

```bash
git add apps/pos-app/src-tauri/src/sync.rs apps/api/src/lib/sync.ts
git commit -m "fix: strip local-only columns (is_synced) before pushing to cloud"
```

---

## Task 6: Fix server `handlePush` for staff, outlet_products, and add merchants/outlets/registers

**Files:**
- Modify: `apps/api/src/lib/sync.ts`

**Step 1: Add push handlers for merchants, outlets, registers**

In `apps/api/src/lib/sync.ts` `handlePush()`, add cases:

```typescript
case "merchants": {
    await upsertMerchantRow(tx, merchants, row, merchantId);
    break;
}
case "outlets": {
    await upsertOutletRow(tx, outlets, row, outletId);
    break;
}
case "registers": {
    await upsertOutletRow(tx, registers, row, outletId);
    break;
}
```

**Step 2: Add pull handlers for merchants, outlets, registers**

In `handlePull()`, add cases:

```typescript
case "merchants": {
    result.merchants = await db
        .select()
        .from(merchants)
        .where(
            and(eq(merchants.id, merchantId), gt(merchants.updatedAt, since)),
        );
    break;
}
case "outlets": {
    result.outlets = await db
        .select()
        .from(outlets)
        .where(
            and(eq(outlets.merchantId, merchantId), gt(outlets.updatedAt, since)),
        );
    break;
}
case "registers": {
    result.registers = await db
        .select()
        .from(registers)
        .where(
            and(eq(registers.outletId, outletId), gt(registers.updatedAt, since)),
        );
    break;
}
```

**Step 3: Add merchants, outlets, registers to `ALL_SYNC_TABLE_NAMES`**

```typescript
export const ALL_SYNC_TABLE_NAMES = [
    "merchants",
    "outlets",
    "registers",
    "categories",
    "products",
    "outlet_products",
    "staff",
    "orders",
    "order_items",
];
```

**Step 4: Add `deleted_at` support to `upsertMerchantRow` and `upsertOutletRow`**

The existing upsert functions need to include `deleted_at` in their set operations since we added it in Task 1.

**Step 5: Write test for new push/pull handlers**

Add tests to `apps/api/src/__test__/sync.test.ts` for:
- Pushing a merchant row
- Pulling merchants for a given merchantId
- Pushing an outlet row
- Pulling outlets for a given merchantId
- Pushing a register row
- Pulling registers for a given outletId

**Step 6: Run tests**

Run: `cd apps/api && bun test`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add apps/api/src/lib/sync.ts apps/api/src/__test__/sync.test.ts
git commit -m "feat: add merchants, outlets, registers to sync push/pull"
```

---

## Task 7: Add merchants, outlets, registers to Rust SYNC_TABLES

**Files:**
- Modify: `apps/pos-app/src-tauri/src/sync.rs`

**Step 1: Update SYNC_TABLES**

```rust
const SYNC_TABLES: &[&str] = &[
    "merchants",
    "outlets",
    "registers",
    "categories",
    "products",
    "orders",
    "order_items",
    "outlet_products",
    "staff",
];
```

**Step 2: Update `get_table_filter_column`**

```rust
fn get_table_filter_column(table: &str) -> &'static str {
    match table {
        "merchants" => "id",              // merchants filtered by their own ID
        "categories" | "products" | "staff" => "merchant_id",
        _ => "outlet_id",
    }
}
```

**Step 3: Update `get_filter_value` (from Task 4) to handle merchants**

For `merchants`, the filter value is the merchant_id (which is the merchant's own ID). This needs to be resolved from the outlet_id. The resolution from Task 4 already does this.

**Step 4: Ensure GC works for all tables**

Verify all tables in SYNC_TABLES have both `deleted_at` and `is_synced` in the local schema:
- `merchants`: has `is_synced` but NOT `deleted_at` → need to add
- `outlets`: has `is_synced` but NOT `deleted_at` → need to add
- `registers`: has `is_synced` but NOT `deleted_at` → need to add

Add `deleted_at` to local schema for these three tables (same as Task 1 pattern).

**Step 5: Generate local migration for new columns**

Run: `cd apps/pos-app && bunx drizzle-kit generate`
Register in Rust runner.

**Step 6: Commit**

```bash
git add apps/pos-app/src-tauri/src/sync.rs packages/database/src/local-schema.ts apps/pos-app/drizzle/ apps/pos-app/src-tauri/src/drizzle_proxy.rs
git commit -m "feat: add merchants, outlets, registers to sync tables"
```

---

## Task 8: Fix serverWins handling

When the server rejects a row (server data is newer), the client should NOT mark it as synced. Instead, it should keep `is_synced = 0` so the row is pushed again later (or overwritten by the next pull).

**Files:**
- Modify: `apps/pos-app/src-tauri/src/sync.rs`

**Step 1: Parse serverWins from push response**

The server returns `serverWins: [{table, id, ...}]`. Parse this to get the set of IDs that the server rejected per table.

**Step 2: Only mark rows as synced if they weren't in serverWins**

Currently `mark_table_synced_tx` marks ALL rows for a table/outlet as synced. Change it to accept a list of synced row IDs:

```rust
async fn mark_rows_synced_tx(
    conn: &mut SqliteConnection,
    table: &str,
    filter_col: &str,
    filter_value: &str,
    synced_ids: &[String],
) -> Result<(), String> {
    for id in synced_ids {
        let query = format!(
            "UPDATE {} SET is_synced = 1 WHERE {} = ?1 AND id = ?2 AND is_synced = 0",
            table, filter_col
        );
        sqlx::query(&query)
            .bind(filter_value)
            .bind(id)
            .execute(conn)
            .await
            .map_err(|e| format!("Failed to mark synced for {}: {}", table, e))?;
    }
    Ok(())
}
```

**Step 3: Collect synced IDs from push**

After push, the server response includes the rows it accepted. The IDs of successfully pushed rows should be marked as synced. Rows in `serverWins` should NOT be marked.

**Step 4: Commit**

```bash
git add apps/pos-app/src-tauri/src/sync.rs
git commit -m "fix: only mark rows as synced when server accepts them"
```

---

## Task 9: Fix pull `since` timestamp to be per-table

Currently pull uses `orders` table's last sync timestamp for all tables. This can miss data.

**Files:**
- Modify: `apps/pos-app/src-tauri/src/sync.rs`

**Step 1: Change `sync_pull_inner` to use per-table timestamps**

Instead of:
```rust
let since = get_last_sync_at(pool, "orders", outlet_id)...
```

Build the `since` parameter per table in the pull URL, or make separate API calls per table. The simplest approach: use the minimum timestamp across all synced tables (conservative, may re-pull some data but won't miss any).

Actually, looking at the code, `set_last_sync_at_tx` sets ALL tables to the same `serverTime` after pull. So after the first successful sync, all tables converge. The issue is only on the very first sync. Use `MIN(since)` across all tables:

```rust
let mut earliest_since = "1970-01-01T00:00:00.000Z".to_string();
for table in SYNC_TABLES {
    if let Some(ts) = get_last_sync_at(pool, table, outlet_id).await.unwrap_or(None) {
        if ts < earliest_since {
            earliest_since = ts;
        }
    }
}
let since = earliest_since;
```

**Step 2: Commit**

```bash
git add apps/pos-app/src-tauri/src/sync.rs
git commit -m "fix: use earliest per-table timestamp for sync pull"
```

---

## Task 10: Fix `getStaff()` missing WHERE clause

**Files:**
- Modify: `apps/pos-app/src/db/staff.ts`

**Step 1: Fix the query to apply the conditions**

```typescript
export async function getStaff(): Promise<StaffMember[]> {
	const merchantId = currentMerchantId();
	const conditions = [];
	if (merchantId) conditions.push(eq(staff.merchantId, merchantId));

	const query = db.select().from(staff).orderBy(staff.name, staff.id);
	if (conditions.length > 0) {
		query.where(and(...conditions));
	}
	return query;
}
```

**Step 2: Run existing staff tests**

Run: `cd apps/pos-app && node_modules/.bin/vitest run src/db/__test__/staff.test.ts`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add apps/pos-app/src/db/staff.ts
git commit -m "fix: apply merchant filter in getStaff query"
```

---

## Task 11: Remove debug console.log statements

**Files:**
- Modify: `apps/api/src/routes/merchants.ts`
- Modify: `apps/api/src/routes/outlets.ts`
- Modify: `apps/pos-app/src/pages/cloud-login.tsx`
- Modify: `apps/pos-app/src/store/sync.ts`

**Step 1: Remove all `[API]` and `[APP]` console.log/error statements added during debugging**

**Step 2: Run lint**

Run: `bun x ultracite check apps/api/src/routes/merchants.ts apps/api/src/routes/outlets.ts apps/pos-app/src/pages/cloud-login.tsx apps/pos-app/src/store/sync.ts`
Expected: CLEAN

**Step 3: Commit**

```bash
git add apps/api/src/routes/merchants.ts apps/api/src/routes/outlets.ts apps/pos-app/src/pages/cloud-login.tsx apps/pos-app/src/store/sync.ts
git commit -m "chore: remove debug console.log statements"
```

---

## Task 12: Full regression test

**Step 1: Run API tests**

Run: `cd apps/api && bun test`
Expected: ALL PASS

**Step 2: Run pos-app tests**

Run: `cd apps/pos-app && node_modules/.bin/vitest run`
Expected: ALL relevant tests PASS

**Step 3: Run linter on all changed files**

Run: `bun x ultracite check`
Expected: No new errors on changed files

**Step 4: Manual verification checklist**

- [ ] New user registers → creates merchant + outlet + staff via onboarding → sync pushes to cloud
- [ ] Second device logs in → selects merchant → selects outlet → sync pulls staff → sees PIN login
- [ ] Staff soft-deleted on one device → sync pushes → other device sync pulls → staff gone
- [ ] Category created on one device → sync pushes → other device sync pulls → category appears
- [ ] Order created offline → reconnects → sync pushes → order appears on cloud
