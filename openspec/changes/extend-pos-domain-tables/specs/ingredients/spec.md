## ADDED Requirements

### Requirement: Ingredient Catalog Sibling to Products

The system SHALL treat `ingredients` as a first-class synced catalog entity, symmetric to `products` for inventory and receiving workflows. The bare `ingredients` table (defined in the `inventory` capability) covers the catalog storage; this capability documents the ingredient concept at the menu/catalog level.

- An `ingredients` row SHALL represent a raw material (e.g., "Beras", "Bumbu", cooking oil) with `name`, `sku`, `unit`, `category`, and `isActive`.
- The `ingredients` table SHALL be distinct from `products` — ingredients are not sellable items; they are inputs to food preparation. A future recipe/BOM engine may link them; until then, they exist solely for inventory tracking and goods-receipt.
- The ingredient picker in the stocktake and goods-receipt forms SHALL query `ingredients WHERE merchantId = ? AND isActive = 1`, symmetric to how the retail picker queries `products`.

#### Scenario: Ingredient appears in goods-receipt picker
- **WHEN** the goods-receipt form's picker loads via `allPickable()`
- **THEN** it SHALL merge `ingredients` and retail `products` into a single pickable list
- **AND** each item SHALL carry an `isIngredient` flag distinguishing the two sources

#### Scenario: Ingredient scoped to merchant
- **WHEN** outlet A and outlet B belong to the same merchant
- **THEN** both outlets SHALL see the same set of `ingredients` (ingredients are merchant-scoped, not outlet-scoped)

#### Scenario: Out of scope — recipe/BOM linking
- **WHEN** a future change introduces recipe/BOM linking (ingredient → product with quantities)
- **THEN** that change SHALL add new tables; the bare `ingredients` table SHALL remain unchanged
- (This requirement explicitly defers the recipe engine to a future change.)
