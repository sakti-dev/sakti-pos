# Inventory

## Purpose

Stock tracking: on-hand quantities per outlet per target (product or ingredient), stocktake (stock opname) counting sessions, and goods-receipt receiving sessions.

## Requirements

### Requirement: Ingredient Catalog Entity

The system SHALL maintain an `ingredients` table as a synced business table (baresync between API and POS) scoped by `merchantId`, providing a bare catalog entity for F&B raw materials (e.g., "Bumbu", "Beras", cooking oil). This is NOT a recipe/BOM engine — it does not link ingredients to products with quantities or costing.

- The `ingredients` table SHALL carry: `id` (text PK, UUIDv7), `merchantId` (scope column), `name` (text notNull), `sku` (text nullable), `unit` (text notNull, default `'Pcs'`), `category` (text nullable), `isActive` (integer boolean notNull, default `true`), plus the standard sync columns.
- The table SHALL be included in baresync between API and POS.
- The client owns ingredient-row lifecycle via `writeTransaction` + `enqueueChange`, same as all synced tables.
- Soft deletes apply (set `deletedAt`, `isSynced = false`).

#### Scenario: New ingredient created during goods-receipt
- **WHEN** a user creates a new raw material ("Beras") inline from the goods-receipt picker
- **THEN** the client SHALL insert an `ingredients` row with `merchantId`, `name`, `unit`, `category`, `isActive = true`
- **AND** enqueue a sync change for server replication

#### Scenario: Ingredient listed for stocktake ingredient tab
- **WHEN** the stocktake form loads with `scope = 'ingredient'`
- **THEN** the system SHALL query `ingredients WHERE merchantId = ? AND isActive = 1` and present them for counting

#### Scenario: Soft-deleted ingredient excluded from active lists
- **WHEN** an ingredient is soft-deleted (`deletedAt` set, `isSynced = false`)
- **THEN** active-ingredient queries SHALL filter `deletedAt IS NULL`
- **AND** historical references (e.g., in `stocktake_lines.targetId`) SHALL remain resolvable by ID

### Requirement: Polymorphic Inventory Stocks

The system SHALL maintain an `inventory_stocks` table as a synced business table scoped by `outletId`, tracking current on-hand quantity per outlet per inventory target. Targets are polymorphic: `product` (retail items) or `ingredient` (F&B raw materials).

- The `inventory_stocks` table SHALL carry: `id` (text PK, **deterministic** — format `inv:{outletId}:{targetType}:{targetId}`, NOT UUIDv7), `outletId` (scope column), `targetType` (text enum `['product','ingredient']`, notNull), `targetId` (text notNull, soft-ref to `products.id` or `ingredients.id`), `onHandQty` (real notNull, default `0` — `real` to support fractional kg/liters for F&B), `lowStockThreshold` (real notNull, default `0`), plus the standard sync columns.
- The `id` SHALL be derived deterministically from the natural composite key `(outletId, targetType, targetId)` so that two devices creating the same logical stock card converge to one row via baresync's PK-based upsert (`INSERT ... ON CONFLICT(id) DO UPDATE`).
- The API side SHALL additionally enforce `UNIQUE(outletId, targetType, targetId)` as a documented natural-key constraint (redundant with the deterministic PK but explicit for server-side integrity).
- `targetId` is a soft-reference only (no hard FK locally); the application SHALL resolve it app-side and guard against orphaned targets (e.g., a soft-deleted product).

#### Scenario: Two devices initialize stock for the same product
- **WHEN** register A and register B in the same outlet both create an `inventory_stocks` row for product X while offline
- **THEN** both SHALL generate the same deterministic ID `inv:{outletId}:product:{productX_id}`
- **AND** after sync, baresync SHALL converge them to a single row via `ON CONFLICT(id) DO UPDATE`

#### Scenario: Low-stock threshold checked
- **WHEN** an `inventory_stocks` row has `onHandQty <= lowStockThreshold`
- **THEN** the application SHALL surface the item as low-stock in the UI

#### Scenario: Polymorphic target resolution
- **WHEN** the app resolves an `inventory_stocks.targetId` with `targetType = 'ingredient'`
- **THEN** the app SHALL look up the `ingredients` table by `id`
- **AND** SHALL NOT look up the `products` table

### Requirement: Stocktake Counting Sessions

The system SHALL support stocktake (stock opname) sessions via a header + lines structure: `stocktakes` (session header) and `stocktake_lines` (per-item counts). Both are synced business tables scoped by `outletId`.

