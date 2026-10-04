# Proposal

## Why

The entire inventory section (Retail tab, Bahan Baku tab, Penerimaan/goods receipt, Stock Opname, Penyesuaian/adjustment, Riwayat/history) runs on in-memory solid-js stores seeded with mock data (`lib/data/catalog.ts`, `components/lib/store.ts`, `components/lib/ingredients.ts`). The synced tables for most of this already exist (`ingredients`, `inventory_stocks`, `stocktakes`, `stocktake_lines`, `goods_receipts`, `goods_receipt_lines`) but have zero writers and zero readers — the only real consumer is the dashboard's "Stok menipis" count, reading an eternally-empty table. Stock answers are fake today: no persisted counts, no audit trail, no low-stock signal that means anything.

## What Changes

- **Row-exists tracking convention**: an `inventory_stocks` row for `(outletId, targetType, targetId)` means the item is stock-tracked at that outlet. No `track_stock` flag, no products migration. Untracked items are invisible to inventory UI and are a safe no-op at checkout. Tracked-ness starts on the item's first stock event (receipt/opname), or explicitly via a "Mulai Lacak Stok" action; ingredients become tracked on creation (creating a bahan baku seeds a 0-balance row).
- **New synced table `stock_adjustments`**: the missing third event type — manual corrections (rusak/hilang/expired/hadiah/sample/lainnya) with signed real `qty_delta`, staff attribution. Paired schema + `0005` migration + contract regen + api registry entry, same dance as modifier groups.
- **Balance-update rule (LWW accepted)**: sales/receipts/adjustments apply incremental deltas (`on_hand_qty ± delta`); stock opname applies an absolute set (`= counted_qty`). Concurrent cross-outlet balance overwrites may lose a delta — accepted: single register per outlet in practice, append-only events preserve the story, opname self-heals.
- **DB layer**: `db/inventory.ts` (stock reads, `upsertStockBalance`-style tx helpers, tracked-ness queries) and `db/ingredients.ts` (CRUD, modifier-groups pattern) with unit tests.
- **Screen transplants**: Retail tab, Bahan Baku tab, Penerimaan flow (incl. inline bahan creation), Stock Opname flow, and the Penyesuaian flow all read/write the real tables inside `writeTransaction` + `enqueueChange`. Mock stores and mock products deleted.
- **Threshold field**: per-item `low_stock_threshold` (column already exists, nullable) gets a writer — product/bahan forms — and drives badges, stat cards, and the dashboard count.
- **Checkout decrement**: `persistOrder` decrements product stock rows that exist (guarded UPDATE, no negative for untracked); modifiers don't affect qty; ingredient BOM deduction stays deferred by spec.
- **Riwayat unified feed**: history derives from four event sources — `goods_receipt_lines` (+ supplier ref), `stocktake_lines` (variance), `stock_adjustments` (reason), and `order_items` of completed orders (🛒 Penjualan) — day-grouped like the current UI.

## Capabilities

### New Capabilities

- `inventory` — stock tracking model (row-exists convention, balance-update rules, adjustment events), ingredient catalog management, tracked-ness lifecycle, per-item low-stock thresholds.

### Modified Capabilities

- `menu` (R17/R18 unaffected; no changes) — not modified.
- `orders` — checkout now decrements product stock balances for tracked items (extends the offline-first order persistence requirement).
- `ingredients` — bare catalog requirement superseded: ingredients gain real CRUD persistence, stock balances, and threshold; recipe/BOM linkage remains explicitly deferred.

## Impact

- **Schema/migrations**: new `stock_adjustments` table on both paired schemas; migration `0005_stock_adjustments.sql` both sides (Tauri + api/drizzle) + meta snapshots/journals; `bun run generate:sync` contract regen + Rust repoint + api registry (order after `goods_receipt_lines`, before `cash_shifts`) + registry order test; dev Turso migration. Prod Turso deferred to the deploy session (bundle with pending `0004`).
- **Code**: inventory pages/components (delete `components/lib/store.ts`, `lib/ingredients.ts` mock, mock `products` usage), new `db/inventory.ts` + `db/ingredients.ts`, `sale-session.ts`/`db/orders.ts` checkout path, product/ingredient forms.
- **Risk**: checkout is the money path — decrement is additive and guarded (row-exists), cannot block or fail a sale. History feed is derived read-only.
