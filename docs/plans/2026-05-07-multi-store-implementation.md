# Multi-Store Schema Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the flat User→Shop schema with Merchant→Outlet→Register hierarchy, split users/staff tables, add multi-merchant pivot, and use UUID v7 everywhere.

**Architecture:** Fresh start on both cloud (Turso) and local (Tauri SQLite) schemas. No production data to migrate. Delete old Drizzle migrations and regenerate from scratch. Update API sync logic, auth routes, and POS app DB queries.

**Tech Stack:** Drizzle ORM, SQLite/Turso, SolidJS (POS app), Elysia (API), Tauri (Rust), UUID v7

## Critical Implementation Notes

1. **Pairing endpoint rate limiting:** `POST /api/registers/pair` is public-facing and accepts a 6-digit code (1M combinations). Must use Cloudflare Workers rate limiting to restrict to 5 attempts per IP per hour. Without this, brute-force hijacking is trivial.
2. **Migration directory wipe:** Delete the entire `drizzle/` folder (not individual files) to avoid phantom caching. `rm -rf apps/api/drizzle` and `rm -rf apps/pos-app/drizzle`. Drizzle-kit recreates the folder on `generate`.
3. **Rust sync transactions:** All push payload upserts must be wrapped in a single SQLite transaction. If the device loses power mid-batch, the transaction rolls back to prevent partial/corrupted state.
4. **UUIDv7 runtime:** The `uuidv7` package generates IDs in JS runtime via `$defaultFn`, not by SQLite. Must verify the package is isomorphic (no Node.js `crypto` dependency) so it works inside Android WebView.

---

## Task 1: Install UUID v7 package

**Files:**
- Modify: `packages/database/package.json`

**Step 1: Install uuidv7**

```bash
cd packages/database && bun add uuidv7
```

**Step 2: Verify install**

Run: `cat packages/database/package.json | grep uuidv7`
Expected: `"uuidv7": "^..."` in dependencies

---

## Task 2: Rewrite API schema (cloud/Turso)

**Files:**
- Rewrite: `packages/database/src/api-schema.ts`

**Step 1: Write the complete new API schema**

```typescript
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const merchants = sqliteTable("merchants", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const userMerchants = sqliteTable("user_merchants", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references((): SQLiteColumn => users.id),
	merchantId: text("merchant_id")
		.notNull()
		.references((): SQLiteColumn => merchants.id),
	role: text("role", { enum: ["owner", "manager"] }).notNull(),
	joinedAt: text("joined_at").notNull(),
});

export const users = sqliteTable("users", {
	id: text("id").primaryKey(),
	email: text("email").notNull().unique(),
	name: text("name").notNull(),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	passwordHash: text("password_hash"),
	googleId: text("google_id"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const userSessions = sqliteTable("user_sessions", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	expiresAt: integer("expires_at").notNull(),
});

export const outlets = sqliteTable("outlets", {
	id: text("id").primaryKey(),
	merchantId: text("merchant_id")
		.notNull()
		.references(() => merchants.id),
	name: text("name").notNull(),
	address: text("address"),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const registers = sqliteTable("registers", {
	id: text("id").primaryKey(),
	outletId: text("outlet_id")
		.notNull()
		.references(() => outlets.id),
	name: text("name").notNull(),
	shortId: text("short_id").notNull().unique(),
	pairingCode: text("pairing_code").unique(),
	pairingExpiresAt: text("pairing_expires_at"),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	lastSeenAt: text("last_seen_at"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const staff = sqliteTable("staff", {
	id: text("id").primaryKey(),
	merchantId: text("merchant_id")
		.notNull()
		.references(() => merchants.id),
	outletId: text("outlet_id").references(() => outlets.id),
	name: text("name").notNull(),
	pin: text("pin"),
	role: text("role", { enum: ["cashier", "manager"] }).notNull(),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const categories = sqliteTable("categories", {
	id: text("id").primaryKey(),
	merchantId: text("merchant_id")
		.notNull()
		.references(() => merchants.id),
	name: text("name").notNull(),
	sortOrder: integer("sort_order").notNull().default(0),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
	deletedAt: text("deleted_at"),
});

export const products = sqliteTable("products", {
	id: text("id").primaryKey(),
	merchantId: text("merchant_id")
		.notNull()
		.references(() => merchants.id),
	categoryId: text("category_id").references(() => categories.id),
	name: text("name").notNull(),
	price: integer("price").notNull(),
	imageUrl: text("image_url"),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	sortOrder: integer("sort_order").notNull().default(0),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
	deletedAt: text("deleted_at"),
});

export const outletProducts = sqliteTable("outlet_products", {
	id: text("id").primaryKey(),
	outletId: text("outlet_id")
		.notNull()
		.references(() => outlets.id),
	productId: text("product_id")
		.notNull()
		.references(() => products.id),
	price: integer("price"),
	isAvailable: integer("is_available", { mode: "boolean" })
		.notNull()
		.default(true),
	sortOrder: integer("sort_order"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const orders = sqliteTable("orders", {
	id: text("id").primaryKey(),
	outletId: text("outlet_id")
		.notNull()
		.references(() => outlets.id),
	registerId: text("register_id").references(() => registers.id),
	staffId: text("staff_id").references(() => staff.id),
	orderNumber: text("order_number").notNull().unique(),
	total: integer("total").notNull(),
	paymentMethod: text("payment_method", { enum: ["cash", "qris"] }).notNull(),
	amountPaid: integer("amount_paid"),
	changeAmount: integer("change_amount"),
	status: text("status", { enum: ["completed", "cancelled"] }).notNull(),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
	deletedAt: text("deleted_at"),
});

export const orderItems = sqliteTable("order_items", {
	id: text("id").primaryKey(),
	orderId: text("order_id")
		.references(() => orders.id)
		.notNull(),
	outletId: text("outlet_id")
		.notNull()
		.references(() => outlets.id),
	productId: text("product_id").references(() => products.id),
	productName: text("product_name").notNull(),
	quantity: integer("quantity").notNull(),
	unitPrice: integer("unit_price").notNull(),
	originalPrice: integer("original_price"),
	subtotal: integer("subtotal").notNull(),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at"),
	deletedAt: text("deleted_at"),
});
```