- The `stocktakes` header SHALL carry: `id` (UUIDv7), `outletId` (scope), `staffId` (notNull, soft-ref to `staff` — NOT `userId`), `ref` (text notNull, e.g., `"OPNUM-001"`), `targetType` (text enum `['product','ingredient']`, notNull), `reason` (text notNull — the form requires a non-empty reason to confirm), `countedAt` (text notNull, ISO 8601 UTC), plus sync columns.
- The `stocktake_lines` table SHALL carry: `id` (UUIDv7), `stocktakeId` (notNull, soft-ref to `stocktakes`), `outletId` (scope, denormalized for sync filtering), `targetId` (notNull, polymorphic soft-ref), `systemQtyBefore` (real notNull — snapshot of system stock at count time), `countedQty` (real notNull), `varianceQty` (real notNull — `counted − system`, persisted for reporting), plus sync columns.
- A stocktake SHALL be created as a batch (one header + N lines) matching the form's `buildConfirmInput()` shape.

#### Scenario: Stocktake submitted as a batch
- **WHEN** the stocktake form confirms with `{ ref, reason, targetType, items[{targetId, countedQty}] }`
- **THEN** the client SHALL insert one `stocktakes` header row and N `stocktake_lines` rows
- **AND** each line SHALL snapshot `systemQtyBefore` from `inventory_stocks.onHandQty` at insert time
- **AND** each line SHALL compute and persist `varianceQty = countedQty − systemQtyBefore`

#### Scenario: Reason required to confirm
- **WHEN** the user attempts to confirm a stocktake with an empty `reason`
- **THEN** the form SHALL block confirmation (`canConfirm` is false)

#### Scenario: Stocktake history by outlet
- **WHEN** the inventory history view queries past stocktakes for an outlet
- **THEN** the system SHALL query `stocktakes WHERE outletId = ? ORDER BY countedAt DESC`
- **AND** SHALL join `stocktake_lines` by `stocktakeId` to render line-level variances

### Requirement: Goods-Receipt Receiving Sessions

The system SHALL support goods-receipt (receiving) sessions via a header + lines structure: `goods_receipts` (session header) and `goods_receipt_lines` (per-item receipts). Both are synced business tables scoped by `outletId`.

- The `goods_receipts` header SHALL carry: `id` (UUIDv7), `outletId` (scope), `staffId` (notNull, soft-ref to `staff`), `ref` (text notNull), `supplierName` (text nullable — no suppliers table yet), `note` (text nullable), `receivedAt` (text notNull, ISO 8601 UTC), plus sync columns.
- The `goods_receipt_lines` table SHALL carry: `id` (UUIDv7), `goodsReceiptId` (notNull, soft-ref to `goods_receipts`), `outletId` (scope, denormalized), `targetId` (notNull, polymorphic soft-ref), `receivedQty` (real notNull), `unitCostMinorUnits` (integer nullable — cost may be unknown), plus sync columns.
- A goods-receipt SHALL be created as a batch matching the form's `buildConfirmInput()` shape.

#### Scenario: Goods-receipt submitted as a batch
- **WHEN** the goods-receipt form confirms with `{ ref, supplier, note, items[{targetId, qty, costPrice}] }`
- **THEN** the client SHALL insert one `goods_receipts` header row and N `goods_receipt_lines` rows
- **AND** each line SHALL record `receivedQty` and `unitCostMinorUnits`

#### Scenario: Cost optional
- **WHEN** a goods-receipt line is submitted without a cost price
- **THEN** `unitCostMinorUnits` SHALL be null (cost may be unknown at receive time)

#### Scenario: Goods-receipt updates inventory
- **WHEN** a goods-receipt line for target X with `receivedQty = 5` is committed
- **THEN** the corresponding `inventory_stocks.onHandQty` SHALL be incremented by 5
- **AND** the increment SHALL go through a `writeTransaction` so it syncs
- (Note: the increment logic is application-layer concern, not enforced by the schema. The ledger row in `goods_receipt_lines` preserves the audit trail regardless of `onHandQty` convergence under server-wins.)

### Requirement: Stock Tracking Lifecycle

The system SHALL track stock per item per outlet using a row-exists convention: an item is stock-tracked at an outlet if and only if a stock balance row exists for that (outlet, item) pair. No product-level tracking flag exists.

#### Scenario: Tracking starts on first stock event

- **WHEN** a stock event (goods receipt line, stocktake line, or adjustment) is recorded for an item at an outlet with no existing balance row
- **THEN** a balance row is created with the event applied to a starting balance of zero
- **AND** the item is stock-tracked at that outlet from that point

#### Scenario: Explicit tracking start

- **WHEN** the user activates "Mulai Lacak Stok" for an item at an outlet
- **THEN** a balance row with zero on-hand quantity is created
- **AND** the item appears in stock lists and the stocktake picker at that outlet

#### Scenario: Tracking stops without losing history

- **WHEN** the user stops tracking an item at an outlet
- **THEN** the balance row is deleted and the item no longer appears in stock lists or decrements at checkout
- **AND** all historical event records (receipts, stocktakes, adjustments) for that item remain intact

