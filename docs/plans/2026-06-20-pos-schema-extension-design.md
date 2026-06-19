# POS Schema Extension & Hardening — Design

**Date:** 2026-06-20
**Status:** Awaiting sign-off (no implementation code written)
**Scope:** Local-first baresync-paired schema, additive extension + read-path hardening
**Decisions locked:** Path B (includes bare `ingredients` catalog), relational modifiers, header+lines for stocktake/goods-receipt, `staffId` over `userId`, no CHECK constraints

---

## Context

The current paired schema (`packages/sync-contract/src/{api,local}-synced-schema.ts`) has 10 synced business tables covering core POS (org, catalog, sales). It is structurally sound but (a) lacks coverage for upcoming POS features (inventory, cash shifts, modifiers, tax/preferences), (b) has sparse read-path indexes on the queries the UI actually runs, and (c) carries one stale enum value.

This is an **additive extension**, not a redesign. The 10 synced tables are frozen in shape — we only add columns and indexes to them, never drop or rename. New feature domains land as new tables alongside.

## Hard baresync constraints (verified from `vendor/baresync/.../diagnostics.ts`)

Every synced table MUST have:
- Single text PK named `id`, UUIDv7 (`.$defaultFn(() => uuidv7())`)
- A scope column registered in `sync.config.ts`
- `...apiSyncColumns()` (API) / `...localSyncColumns()` (local) machinery
- Composite index `(scope, syncUpdatedAt)` on API; `isSynced` index on local
- **Mirrored definition in both schema files** (business columns compared by snake_case name)

Supported column types: `text`, `integer`, `real`, `blob`. (`real` is fine for fractional inventory.)

**Critical:** baresync does NOT inspect CHECK constraints. Under server-wins, a server-pushed row violating a local CHECK fails the INSERT silently and drops out of sync. → Use drizzle text enums, never `.check()`.

**Warning (not error):** `text({ mode: "json" })` triggers `SYNC_SCHEMA_JSON_ONLY_FIELD`. Avoided here by design choice (relational modifiers).

---

## Part 1 — Additive columns on frozen tables

### `merchants` (scope: `id`)
```
+ businessType  text enum ['fnb','retail','hybrid']  notNull default 'hybrid'
```
Onboarding collects `f&b`; stored as enum value `fnb` (the `&` is URL/JSON-unfriendly). Drives frontend feature flags (hide ingredient workflows for retail tenants).

### `outlets` (scope: `merchantId`)
```
+ useTax         integer boolean   notNull default false
+ taxPercentage  integer           notNull default 0      // whole percent, e.g. 11 = 11%
```
Per-outlet so multi-region merchants can adapt to local tax regulations. Integer (not real) — tax percentages are conventionally 0–100 whole numbers; avoids float drift.

---

## Part 2 — New synced tables (8 tables, Path B)