**Step 2: Verify TypeScript compiles**

Run: `cd packages/database && bunx tsc --noEmit`
Expected: No errors

---

## Task 3: Rewrite local schema (Tauri SQLite)

**Files:**
- Rewrite: `packages/database/src/local-schema.ts`

**Step 1: Write the complete new local schema**

The local schema uses **UUID v7 text PKs** (same as server — no cloudId mapping needed). Adds `isSynced` boolean for dirty tracking. Scoped to a single outlet.

```typescript
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const merchants = sqliteTable("merchants", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text("updated_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const outlets = sqliteTable("outlets", {
	id: text("id").primaryKey(),
	merchantId: text("merchant_id").notNull(),
	name: text("name").notNull(),
	address: text("address"),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text("updated_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const registers = sqliteTable("registers", {
	id: text("id").primaryKey(),
	outletId: text("outlet_id").notNull(),
	name: text("name").notNull(),
	shortId: text("short_id").notNull(),
	pairingCode: text("pairing_code"),
	pairingExpiresAt: text("pairing_expires_at"),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	lastSeenAt: text("last_seen_at"),
	isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text("updated_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const staff = sqliteTable("staff", {
	id: text("id").primaryKey(),
	merchantId: text("merchant_id").notNull(),
	outletId: text("outlet_id"),
	name: text("name").notNull(),
	pin: text("pin"),
	role: text("role", { enum: ["cashier", "manager"] }).notNull(),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text("updated_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const syncMeta = sqliteTable("sync_meta", {
	tableName: text("table_name").notNull(),
	outletId: text("outlet_id").notNull(),
	lastSyncAt: text("last_sync_at").notNull(),
});

export const categories = sqliteTable("categories", {
	id: text("id").primaryKey(),
	merchantId: text("merchant_id").notNull(),
	name: text("name").notNull(),
	sortOrder: integer("sort_order").notNull().default(0),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	deletedAt: text("deleted_at"),
	isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text("updated_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const products = sqliteTable("products", {
	id: text("id").primaryKey(),
	merchantId: text("merchant_id").notNull(),
	categoryId: text("category_id"),
	name: text("name").notNull(),
	price: integer("price").notNull(),
	imageUrl: text("image_url"),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	sortOrder: integer("sort_order").notNull().default(0),
	deletedAt: text("deleted_at"),
	isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text("updated_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const outletProducts = sqliteTable("outlet_products", {
	id: text("id").primaryKey(),
	outletId: text("outlet_id").notNull(),
	productId: text("product_id").notNull(),
	price: integer("price"),
	isAvailable: integer("is_available", { mode: "boolean" })
		.notNull()
		.default(true),
	sortOrder: integer("sort_order"),
	isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text("updated_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const orders = sqliteTable("orders", {
	id: text("id").primaryKey(),
	outletId: text("outlet_id").notNull(),
	registerId: text("register_id"),
	staffId: text("staff_id"),
	orderNumber: text("order_number").notNull().unique(),
	total: integer("total").notNull(),
	paymentMethod: text("payment_method", { enum: ["cash", "qris"] }).notNull(),
	amountPaid: integer("amount_paid"),
	changeAmount: integer("change_amount"),
	status: text("status", { enum: ["completed", "cancelled"] }).notNull(),
	deletedAt: text("deleted_at"),
	isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text("updated_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const orderItems = sqliteTable("order_items", {
	id: text("id").primaryKey(),
	orderId: text("order_id").notNull(),
	outletId: text("outlet_id").notNull(),
	productId: text("product_id"),
	productName: text("product_name").notNull(),
	quantity: integer("quantity").notNull(),
	unitPrice: integer("unit_price").notNull(),
	originalPrice: integer("original_price"),
	subtotal: integer("subtotal").notNull(),
	deletedAt: text("deleted_at"),
	isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
	createdAt: text("created_at")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});
```

