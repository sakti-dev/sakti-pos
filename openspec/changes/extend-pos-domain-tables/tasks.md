## 1. Schema files — new tables (API side)

- [ ] 1.1 In `packages/sync-contract/src/api-synced-schema.ts`, add the `ingredients` table (scope `merchantId`): `id` UUIDv7, `merchantId`, `name`, `sku`, `unit` (default `'Pcs'`), `category`, `isActive` (default `true`), `...apiSyncColumns()`, `(merchant_id, sync_updated_at)` index, `(merchant_id, is_active)` read index.
- [ ] 1.2 Add the `inventory_stocks` table (scope `outletId`): `id` (plain `text` PK — NO `.$defaultFn`; app generates deterministic ID), `outletId`, `targetType` (text enum `['product','ingredient']`), `targetId`, `onHandQty` (real, default `0`), `lowStockThreshold` (real), `...apiSyncColumns()`, `(outlet_id, sync_updated_at)` index, `(outlet_id, target_type, target_id)` read index, `UNIQUE(outlet_id, target_type, target_id)`.
- [ ] 1.3 Add `stocktakes` (scope `outletId`): `id` UUIDv7, `outletId`, `staffId`, `ref`, `targetType` (enum), `reason`, `countedAt`, `...apiSyncColumns()`, sync index + `(outlet_id, counted_at)` read index.
- [ ] 1.4 Add `stocktake_lines` (scope `outletId`): `id` UUIDv7, `stocktakeId`, `outletId` (denormalized), `targetId`, `systemQtyBefore` (real), `countedQty` (real), `varianceQty` (real), `...apiSyncColumns()`, sync index + `(stocktake_id)` read index.
- [ ] 1.5 Add `goods_receipts` (scope `outletId`): `id` UUIDv7, `outletId`, `staffId`, `ref`, `supplierName`, `note`, `receivedAt`, `...apiSyncColumns()`, sync index + `(outlet_id, received_at)` read index.
- [ ] 1.6 Add `goods_receipt_lines` (scope `outletId`): `id` UUIDv7, `goodsReceiptId`, `outletId` (denormalized), `targetId`, `receivedQty` (real), `unitCostMinorUnits` (integer nullable), `...apiSyncColumns()`, sync index + `(goods_receipt_id)` read index.
- [ ] 1.7 Add `cash_shifts` (scope `outletId`): `id` UUIDv7, `outletId`, `registerId` (nullable), `openedByStaffId`, `openedAt`, `closedAt` (nullable), `initialFloatMinorUnits` (default `0`), `expectedCashMinorUnits` (default `0`), `actualCashMinorUnits` (nullable), `differenceMinorUnits` (nullable), `status` (text enum `['open','closed']`), `note`, `...apiSyncColumns()`, sync index + `(outlet_id, status)` read index.
- [ ] 1.8 Add `order_item_modifiers` (scope `outletId`): `id` UUIDv7, `orderItemId`, `outletId` (denormalized), `modifierName`, `modifierGroup` (nullable), `priceDeltaMinorUnits` (default `0`), `quantity` (default `1`), `...apiSyncColumns()`, sync index + `(order_item_id)` read index.

## 2. Schema files — mirror to local side

- [ ] 2.1 In `packages/sync-contract/src/local-synced-schema.ts`, mirror all 8 tables from section 1 with `localSyncColumns()` instead of `apiSyncColumns()`, `isSynced` indexes instead of `(scope, sync_updated_at)`, and the same read-path indexes. Same enums, same defaults, same column names/types. Local side has NO hard FKs (soft-refs only) — matches existing pattern. `inventory_stocks.id` stays a plain `text` PK (no `.$defaultFn`).

## 3. Contract config + regeneration

- [ ] 3.1 Edit `packages/sync-contract/sync.config.ts`: register 8 new tables with scope columns — `ingredients`→`merchantId`; `inventoryStocks`, `stocktakes`, `stocktakeLines`, `goodsReceipts`, `goodsReceiptLines`, `cashShifts`, `orderItemModifiers`→`outletId`.
- [ ] 3.2 Run `bun run generate:sync`. Verify clean output: no `SYNC_SCHEMA_JSON_ONLY_FIELD` warnings, no missing-scope errors, no paired-column drift. Inspect `generated/<date>/sync-contract.json` and the generated `SYNC_UPSERT_ORDER` — confirm parents precede children (`stocktakes` before `stocktake_lines`, `goods_receipts` before `goods_receipt_lines`, `order_items` before `order_item_modifiers`).

## 4. API migration

- [ ] 4.1 Run `drizzle-kit generate` in `apps/api`. Verify the generated `apps/api/drizzle/0003_*.sql` contains: 8 `CREATE TABLE`, all sync indexes, all read-path indexes, the `UNIQUE` constraint on `inventory_stocks`. Confirm NO statements touch the existing 10 synced tables (additive only).

## 5. Local (Tauri) migration

- [ ] 5.1 Hand-write `apps/pos-app/src-tauri/migrations/0002_*.sql` mirroring the API `0003` migration structurally: same 8 `CREATE TABLE`, same columns/types/defaults, same read-path indexes. Local side uses `is_synced` (from `localSyncColumns`), omits `sync_updated_at`. Follow existing `0000_slow_korg.sql` style (snake_case, backticks, `--> statement-breakpoint`).
- [ ] 5.2 Column-for-column diff: verify `0002_*.sql` and API `0003_*.sql` have identical structural changes (same tables, columns, types, defaults, read indexes), modulo the sync-metadata columns.

## 6. Verify

- [ ] 6.1 `bun run generate:sync:check` (or `doctor`) — contract validates, no diagnostics.
- [ ] 6.2 API: `tsc --noEmit` + vitest — expect no regressions.
- [ ] 6.3 POS-app: `tsc --noEmit` — expect zero errors.
- [ ] 6.4 POS-app: `ultracite check` — expect zero errors.
- [ ] 6.5 POS-app: vitest — expect no regressions (baseline 76 passing).