#### Scenario: Ingredients are tracked on creation

- **WHEN** a new ingredient (bahan baku) is created
- **THEN** a zero-balance stock row for it is created at the active outlet in the same operation

### Requirement: Balance Update Rules

The system SHALL maintain on-hand quantity as the current truth per (outlet, item), updated transactionally with every stock event. Sales, goods receipts, and adjustments apply signed incremental deltas; stocktakes apply an absolute set to the counted quantity.

#### Scenario: Goods receipt increments

- **WHEN** a goods receipt line records received quantity N for a tracked item
- **THEN** the item's on-hand quantity increases by N in the same local transaction

#### Scenario: Adjustment applies signed delta

- **WHEN** an adjustment records qtyDelta D (e.g. −2 rusak) for a tracked item
- **THEN** the item's on-hand quantity changes by D in the same local transaction

#### Scenario: Stocktake sets absolute count

- **WHEN** a stocktake line records counted quantity C while the system held S
- **THEN** the on-hand quantity is set to C
- **AND** the line persists S (system before) and the variance (C − S)

#### Scenario: Concurrent cross-outlet overwrite

- **WHEN** two outlets concurrently write the same item's balance and sync later
- **THEN** last-write-wins on the balance row is accepted behavior
- **AND** the append-only event records at both outlets retain the full story

### Requirement: Reason-Tagged Corrections in the Opname Flow

The system SHALL provide a single stock-correction surface: the stock opname flow. Every opname SHALL require a reason chosen from a fixed vocabulary (Hitung fisik, Rusak, Hilang, Expired, Lainnya — Lainnya accepts a free-text detail) recorded on the opname record with staff attribution. There SHALL NOT be a separate penyesuaian (adjustment) entry point in the UI — simplicity over accounting separation is an explicit product decision.

#### Scenario: Recording waste through opname

- **WHEN** the user counts an item whose recorded stock was 8, enters 6, and saves the opname with reason Rusak
- **THEN** the opname line persists system-before 8, counted 6, variance −2 with the reason on the opname
- **AND** the item's balance is set to 6

#### Scenario: Reason is mandatory

- **WHEN** the user attempts to confirm an opname with variances without choosing a reason
- **THEN** confirmation is blocked until a reason is selected

#### Scenario: Legacy adjustment rows remain readable

- **WHEN** history contains rows previously recorded via the standalone penyesuaian flow
- **THEN** they remain visible in Riwayat with their reason tags (the `stock_adjustments` table stays in the schema, dormant)

### Requirement: Real Ingredient Catalog

The system SHALL persist ingredients (name, SKU, unit, category, active state) in the synced ingredient table, editable through the ingredient form, replacing the in-memory seed data.

#### Scenario: Create and edit bahan baku

- **WHEN** the user creates or edits an ingredient
- **THEN** the change persists locally, syncs to the server, and survives app restart

#### Scenario: Inline creation during receipt

- **WHEN** the user creates a new ingredient inline in the goods receipt flow
- **THEN** the ingredient is persisted and immediately usable as a receipt line item

### Requirement: Per-Item Low Stock Threshold

The system SHALL store a per-item low-stock threshold on the balance row (real, notNull, default `0`) and use it for stock badges, stat cards, and the dashboard's low-stock attention count. The product and ingredient forms expose the threshold through an explicit Tidak Terbatas / Terbatas stock-mode radio: selecting Terbatas starts tracking, seeds the initial balance, and stores the threshold; setting a stok minimum on an untracked item starts tracking first (row-exists convention).

#### Scenario: Threshold set on the form

- **WHEN** the user saves a product or ingredient with a stok minimum value
- **THEN** the threshold persists with the item's balance row and drives its low-stock badge

#### Scenario: Terbatas seeds the initial balance

- **WHEN** the user creates a product with stock mode Terbatas, stok saat ini 24, stok minimum 5
- **THEN** saving starts tracking, seeds the balance to 24, and stores the threshold 5

#### Scenario: Dashboard count reflects real thresholds

- **WHEN** any tracked item's on-hand quantity is at or below its threshold
- **THEN** the dashboard's "Stok menipis" count includes it

### Requirement: Stock History Feed

The system SHALL derive the Riwayat feed from the append-only event records: goods receipt lines, stocktake lines, adjustments, and product sales from completed orders — day-grouped, newest first, with the existing type labels (Penerimaan, Stock Opname, Penyesuaian, Penjualan).

#### Scenario: All four event kinds appear

- **WHEN** a day includes a receipt, a stocktake, an adjustment, and a sale
- **THEN** the history for that day lists all four entries, each with its type label, item, and quantity effect

#### Scenario: Ingredient consumption is not shown as sales

- **WHEN** an order completes
- **THEN** only product sales appear in the history feed; recipe-driven ingredient deduction produces no history entries (see the Recipes spec)