**Step 2: Verify TypeScript compiles**

Run: `cd packages/database && bunx tsc --noEmit`
Expected: No errors

---

## Task 4: Delete old API migrations and regenerate

**Files:**
- Delete: `apps/api/drizzle/0000_equal_korvac.sql`
- Delete: `apps/api/drizzle/0001_violet_jack_flag.sql`
- Delete: `apps/api/drizzle/0002_goofy_sway.sql`
- Delete: `apps/api/drizzle/0003_dazzling_metal_master.sql`
- Delete: `apps/api/drizzle/0004_old_magma.sql`
- Delete: `apps/api/drizzle/meta/_journal.json`
- Create: `apps/api/drizzle/0000_*.sql` (auto-generated by drizzle-kit)

**Step 1: Delete old migrations**

```bash
rm -rf apps/api/drizzle
```

**Step 2: Regenerate**

```bash
cd apps/api && bunx drizzle-kit generate
```

**Step 3: Verify**

Run: `ls apps/api/drizzle/*.sql`
Expected: One new `0000_*.sql` file with all CREATE TABLE statements for merchants, user_merchants, users, user_sessions, outlets, registers, staff, categories, products, outlet_products, orders, order_items.

---

## Task 5: Delete old POS migrations and regenerate

**Files:**
- Delete: `apps/pos-app/drizzle/0000_woozy_hulk.sql`
- Delete: `apps/pos-app/drizzle/0001_silky_genesis.sql`
- Delete: `apps/pos-app/drizzle/0002_glorious_major_mapleleaf.sql`
- Delete: `apps/pos-app/drizzle/0003_right_black_widow.sql`
- Delete: `apps/pos-app/drizzle/meta/_journal.json`
- Create: `apps/pos-app/drizzle/0000_*.sql` (auto-generated by drizzle-kit)

**Step 1: Delete old migrations**

```bash
rm -rf apps/pos-app/drizzle
```

**Step 2: Regenerate**

```bash
cd apps/pos-app && bunx drizzle-kit generate
```

**Step 3: Verify**

Run: `ls apps/pos-app/drizzle/*.sql`
Expected: One new `0000_*.sql` file.

---

## Task 6: Update Tauri migration registration

**Files:**
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

**Step 1: Replace migration list with single fresh migration**

The old `lib.rs` has 4 migrations (versions 1-4). Replace with a single migration for the new schema. The `include_str!` path will point to the new `0000_*.sql` file — check the actual generated filename from Task 5 and use it.

