# Tasks

## 1. Schema & sync plumbing

- [x] 1.1 Add `product_ingredients` to both paired schemas (mirror `product_modifier_groups`: merchantId denorm, productId/ingredientId FKs, `qtyPerUnit` real, unique (productId, ingredientId), is_synced + product indexes, sync columns helper)
- [x] 1.2 Register in `sync.config.ts` immediately after `ingredients`, run `bun run generate:sync`, repoint `lib.rs` + `service.ts` + registry test imports; update the api registry order test
- [x] 1.3 Migration: both histories REBUILT as clean `0000_baseline` files via drizzle-kit (old meta was hand-mangled beyond repair); applied at first install. Dev/prod Turso get the new tables applied manually when the stacks are up
- [x] 1.4 Add api repository entries for `product_ingredients`; run api suite

## 2. DB layer

- [x] 2.1 Create `apps/pos-app/src/db/recipes.ts`: `getProductIngredients(productId)` (with bahan name/unit/active state joined), `getRecipesForProducts(productIds)` (batched, for checkout), `setProductIngredients(productId, rows)` diffing write (insert/update qty/soft-delete/resurrect, `setProductModifierGroups` pattern)
- [x] 2.2 Unit tests: diffing (add/update/remove/resurrect), batched read, merchant scoping rejection

## 3. Product form UI

- [x] 3.1 Extend the attachment-field pattern with per-row qty input (bahan unit shown) for the recipe section; deactivated-bahan rows render a warning state
- [x] 3.2 Product form: "Bahan Baku (resep)" section wired to `getProductIngredients` + `setProductIngredients` after product save (same place as `setProductModifierGroups`), helper text on product-stock vs recipe semantics
- [x] 3.3 Ingredient form/tab unchanged; verify no accidental coupling

## 4. Checkout deduction

- [x] 4.1 In `persistOrder`, batch-fetch recipe rows for the order's productIds; per line, deduct each linked ingredient via the guarded balance write (`qtyPerUnit × qty`); per-ingredient failures log and continue, never abort the order
- [x] 4.2 Tests: deduction with recipe, no-op untracked, recipe-less product, modifier qty independence, failure-tolerance

## 5. Verification

- [x] 5.1 Full suites green (pos-app + api), typecheck, ultracite
- [ ] 5.2 Device pass (after wire-inventory 5.2/5.3 on the same build): create recipe on a drink (0.25 kg kopi), sell 2 → kopi balance −0.5 in DB; Riwayat still shows the product sale; product form shows the recipe after reopen
- [ ] 5.3 Sync round-trip: recipe rows land in dev Turso after manual sync; edit qty on device → server reflects new qtyPerUnit
- [x] 5.4 Document new log prefixes in `openspec/DOCUMENTED-LOG-PREFIX.md` + extend `LOG_FILTER` if any new domain/action added; note `0006` joins the pending prod deploy bundle (0004+0005+0006) in ROADMAP
