# Proposal

## Why

Products and bahan baku are two disconnected catalogs: the product form links kategori, foto, and varian, but nothing links a product to the ingredients it consumes. Selling 2 Es Kopi Susu decrements the product's stock (wire-inventory) but never touches Biji Kopi/Susu/Cup — so a warung kopi can't answer "berapa kopi tersisa?" in kg. This is the recipe/BOM linkage the ingredients spec explicitly deferred ("that change SHALL add new tables"); with real balances and sale-time deduction now shipped in wire-inventory, the missing bridge is the last piece.

## What Changes

- **New synced table `product_ingredients`** (merchant-scoped link rows: `productId`, `ingredientId`, `qtyPerUnit` real — quantity of the bahan consumed per 1 unit of the product sold; unique per pair, `0006` migration both sides, contract regen, api registry after `ingredients`).
- **Recipe section in the product form**: a qty-aware variant of the attachment field — selected bahan rows with per-unit qty inputs (in the bahan's unit) + "Tambah Bahan" sheet (search + checkbox list); saved via a `setProductIngredients` diffing write (the `setProductModifierGroups` pattern).
- **Sale-time ingredient deduction**: `persistOrder` additionally decrements each linked ingredient's balance by `qtyPerUnit × lineQty` at the order's outlet, in the same write transaction, guarded no-op when no live balance row exists. Recipe fetch is one batched query for all product ids in the order.
- **Recipes are product-level in v1**: modifier options never change ingredient quantities ("Extra Shot = more kopi" is v2). Deleting/deactivating links never deletes bahan or affects history.

## Capabilities

### New Capabilities

- `recipes` — recipe data model (product → ingredient with per-unit qty), recipe linking UI semantics, and the constraint that recipes attach to products, not modifier options.

### Modified Capabilities

- `orders` — checkout now also deducts linked ingredient balances (extends offline-first order persistence; the product decrement from wire-inventory R11 is unchanged).
- `ingredients` — the "Out of scope — recipe/BOM linking" deferral is satisfied by this change: the bare `ingredients` table itself remains unchanged, linkage lives in `product_ingredients`.

## Impact

- **Schema/migrations**: `0006_product_ingredients.sql` both sides + meta; contract `generated/` regen + Rust repoint; api registry entry (order: immediately after `ingredients`) + registry order test; dev Turso apply; prod rides the pending deploy bundle (`0004` + `0005` + `0006`).
- **Code**: `db/recipes.ts` (new), product form (recipe section), `persistOrder` (second deduction loop), no changes to inventory flows.
- **Sequencing**: builds on wire-inventory's balance helpers and ingredient rows; wire-inventory's remaining device passes (5.2/5.3) should complete first — this change's device pass can follow immediately on the same build.
- **Riwayat**: sale rows continue to show the product sold; per-ingredient consumption is derivable later from `order_items × product_ingredients` without new tables — a "Bahan" history filter is a follow-on, not in this change.