```rust
mod drizzle_proxy;
mod sync;

use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "multi_store_schema",
            sql: include_str!("../../drizzle/0000_*.sql"), // use actual filename
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:sakti-pos.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            drizzle_proxy::run_sql,
            drizzle_proxy::run_sql_batch,
            drizzle_proxy::get_db_info,
            sync::sync_push,
            sync::sync_pull,
            sync::run_garbage_collection,
            sync::sync_now
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Important:** Existing users will have a `sakti-pos.db` with the old schema. Since this is development-only (no production data), document that users must delete their local DB file to get the new schema. Alternatively, bump the migration version high enough (e.g. version 5) to ensure it runs after the old migrations.

Actually — the simplest approach: keep version as 1 but note that the DB needs to be wiped. If the old DB exists with different tables, the migration will fail. For development, this is acceptable.

---

## Task 7: Update API sync logic for new schema

**Files:**
- Rewrite: `apps/api/src/lib/sync.ts`

**Step 1: Rewrite sync.ts for outlet-scoped sync**

The sync is now scoped to an **outlet** (not shop). The `verifyShopAccess` becomes `verifyOutletAccess` — checks that the requesting user belongs to the merchant that owns this outlet.

Key changes:
- Import new table names (outlets, staff, outletProducts instead of shops, users, etc.)
- `verifyOutletAccess(userId, outletId)` — joins `user_merchants` to check access
- `handlePush(outletId, data)` — upserts with `outletId` instead of `shopId`
- `handlePull(outletId, tables, since)` — queries scoped to `outletId`
- Products/categories are merchant-level but pulled via `merchantId` derived from the outlet
- `ALL_SYNC_TABLE_NAMES` includes new tables: `outlet_products`, `staff`
- `outlet_products` push/pull needs its own case

---

## Task 8: Update API auth routes

**Files:**
- Modify: `apps/api/src/routes/auth.ts`

**Step 1: Update register endpoint**

After user registration, no longer auto-create a shop. Just create the user. The onboarding wizard (frontend) handles merchant + outlet creation.

- Remove `shopId` references
- User starts with no merchant association

**Step 2: Update login endpoint**

Same — just authenticate, return user. Frontend merchant-picker handles the rest.

**Step 3: Update session endpoint**

Return user + their merchants (via `user_merchants` join).

**Step 4: Update Google OAuth callback**

Same pattern — create user if new, return HTML success page. No shop creation.

---

## Task 9: Update API shops → outlets/merchants routes

**Files:**
- Delete: `apps/api/src/routes/shops.ts`
- Create: `apps/api/src/routes/merchants.ts`
- Create: `apps/api/src/routes/outlets.ts`
- Create: `apps/api/src/routes/registers.ts`

**Step 1: Create merchants routes**

- `POST /api/merchants` — Create merchant + add user to `user_merchants` as "owner"
- `GET /api/merchants` — List user's merchants (via `user_merchants` join)
- `GET /api/merchants/:id` — Get single merchant (verify access via `user_merchants`)

**Step 2: Create outlets routes**

- `POST /api/merchants/:merchantId/outlets` — Create outlet under merchant (verify user is owner/manager)
- `GET /api/merchants/:merchantId/outlets` — List outlets for merchant
- `PATCH /api/outlets/:id` — Update outlet

**Step 3: Create registers routes**

- `POST /api/outlets/:outletId/registers` — Create register, generate `shortId` + `pairingCode` (6-digit random), set `pairingExpiresAt` = now + 24h
- `POST /api/registers/pair` — Public endpoint. Accepts `pairingCode`, validates (exists, not expired, not used), marks as paired (clears pairingCode or sets `isActive`), returns register + outlet info. **MUST have rate limiting: 5 attempts per IP per hour via Cloudflare Workers rate limiting.**
- `GET /api/outlets/:outletId/registers` — List registers for outlet
- `DELETE /api/registers/:id` — Revoke/deactivate register

---

## Task 10: Update API sync routes

**Files:**
- Modify: `apps/api/src/routes/sync.ts`

**Step 1: Update sync routes to use outletId**

Change `shopId` params to `outletId`. The auth middleware extracts user from session, then `verifyOutletAccess` checks the user has access to the merchant that owns this outlet.

---

## Task 11: Update API tests

**Files:**
- Modify: `apps/api/src/__test__/sync.test.ts`
- Modify: `apps/api/src/__test__/shops.test.ts` → rename to `outlets.test.ts`
- Add: `apps/api/src/__test__/merchants.test.ts`
- Add: `apps/api/src/__test__/registers.test.ts`

**Step 1: Update sync tests**

- Replace `shopId` with `outletId` in all test cases
- Add test for `outlet_products` push/pull
- Add test for merchant-level category/product pull (not outlet-scoped)

**Step 2: Add merchant tests**

- Create merchant → verify `user_merchants` row created with "owner" role
- List merchants → only returns user's merchants

**Step 3: Add register tests**

- Create register → verify pairingCode is 6 digits, expiresAt is 24h from now
- Pair with valid code → returns register + outlet info
- Pair with expired code → returns error
- Pair with already-used code → returns error

---

## Task 12: Update POS app DB queries

**Files:**
- Rewrite: `apps/pos-app/src/db/menu.ts`
- Rewrite: `apps/pos-app/src/db/orders.ts`
- Rewrite: `apps/pos-app/src/db/dashboard.ts`
- Modify: `apps/pos-app/src/lib/shop.ts` → rename to `apps/pos-app/src/lib/outlet.ts`

**Step 1: Update shop.ts → outlet.ts**

- Rename `currentShopId()` to `currentOutletId()`
- Add `currentMerchantId()` signal
- Add `currentRegisterId()` signal
- Update localStorage keys

**Step 2: Update menu.ts**

- Replace `shopId` filters with `merchantId` for categories/products (merchant-level)
- Add `outletId` filter for `outlet_products`
- Update `isSynced` logic

**Step 3: Update orders.ts**

- Replace `shopId` with `outletId` in all queries
- Replace `userId` with `staffId` in orders
- Update `createOrder` raw SQL to use `outletId`, `registerId`, `staffId`
- Generate order numbers as `{registerShortId}-{seq}`

**Step 4: Update dashboard.ts**

- Replace `shopId` with `outletId` in all queries

---

## Task 13: Update POS app sync module

**Files:**
- Modify: `apps/pos-app/src/lib/sync.ts`
- Modify: `apps/pos-app/src-tauri/src/sync.rs`

**Step 1: Update frontend sync.ts**

- Replace `shopId` references with `outletId`
- Add `merchantId` context
- Update `syncMeta` to use `outletId` instead of `shopId`

**Step 2: Update Rust sync.rs**

- Update `upsert_row` SQL — `outletId` replaces `shopId`, remove `cloud_id` column references
- Since IDs are now UUID v7 (same on server and client), the `ON CONFLICT(id)` pattern works directly — no need for `ON CONFLICT(cloud_id)`
- Add outlet_products, staff, registers, outlets, merchants table handling

---

## Task 14: Update POS app auth screens

**Files:**
- Modify: `apps/pos-app/src/pages/cloud-login.tsx`
- Modify: `apps/pos-app/src/pages/login.tsx`
- Create: `apps/pos-app/src/pages/device-pair.tsx`

**Step 1: Update cloud-login.tsx**

- After auth, show **merchant picker** instead of shop picker
- If no merchants, redirect to onboarding wizard
- Store selected `merchantId` and `outletId` in localStorage

**Step 2: Update login.tsx (local PIN)**

- Load staff from local DB instead of local users table
- Staff table uses UUID v7 PKs

**Step 3: Create device-pair.tsx**

- Simple 6-digit code input screen
- On submit: call `POST /api/registers/pair` with the code
- On success: store `registerId`, `outletId`, `merchantId` locally, trigger initial sync, redirect to `/login`

---

## Task 15: Update POS app route structure

**Files:**
- Modify: `apps/pos-app/src/App.tsx`
- Modify: `apps/pos-app/src/lib/auth-provider.ts`

**Step 1: Add new routes**

Add routes for:
- `/device-pair` — DevicePair component
- `/onboarding/merchant` — Create merchant step
- `/onboarding/outlet` — Create first outlet step

**Step 2: Update route guards**

- `RequireAuth` checks if device is paired (has `registerId` in localStorage)
- Owner-only routes check `userMerchants` role

---

## Task 16: Run all tests and verify

**Step 1: Run API tests**

```bash
cd apps/api && bun test
```

Expected: All tests pass

**Step 2: Run POS app tests**

```bash
cd apps/pos-app && bun run test
```

Expected: All tests pass

**Step 3: Run linter**

```bash
bun x ultracite check
```

Expected: No issues

---

## Execution Order

Tasks 1-6 are foundational (schema + migrations) and must be done sequentially.
Tasks 7-11 (API layer) can be done after Task 4.
Tasks 12-15 (POS app layer) can be done after Task 5.
Task 16 is the final verification.
