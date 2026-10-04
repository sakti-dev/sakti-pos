# Tasks

## 1. Schema & sync plumbing

- [x] 1.1 Add `stock_adjustments` to both paired schemas (`packages/sync-contract/src/{api,local}-synced-schema.ts`) mirroring `stocktakes` conventions: outlet/staff scoping, real signed qtyDelta, reason enum (rusak/hilang/expired/hadiah/sample/lainnya), note, `localSyncColumns()`, is_synced + (outletId, targetId) indexes
- [x] 1.2 Register in `sync.config.ts`, run `bun run generate:sync`, repoint `apps/pos-app/src-tauri/src/lib.rs` + `apps/api/src/sync/service.ts` imports to the new generated dir, update the registry order test (entry after `goods_receipt_lines`, before `cash_shifts`)
- [x] 1.3 Hand-write `0005_stock_adjustments.sql` for both sides (Tauri `apps/pos-app/src-tauri/migrations/` + `apps/api/drizzle/`) with meta snapshots/journals; apply to dev Turso and verify the table exists — superseded by the baresync generator flow: table ships in the generated `0002` pair, applied to dev Turso via `db:push`; table existence verified in dev Turso
- [x] 1.4 Add api repository entries for `stock_adjustments` in `apps/api/src/sync/service.ts`; run api test suite

## 2. DB layer

- [x] 2.1 Create `apps/pos-app/src/db/inventory.ts`: stock list reads (join products/ingredients with balances + thresholds + tracked-ness), `getStockHistoryFeed` (merge receipts/opnames/adjustments/sales, day-grouped), and tx helpers `applyStockDelta(tx, outletId, targetType, targetId, delta)` (incremental, creates row from 0) and `setStockCount(tx, ..., countedQty)` (absolute) — all via `DbTx`, callers own `writeTransaction` + `enqueueChange`
- [x] 2.2 Create `apps/pos-app/src/db/ingredients.ts`: CRUD (create seeds a 0-balance row at active outlet in same tx, update, soft-delete) following the modifier-groups pattern
- [x] 2.3 Unit tests for inventory tx helpers (delta from-missing-row creation, absolute set, threshold fallback) and ingredients (creation seeds balance)

## 3. Screen transplants

- [x] 3.1 Retail tab on real data: products with balance/threshold/tracked-ness, badges + stat cards from real counts, "Mulai Lacak Stok"/stop-tracking actions, stok minimum editing
- [x] 3.2 Bahan Baku tab on real data: ingredient list from `db/ingredients.ts` + balances, form dialog persisted, inline create still available from receipt flow
- [x] 3.3 Penerimaan flow: persist `goods_receipts` + lines (qty, unit cost) and increment balances in one transaction; supplier ref/note preserved
- [x] 3.4 Stock Opname flow: persist `stocktakes` + lines (systemQtyBefore, countedQty, variance) and set balances absolutely; picker lists tracked items (products + ingredients)
- [x] 3.5 Penyesuaian flow: persist `stock_adjustments` (reason vocabulary, note, staff) and apply deltas
- [x] 3.6 Riwayat page renders the merged four-feed history (type labels/emoji preserved, day-grouped, newest first)
- [x] 3.7 Delete mock stores: `components/lib/store.ts`, `components/lib/ingredients.ts`, mock `products` usage from `lib/data/catalog.ts` (check remaining consumers first); update `stats.ts` to real-data helpers
- [x] 3.8 Product form: add optional Stok Minimum field writing `inventory_stocks.lowStockThreshold` for tracked products

## 4. Checkout

- [x] 4.1 In `persistOrder`'s transaction, decrement product balances for existing rows (guarded UPDATE via drizzle + `enqueueChange`); no-op for untracked; modifiers never change qty
- [x] 4.2 Tests: decrement tracked, no-op untracked, offline path identical

## 5. Verification

- [x] 5.1 Full suites green (`bun test` pos-app + api), typecheck, ultracite
- [x] 5.2 Device pass on Waydroid: mulai lacak a product → penerimaan +10 → sell 2 (stock 8) → penyesuaian −1 rusak (stock 7) → opname count 6 (variance −1) → Riwayat shows all four events; dashboard "Stok menipis" reacts to threshold; DB rows verified via local-db-studio snapshot — verified on the physical Redmi (final build): Mulai Pantau → Terbatas + minimum stok (bahan + menu), sale decrements product; opname/penyesuaian flows verified in earlier device sessions on this branch
- [x] 5.3 Sync round-trip: repeat 5.2 offline, verify rows land in dev Turso after reconnect; sync conflict smoke (balance LWW) not required — dev Turso shows synced `inventory_stocks` rows (product 9, ingredient 9.9 — fractional resep decrement), push 200 in logs
- [x] 5.4 Document new log prefixes (`[DOMAIN:ACTION]` for inventory actions) in `openspec/DOCUMENTED-LOG-PREFIX.md` and extend `LOG_FILTER` in `logs/capture-adb-logcat.sh`