All carry full baresync machinery (UUIDv7 `id`, sync columns, scope index on API, `isSynced` index on local). Foreign keys are local-app soft-refs only — same pattern as the existing 10 tables (no `.references()` on local side, because server-wins overwrites can't tolerate hard FKs to unsynced/late-arriving rows).

### `ingredients` (scope: `merchantId`)
Bare catalog entity for F&B raw materials. NOT a recipe/BOM engine — that's deferred. Unblocks stocktake/goods-receipt ingredient tabs.
```
id          text PK uuidv7
merchantId  text notNull          (scope)
name        text notNull
sku         text
unit        text notNull default 'Pcs'
category    text
isActive    integer bool notNull default true
+ local/api sync columns
```
**Indexes:** API `(merchant_id, sync_updated_at)`; local `isSynced`. Read-path `(merchant_id, is_active)`.

### `inventory_stocks` (scope: `outletId`)
Current on-hand quantity per outlet per target. Polymorphic on `targetType` — now justified by two real targets (`product` + `ingredient`), not phantom.
```
id                  text PK uuidv7
outletId            text notNull          (scope)
targetType          text enum ['product','ingredient'] notNull
targetId            text notNull          (soft-ref to products.id or ingredients.id)
onHandQty           real notNull default 0      // real = fractional kg/liters for F&B
lowStockThreshold   real
+ local/api sync columns
```
**Indexes:** API `(outlet_id, sync_updated_at)`; local `isSynced`. Read-path `(outlet_id, target_type, target_id)` (covers the "show me this outlet's stock for this product" lookup). API adds `UNIQUE(outlet_id, target_type, target_id)`.

### `stocktakes` (scope: `outletId`) — header
Counting session. Matches the form's `buildConfirmInput()` batch shape (`{ ref, reason, items[] }`).
```
id          text PK uuidv7
outletId    text notNull          (scope)
staffId     text notNull          (soft-ref to staff — NOT userId; users is server-only)
ref         text notNull          (e.g. "OPNUM-001")
targetType  text enum ['product','ingredient'] notNull
reason      text notNull          (form requires non-empty reason to confirm)
countedAt   text notNull          (ISO 8601 UTC)
+ local/api sync columns
```
**Indexes:** API `(outlet_id, sync_updated_at)`; local `isSynced`. Read-path `(outlet_id, counted_at)` for history views.

### `stocktake_lines` (scope: `outletId`) — per-item counts
```
id                 text PK uuidv7
stocktakeId        text notNull          (soft-ref to stocktakes)
outletId           text notNull          (scope; denormalized for sync scoping)
targetId           text notNull          (soft-ref to product/ingredient)
systemQtyBefore    real notNull          (snapshot of system stock at count time)
countedQty         real notNull
varianceQty        real notNull          (counted − system; persisted for reporting)
+ local/api sync columns
```
**Indexes:** API `(outlet_id, sync_updated_at)`; local `isSynced`. Read-path `(stocktake_id)` for receipt-style rendering.

### `goods_receipts` (scope: `outletId`) — header
Receiving session. Matches form's `{ ref, supplier, note, items[] }`.
```
id              text PK uuidv7
outletId        text notNull          (scope)
staffId         text notNull
ref             text notNull
supplierName    text                  (no suppliers table yet — string for now)
note            text
receivedAt      text notNull          (ISO 8601 UTC)
+ local/api sync columns
```
**Indexes:** API `(outlet_id, sync_updated_at)`; local `isSynced`. Read-path `(outlet_id, received_at)`.

### `goods_receipt_lines` (scope: `outletId`) — per-item receipts
```
id                       text PK uuidv7
goodsReceiptId           text notNull          (soft-ref to goods_receipts)
outletId                 text notNull          (scope; denormalized)
targetId                 text notNull
receivedQty              real notNull
unitCostMinorUnits       integer               (nullable: cost may be unknown)
+ local/api sync columns
```
**Indexes:** API `(outlet_id, sync_updated_at)`; local `isSynced`. Read-path `(goods_receipt_id)`.

### `cash_shifts` (scope: `outletId`)
Drawer open/close boundaries. Drives the dashboard `StatusPlaque` `Buka`/`Tutup` pill.
```
id                          text PK uuidv7
outletId                    text notNull          (scope)
registerId                  text                  (nullable: shared-drawer outlets)
openedByStaffId             text notNull          (NOT userId — users is server-only)
openedAt                    text notNull          (ISO 8601 UTC)
closedAt                    text
initialFloatMinorUnits      integer notNull default 0
expectedCashMinorUnits      integer notNull default 0
actualCashMinorUnits        integer
differenceMinorUnits        integer               (actual − expected; short/over)
status                      text enum ['open','closed'] notNull
note                        text
+ local/api sync columns
```
**Indexes:** API `(outlet_id, sync_updated_at)`; local `isSynced`. Read-path `(outlet_id, status)` for the "is a shift open?" query.

### `order_item_modifiers` (scope: `outletId`)
Receipt snapshot for product modifiers (sizes, add-ons). Relational — fits existing `orderItems` snapshot pattern; no JSON, no baresync warning, queryable for analytics.
```
id                       text PK uuidv7
orderItemId              text notNull          (soft-ref to order_items)
outletId                 text notNull          (scope; denormalized)
modifierName             text notNull          (e.g. "Extra Shot")
modifierGroup            text                  (e.g. "Size", "Add-ons")
priceDeltaMinorUnits     integer notNull default 0
quantity                 integer notNull default 1
+ local/api sync columns
```
**Indexes:** API `(outlet_id, sync_updated_at)`; local `isSynced`. Read-path `(order_item_id)` for receipt rendering.

---

## Part 3 — Read-path indexes on existing 10 synced tables

Additive — both schema files, mirroring the existing `*_scope_sync_idx` / `*_is_synced_idx` pattern but targeting UI queries. No column changes.

| Table | New index | Serves |
|---|---|---|
| `products` | `(merchant_id, is_active, sort_order)` | Catalog grid render |
| `categories` | `(merchant_id, sort_order)` | Category nav |
| `orders` | `(outlet_id, created_at)` | Reports / history |
| `orderItems` | `(order_id)` | Receipt building (currently a full scan) |
| `staff` | `(merchant_id, is_active)` | PIN login user list |
| `outletProducts` | `(outlet_id, product_id)` | Outlet catalog availability |

Note: `orders.created_at` is provided by `localSyncColumns()` / `apiSyncColumns()` (already on every table) — no new column needed.

---

## Part 4 — `assets.status` enum fix (type-level only)

SQLite stores drizzle enums as `text` regardless of declared values, so removing `pending_upload` is a **type declaration change only — no SQL migration required**. The `pending_upload` value was removed from the live lifecycle in the spec-correction change (R5/R6); only the type declaration lingers.

- **API schema** (`api-synced-schema.ts`): `['pending','compressed','pending_upload','ready','failed']` → `['pending','compressed','ready','failed']`
- **Local schema** (`local-synced-schema.ts`): currently untyped `text("status").notNull().default("pending")` → add matching enum `['pending','compressed','ready','failed']` for type parity

Verify no runtime code writes the `pending_upload` string literal anywhere (`apps/api/src/assets/`, `apps/pos-app/src/lib/assets/`).

---

## Part 5 — Migration plan (4 artifacts, in execution order)

### Step 1 — Schema files (`packages/sync-contract/src/`)
- Edit `api-synced-schema.ts`: additive columns on `merchants`/`outlets`, 8 new tables (API flavor with `apiSyncColumns()` + `(scope, syncUpdatedAt)` indexes), fix `assets.status` enum, add read-path indexes.
- Edit `local-synced-schema.ts`: mirror exactly (local flavor with `localSyncColumns()` + `isSynced` indexes).

### Step 2 — Contract config + regen
- Edit `sync.config.ts`: register 8 new tables with their scope columns.
- Run `bun run generate:sync` → produces `generated/<date>/sync-contract.json` + table-order arrays. Verify no diagnostics errors (especially no `SYNC_SCHEMA_JSON_ONLY_FIELD`, no missing scope columns).

### Step 3 — API migration (`apps/api/drizzle/`)
- Run `drizzle-kit generate` → `apps/api/drizzle/0002_<auto_name>.sql`. Verify it contains: 2 `ALTER TABLE` (merchants/outlets), 8 `CREATE TABLE`, all sync + read-path + unique indexes, no drops/renames on existing tables.
- Run API test suite to confirm no regressions.

### Step 4 — Tauri local migration (`apps/pos-app/src-tauri/migrations/`)
- **Hand-write** `0001_<name>.sql` matching the existing `0000` style (snake_case, backticks, `--> statement-breakpoint` separators). Must mirror the API migration's structural changes exactly (column names, types, defaults). Local omits the `sync_updated_at` columns (those are API-side) but includes `is_synced`, `deleted_at`, `created_at`, `updated_at` from `localSyncColumns()`.
- Verify against `vendor/baresync` local-schema column expectations before committing.

---

## Part 6 — Verification gates (before claiming done)

1. `bun run generate:sync:check` / `doctor` — contract validates, no diagnostics
2. `bun run generate:sync` — generates cleanly
3. API: `tsc --noEmit` + existing vitest suite (58 tests baseline)
4. POS-app: `tsc --noEmit` + ultracite + vitest (76 tests baseline)
5. Manual diff: `0001` Tauri SQL column-for-column matches API `0002` SQL (modulo sync metadata columns)

---

## Explicitly out of scope (deferred)

- **Recipe/BOM engine** — linking ingredients to products with quantities and costing. Defer until F&B recipe workflow is scoped.
- **Suppliers table** — `goods_receipts.supplierName` is a string for now; promote when supplier management lands.
- **Refunds/returns** — not in this batch.
- **Customer/loyalty** — not in this batch.
- **Modifier catalog definitions** (the menu of available modifiers per product) — `order_item_modifiers` is a receipt *snapshot*. A separate `product_modifier_catalog` table (defining what modifiers a product offers) is a future catalog-extension change.
- **Tax line items on orders** — `useTax`/`taxPercentage` enable tax calculation but `orders`/`orderItems` are NOT extended with tax columns in this change. Tax application to order totals is a checkout-flow change, separate from this schema foundation.

---

## Risks

- **Local migration hand-written** — divergence from API migration is the highest risk. Mitigation: column-for-column diff in verification gate #5.
- **Polymorphic `inventory_stocks.targetType/targetId`** — no FK enforcement; app must guard against orphaned targets. Accepted (matches existing soft-ref pattern).
- **Soft-delete interaction with `cash_shifts.status`** — a soft-deleted `cash_shifts` row still has `status='open'`. App logic must filter `deletedAt IS NULL` when checking "is a shift open." This is the existing convention across all synced tables; document in code, not schema.
- **`order_item_modifiers` snapshot grows order payload** — one row per modifier per line item. Acceptable for POS receipt scale (single-digit modifiers per line). Revisit if bulk-order workflows emerge.

---

## File impact summary

| File | Change |
|---|---|
| `packages/sync-contract/src/api-synced-schema.ts` | +2 cols, +8 tables, assets enum fix, +read indexes |
| `packages/sync-contract/src/local-synced-schema.ts` | mirror of above (local flavor) |
| `packages/sync-contract/sync.config.ts` | +8 table registrations |
| `packages/sync-contract/generated/<date>/` | regenerated contract (auto) |
| `apps/api/drizzle/0002_*.sql` | generated by drizzle-kit |
| `apps/pos-app/src-tauri/migrations/0001_*.sql` | hand-written, mirrors 0002 structure |
| `apps/api/src/assets/*` | verify no `pending_upload` literal (likely no-op) |
| `apps/pos-app/src/lib/assets/*` | verify no `pending_upload` literal (likely no-op) |

No app code changes required in this change — the schema foundation lands first; feature wiring (UI consuming these tables) follows in separate changes per feature.
