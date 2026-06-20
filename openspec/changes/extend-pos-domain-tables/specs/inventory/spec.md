## ADDED Requirements

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

- The `inventory_stocks` table SHALL carry: `id` (text PK, **deterministic** — format `inv:{outletId}:{targetType}:{targetId}`, NOT UUIDv7), `outletId` (scope column), `targetType` (text enum `['product','ingredient']`, notNull), `targetId` (text notNull, soft-ref to `products.id` or `ingredients.id`), `onHandQty` (real notNull, default `0` — `real` to support fractional kg/liters for F&B), `lowStockThreshold` (real nullable), plus the standard sync columns.
- The `id` SHALL be derived deterministically from the natural composite key `(outletId, targetType, targetId)` so that two devices creating the same logical stock card converge to one row via baresync's PK-based upsert (`INSERT ... ON CONFLICT(id) DO UPDATE`).
- The API side SHALL additionally enforce `UNIQUE(outletId, targetType, targetId)` as a documented natural-key constraint (redundant with the deterministic PK but explicit for server-side integrity).
- `targetId` is a soft-reference only (no hard FK locally); the application SHALL resolve it app-side and guard against orphaned targets (e.g., a soft-deleted product).

#### Scenario: Two devices initialize stock for the same product
- **WHEN** register A and register B in the same outlet both create an `inventory_stocks` row for product X while offline
- **THEN** both SHALL generate the same deterministic ID `inv:{outletId}:product:{productX_id}`
- **AND** after sync, baresync SHALL converge them to a single row via `ON CONFLICT(id) DO UPDATE`

#### Scenario: Low-stock threshold checked
- **WHEN** an `inventory_stocks` row has `onHandQty < lowStockThreshold` (and `lowStockThreshold` is not null)
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
