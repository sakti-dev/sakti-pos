# Design

## Context

See proposal.md — Why. The catalog needs shared modifier groups (the mock "varian" shape: one Size group attached to many products). `order_item_modifiers` already snapshots choices at sale time (`modifierGroup`, `modifierName`, `priceDeltaMinorUnits`, `quantity`), so the sale-side model exists; only the catalog side is missing.

Decisions confirmed with the user:
- Groups support **single-pick** (Size, Gula) and **multi-pick** (Topping) selection.
- Each group carries a **required flag**; required groups must be answered before the item enters the cart, with the first option preselected.
- Groups are **shared merchant-wide** and linked to products (not per-product duplication).

## Goals / Non-Goals

Goals:
- Catalog-side modifier data model synced end-to-end (schema → contract → migrations → server repo).
- Real Variant tab + form; product form group attachment.
- POS selection sheet + price-delta line pricing persisted to `order_item_modifiers`.

Non-Goals:
- Per-outlet group overrides or availability toggles.
- Stock/inventory integration for options.
- Editing modifiers on a line after it is in the cart (v1: remove + re-add).
- Legacy mock data migration (mocks are sample data, not user data).

## Data Model

Three new synced tables, merchant-scoped like `products`/`categories`:

```
modifier_groups            modifier_options           product_modifier_groups
─────────────              ──────────────             ───────────────────────
id (uuidv7)                id (uuidv7)                id (uuidv7)
merchant_id → merchants    group_id → modifier_groups product_id → products
name                       label                      group_id → modifier_groups
selection_type             price_delta_minor_units    sort_order
  enum('single','multi')     default 0
required (bool)            sort_order                 + local/api sync columns
sort_order                 + local/api sync columns
+ local/api sync columns
```

- `price_delta_minor_units` is signed — toppings add, nothing needs negatives today but the model allows them.
- Link rows carry `sort_order` so attachment order is stable per product.
- Unique constraint: one link per (product_id, group_id).
- `deletedAt` soft deletes everywhere (baresync default); soft-deleting a group hides it (and its links) from POS/catalog surfaces but leaves historical `order_item_modifiers` rows untouched — snapshots are the audit trail.

## Sync / Migration Plan

Follows the cash-shifts `closedByStaffId` procedure:

1. Add tables to `api-synced-schema.ts` + `local-synced-schema.ts` (same business columns; `apiSyncColumns()` vs `localSyncColumns()`).
2. `sync.config.ts`: register the three tables (scope column `merchantId`).
3. `bun run generate:sync` → new dated contract; repoint lib.rs `contract_json` + api service imports.
4. Hand-write paired migrations: `apps/pos-app/src-tauri/migrations/0004_modifier_groups.sql` (+ journal/snapshot meta) and `apps/api/drizzle/0004_modifier_groups.sql`.
5. Server: add the three tables to the repository (buildRow with `requiredString`/`optionalString`/`requiredInt`/`requiredBool`, readLatestRow, readRows, softDeleteRow, upsertRow conflict set). Push-order: groups → options → links (parents before children), delete-order reversed — mirror `SYNC_UPSERT_ORDER`.
6. Turso (dev + prod): apply the server migration.

## POS Selection Behavior

- Tap product with ≥1 attached (non-deleted) group → AdaptiveDialog sheet lists groups in link order, options in option order.
- Required single: radio list, first option preselected; required multi: checkboxes, at least one; optional single: radio + "Tanpa <group>" escape; optional multi: checkboxes.
- Line total = product price + Σ selected option deltas (multi picks sum each). Confirm ("Tambahkan") writes the cart line with chosen options.
- Products without groups: add directly (today's behavior).
- On checkout, chosen options persist to `order_item_modifiers` (`modifierGroup` = group name, `modifierName` = option label, `priceDeltaMinorUnits`, `quantity` = pick count for multi groups).

## Catalog UI

- Variant tab: list groups (name, options summary, linked product count) from a TanStack query keyed `["drizzle","modifier-groups",…]`; search by name/option/product; empty state preserved.
- Variant form (create/edit): group name, selection type, required toggle, options editor (label + price delta rows, add/remove, reorder later), product attachment multi-select.
- Product form: section listing attached groups with add/remove.
- Writes go through `getSyncClient().writeTransaction` + `enqueueChange` — never direct drizzle writes.

## Risks / Trade-offs

- Cross-device rename of a group changes historical meaning of `order_item_modifiers.modifierGroup` strings — accepted (snapshots are display strings, not FKs; same trade-off as `order_items.productName`).
- Multi-pick quantity semantics (each option qty=1 in v1) keeps the sheet simple; per-option quantity is a follow-up.

## Migration Plan

Schema-first, both sides ship before any client write (see Sync / Migration Plan). No data backfill — current variant data is mock.
