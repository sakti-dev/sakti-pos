# Proposal

## Why

The catalog's Variant tab, variant form, and POS behavior around "varian" run on hardcoded mock data (`lib/data/catalog.ts`) because the synced schema has no catalog-side data model for them — only `order_item_modifiers`, a per-sale snapshot table that was designed to receive these choices. Cashiers cannot configure or sell products with size/sugar/ice/topping choices for real.

## What Changes

- New synced tables: `modifier_groups` (name, selection type single/multi, required flag, sort order — merchant-scoped), `modifier_options` (label, price delta, sort order — group-scoped), and `product_modifier_groups` (product↔group link with per-link sort order).
- Sync contract regenerated; local + server migrations; server repositories (buildRow/read/upsert/softDelete) for the three tables.
- Catalog: real Variant tab (list, search, create, edit, soft-delete) backed by SQLite, replacing `lib/data/catalog.ts` variants and the mock-backed `variant-tab.tsx`/`variant-form.tsx`.
- Product form: attach/detach modifier groups to products.
- POS cart: tapping a product that has modifier groups opens a selection sheet — required single groups preselect their first option, multi groups allow 0..n picks — chosen options sum their price deltas onto the line and are persisted to `order_item_modifiers` at checkout.
- Receipt/order detail surfaces render chosen modifiers per line where line items are already shown.

## Capabilities

### New Capabilities
- `modifier-groups`: catalog-side data model + CRUD for shared modifier groups, options, and product links (shared groups attached to many products, per the existing mock shape).

### Modified Capabilities
- `orders`: adding a product with attached modifier groups requires answering required groups (preselected defaults); chosen options price the line and persist via the existing R12 snapshot.
- `menu`: the Variant tab and product form operate on real synced data instead of mocks.

## Impact

- Synced schema changes require contract regeneration and paired migrations (local Tauri + server); both sides ship before any client writes, mirroring the cash-shifts `closedByStaffId` rollout.
- Existing `order_item_modifiers` is untouched — it already models group/label/price-delta snapshots.
- Mock-only surfaces (`lib/data/catalog.ts` variants, product-side mocks where superseded) are deleted once real queries land.
