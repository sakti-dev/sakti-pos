# Design

## Context

Inventory UI (Retail/Bahan tabs, Penerimaan, Stock Opname, Penyesuaian, Riwayat) is a complete prototype on in-memory stores. Real synced tables exist for balances and two of three event types; `stock_adjustments` is missing. All writes must go through the local `writeTransaction` + `enqueueChange` pattern (drizzle ORM only — raw SQL never enqueues for sync push). Quantities are `real` (bahan in kg). Sync scope columns and `localSyncColumns()` conventions apply to every synced table. Existing UI ships Indonesian adjustment reasons (rusak/hilang/expired/hadiah/sample/lainnya) — keep that vocabulary.

## Goals / Non-Goals

**Goals:**
- Every inventory screen reads/writes real synced tables; mock stores deleted.
- Stock answers are true across app restarts, offline use, and sync.
- Opt-in tracking per item per outlet with zero schema cost on `products`.
- Checkout decrements tracked product stock without being able to fail a sale.
- Audit story: Riwayat derives from append-only events (receipts, opname, adjustments, sales).

**Non-Goals:**
- Recipe/BOM linkage (ingredient deduction on sale) — deferred by `openspec/specs/ingredients/spec.md`.
- Multi-register per outlet concurrency guarantees on balances.
- Transfers between outlets, purchase orders, supplier catalog, COGS reporting.
- Any change to the `menu` capability.

## Decisions

### D1 — Row-exists tracking convention (no `track_stock` flag)

An `inventory_stocks` row for `(outletId, targetType, targetId)` = tracked at that outlet. Tracked-ness is per-outlet (where stock actually lives); a merchant-global flag cannot express "tracked at outlet A, not at B", and flag-default-true would generate day-1 noise (negatives, dashboard nagging) for merchants who never count anything.

- **Tracking starts**: first stock event touches the item (receipt line, opname line, adjustment), or explicit "Mulai Lacak Stok" action (inserts a 0-balance row). Ingredients are tracked on creation — the ingredient form seeds a 0-balance row in the same transaction.
- **Tracking stops**: delete the balance row (event history survives independently).
- **Checkout rule**: `UPDATE inventory_stocks SET on_hand_qty = on_hand_qty - qty, is_synced = 0, updated_at = now WHERE outlet_id = ? AND target_type = 'product' AND target_id = ?` — 0 rows affected for untracked items; untracked items can never go negative or produce ghost state.
- Alternatives considered: `products.track_stock` boolean (rejected — merchant-global vs per-outlet, products migration, on-by-default noise).

### D2 — New `stock_adjustments` table (third event type)

Don't overload opname (= N recount) or receipts (+ N supplier billing). Manual corrections (± N) get a dedicated append-only table mirroring `stocktakes` conventions:

```
stock_adjustments: id (uuidv7), outletId, staffId, targetType (product|ingredient),
  targetId, qtyDelta (real, signed), reason (rusak|hilang|expired|hadiah|sample|lainnya),
  note (nullable), ...localSyncColumns()
  indexes: is_synced, (outletId, targetId)
```

No `merchantId` denormalization (matches `stocktakes`/`goods_receipts`, which are outlet-scoped and join through `outlets`). No `ref` (adjustments are informal). Migration `0005_stock_adjustments.sql` both sides + contract regen + Rust repoint + api registry entry (order after `goods_receipt_lines`, before `cash_shifts`) + registry order test.

### D3 — Balance update rules (LWW accepted)

- Sales, receipts, adjustments: **incremental** (`on_hand_qty ± delta`).
- Stock opname: **absolute** (`on_hand_qty = counted_qty`), with `systemQtyBefore`/`varianceQty` snapshotted on the lines.

Known accepted cost: concurrent writes to the same balance row from different outlets can lose a delta (last-write-wins). Accepted because: single register per outlet in practice; append-only events preserve the full story; opname is the periodic self-heal. No CRDT/counter or server reconciliation.

### D4 — Checkout decrement lives inside `persistOrder`'s transaction

Additive to the existing `writeTransaction`: for each order line, guarded UPDATE (D1 rule) + `enqueueChange` for `inventory_stocks`. Modifiers don't affect quantity. Untracked or missing rows are silent no-ops — a sale can never be blocked by inventory. Ingredient deduction (BOM) is out of scope.

### D5 — Riwayat derives from four event feeds

Merge and day-group (current UI shape, `MOVEMENT_TYPE_META` labels kept):
1. `goods_receipt_lines` → 📦 Penerimaan (join parent for supplier/ref)
2. `stocktake_lines` → 📋 Stock Opname (variance as delta, join parent for reason/ref)
3. `stock_adjustments` → 🔧 Penyesuaian (reason label)
4. `order_items` (completed orders at this outlet) → 🛒 Penjualan

Three small typed queries merged in TS (not a SQL UNION — small data, typed rows, parent joins needed anyway). `qtyBefore`/`qtyAfter` are reconstructed per-day ordering where cheap; feeds carry deltas primarily. "Saldo awal" (opening) is whatever the first event was — no synthetic seed movements.

### D6 — Threshold writers and consumers

`inventory_stocks.lowStockThreshold` (exists, nullable) gets: a field on the product form and ingredient form; drives badges/stat cards (replacing hardcoded `qty <= 5` / `<= 3`); feeds the dashboard `getLowStockCount` which already reads it. Items without a threshold use the existing default fallback in the badge logic.

## Risks / Trade-offs

- **LWW delta loss** (D3): rare, self-healing via opname, story preserved in events. Documented, accepted.
- **Checkout touches the money path** (D4): mitigated by guarded additive-only updates inside the existing transaction; no new failure modes (no-op on missing rows).
- **Migration/contract regen risk**: same procedure as `0004` (verified twice); registry order test enforces consistency.
- **Riwayat completeness**: sales feed only covers product sales; ingredient consumption is invisible until BOM exists (by design, deferred).
- **Threshold backfill**: existing rows have no threshold until merchants set one — badge fallback prevents regression to noise.
