# Design

## Context

wire-inventory shipped the balance layer: `inventory_stocks` rows per (outlet, targetType, targetId) with row-exists tracking, guarded product decrement inside `persistOrder`'s `writeTransaction`, and `db/inventory.ts` helpers (`applyStockDelta`, `decrementStockForSale`-style guards, insert/resurrect/soft-delete). Ingredients are merchant-scoped catalog rows seeded with a zero balance on creation. The ingredients spec reserved recipe/BOM for a future change adding new tables. Link-table conventions exist twice already (`product_modifier_groups`): merchantId denormalized, diffing save, soft delete + resurrection.

## Goals / Non-Goals

**Goals:**
- One synced table linking products to ingredients with per-unit consumption qty.
- Product form section to manage the link set (qty-aware).
- Checkout deducts linked ingredient balances, offline-safe, never blocking a sale.
- Recipes survive as merchant-scoped data syncing across outlets.

**Non-Goals:**
- Per-modifier-option recipes (v1 is product-level; "Extra Shot = more kopi" is future).
- Per-ingredient sale entries in Riwayat (derivable later from `order_items × product_ingredients`; no new event rows).
- Recipe costing/COGS math (unit costs exist on receipt lines; combining them with recipes is reporting territory).
- Production planning, shopping lists, low-stock-on-ingredient-derived-from-recipe forecasts.

## Decisions

### D1 — Table shape mirrors `product_modifier_groups`

```
product_ingredients:
  id (uuidv7), merchantId (denorm, FK merchants),
  productId (FK products), ingredientId (FK ingredients),
  qtyPerUnit (real, > 0),
  ...localSyncColumns() / apiSyncColumns()
  unique (productId, ingredientId); indexes: is_synced, (productId)
```

Real qty because bahan counts in kg/liter fractions. Merchant scope (not outlet): a recipe is what the product *is*, identical at every outlet; consumption happens against per-outlet balances at sale time. Contract/registry order: immediately after `ingredients` (both FK parents exist by then).

### D2 — Sale-time deduction, batched and guarded

In `persistOrder`, after product decrements: one query fetching all `product_ingredients` rows for the order's distinct productIds (active, non-deleted); for each order line, for each recipe row, decrement the ingredient balance by `qtyPerUnit × line.qty` using the same guarded balance write as products (no live balance row → skip; soft-deleted → skip). All inside the existing `writeTransaction` + enqueue per touched balance row. Offline by construction; a missing recipe simply means no deduction.

### D3 — Qty-aware recipe section in the product form

Same interaction skeleton as the varian AttachmentField (selected rows + dashed "Tambah Bahan" → sheet with search + checkboxes + "Selesai · N dipilih"), plus a per-row qty input showing the bahan's unit. Saving the product saves the link set via `setProductIngredients(productId, rows)` — full diff (insert/update qty/delete-soft + resurrect), mirroring `setProductModifierGroups`. Empty set is valid (recipe-less product).

### D4 — Rounding and display

`qtyPerUnit` is stored exactly as entered (real). Deduction multiplies without rounding; balances are real so fractional residue (0.25 × 3 = 0.75) is exact in binary-floating terms used elsewhere in the schema (`receivedQty`, `onHandQty` are real). Display formats via the existing decimal helpers (`formatCount`).

## Risks / Trade-offs

- **Money path touched again**: deduction is additive and guarded (skip when no row), same as wire-inventory's product decrement; a failure inside the recipe loop must not abort the order — guard per-ingredient writes and log, don't throw.
- **Recipe maintenance drift**: menu changes (product renamed, bahan deactivated) don't cascade — links soft-delete only via explicit form action; deactivated bahan rows in a recipe show a warning state in the form rather than silently disappearing.
- **Doubled-counting risk**: products that are themselves tracked AND have recipes decrement both (product stock + ingredients) — correct for retail-style tracking of assembled goods is a merchant choice; document in the form helper text ("pantau stok produk ini untuk barang jadi; resep mengurangi bahan").
