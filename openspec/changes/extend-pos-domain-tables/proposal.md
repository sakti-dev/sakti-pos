## Why

The POS schema covers core sales (org, catalog, orders) but has no tables for the upcoming feature work: inventory tracking, cash-shift/drawer control, product modifiers on receipts, and F&B raw-material cataloging. The UI forms for stocktake and goods-receipt already exist (`apps/pos-app/src/pages/inventory/`) and submit batches keyed on ingredient and product targets — but they have nowhere to persist. Without these tables, the forms are dead code. This change lands the storage foundation the feature work depends on, ahead of the UI rebuild.

Full design rationale and ERDs live in `openspec/DATABASE-DESIGN.md`. This change implements Part 2 of `docs/plans/2026-06-20-pos-schema-extension-design.md`.

## What Changes

Add 8 new synced tables to `packages/sync-contract/src/{api,local}-synced-schema.ts`, all following the existing baresync machinery (UUIDv7 `id` PK, scope column, `apiSyncColumns()`/`localSyncColumns()`, mirrored business columns, mandatory sync indexes). Register all 8 in `sync.config.ts`. Generate API migration `0003_*.sql` and hand-write local migration `0002_*.sql`.

The 8 tables:

1. **`ingredients`** — bare F&B raw-material catalog (NOT a recipe/BOM engine; that's deferred). Unblocks stocktake/goods-receipt ingredient tabs.
2. **`inventory_stocks`** — current on-hand qty per outlet per target (polymorphic: `product` or `ingredient`). Uses a **deterministic PK** (`inv:{outletId}:{targetType}:{targetId}`) instead of UUIDv7 — baresync upserts pulled rows by PK (`ON CONFLICT(id) DO UPDATE`, verified), so two devices creating the same logical stock card converge to one row. See design D1.
3. **`stocktakes`** + **`stocktake_lines`** — header + lines for counting sessions (matches the form's `{ ref, reason, items[] }` batch shape).
4. **`goods_receipts`** + **`goods_receipt_lines`** — header + lines for receiving sessions (matches the form's `{ ref, supplier, note, items[] }` batch shape).
5. **`cash_shifts`** — drawer open/close boundaries (drives the dashboard `StatusPlaque` `Buka`/`Tutup` pill).
6. **`order_item_modifiers`** — receipt snapshot for product modifiers (sizes, add-ons). Relational, not JSON — avoids the baresync `SYNC_SCHEMA_JSON_ONLY_FIELD` warning and fits the existing `order_items` snapshot pattern.

No CHECK constraints anywhere — baresync does not inspect them, and a server-pushed row violating a local CHECK fails the INSERT silently and drops out of sync. Status/type fields use drizzle text enums.

No columns added to the 10 core synced tables in this change (that's `harden-core-synced-schema`). The two changes are independent and can apply in either order.

## Capabilities

### New Capabilities
- `inventory`: stock tracking — on-hand quantities, stocktake (stock opname) counting sessions, and goods-receipt receiving sessions. Covers `inventory_stocks`, `stocktakes`, `stocktake_lines`, `goods_receipts`, `goods_receipt_lines`.
- `cash-shifts`: cash drawer open/close boundaries, opening float, expected vs actual cash reconciliation. Covers `cash_shifts`.
- `ingredients`: F&B raw-material catalog entity (bare — name, sku, unit, category, active). Not a recipe/BOM engine.

### Modified Capabilities
- `orders`: add the modifier-snapshot requirement — `order_items` gains a sibling `order_item_modifiers` table capturing per-line modifier name, group, price delta, and quantity. Extends the existing R8 "Product and Price Snapshots on Order Items" pattern relationally (not JSON).

## Impact

- **Schema files:** `packages/sync-contract/src/{api,local}-synced-schema.ts` (+8 tables each, mirrored)
- **Contract config:** `packages/sync-contract/sync.config.ts` (+8 table registrations with scope columns)
- **Contract artifacts:** `generated/<date>/` regenerated
- **Migrations:** `apps/api/drizzle/0003_*.sql` (generated), `apps/pos-app/src-tauri/migrations/0002_*.sql` (hand-written)
- **No app code changes required** in this change — schema foundation lands ahead of feature wiring. The existing inventory forms (`apps/pos-app/src/pages/inventory/`) will be rewired to consume these tables in follow-up feature changes.
- **No breaking changes** — additive only (new tables). Existing 10 synced tables untouched.
- **Risk: moderate.** New tables are cohesive (shared polymorphic-inventory + denormalized-scope design), but the volume (8 tables) and the deterministic-ID deviation from the UUIDv7 default warrant focused review. Verification: `generate:sync` clean (no JSON warnings, no missing scopes), API tests, POS-app `tsc` + ultracite + vitest, column-for-column migration diff.

Relationship to `harden-core-synced-schema`: logically separable but contractually independent. Either can apply first. Recommended sequence is hygiene-first so the review of the 8 new tables isn't diluted by low-risk index work.
