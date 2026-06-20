## ADDED Requirements

### Requirement: Order Item Modifier Snapshot

The system SHALL capture product modifiers (sizes, add-ons — e.g., "Extra Shot", "Large", "Ice Level: Less") as a relational snapshot via an `order_item_modifiers` table, sibling to `order_items`. This extends the existing "Product and Price Snapshots on Order Items" pattern (R8) to modifier data.

- The `order_item_modifiers` table SHALL carry: `id` (UUIDv7), `orderItemId` (text notNull, soft-ref to `order_items`), `outletId` (scope column, denormalized from the parent order for sync filtering), `modifierName` (text notNull — e.g., `"Extra Shot"`), `modifierGroup` (text nullable — e.g., `"Size"`, `"Add-ons"`), `priceDeltaMinorUnits` (integer notNull, default `0` — signed; positive for upcharge, zero for no-cost options), `quantity` (integer notNull, default `1`), plus the standard sync columns.
- Modifiers SHALL be stored as a relational snapshot, NOT as a JSON column on `order_items`. Rationale: baresync warns against JSON-typed columns (`SYNC_SCHEMA_JSON_ONLY_FIELD`); relational storage matches the existing `order_items` snapshot pattern; and it enables SQL analytics ("how many extra shots sold this month").
- `priceDeltaMinorUnits` uses integer minor units (no float).
- The table is scoped by `outletId` (denormalized) — same convention as `order_items`.
- This is a receipt **snapshot** only. It captures what was sold on each line. It does NOT define what modifiers a product *offers* (a future `product_modifier_catalog` table is out of scope).

#### Scenario: Order line with two modifiers
- **WHEN** an order line for "Cappuccino" includes modifiers "Extra Shot" (+Rp 5.000) and "Oat Milk" (+Rp 7.000)
- **THEN** the client SHALL insert two `order_item_modifiers` rows for that `orderItemId`
- **AND** each row SHALL snapshot `modifierName`, `modifierGroup`, `priceDeltaMinorUnits`, `quantity`

#### Scenario: Free modifier option
- **WHEN** a modifier option has no upcharge (e.g., "Ice Level: Normal")
- **THEN** `priceDeltaMinorUnits` SHALL be `0` (not null)

#### Scenario: Modifier quantity
- **WHEN** a customer orders "Extra Shot" with quantity 2 (double shot)
- **THEN** the `order_item_modifiers` row SHALL have `quantity = 2`
- **AND** `priceDeltaMinorUnits` SHALL record the per-unit delta (the line total contribution is `priceDeltaMinorUnits × quantity`)

#### Scenario: Receipt renders modifiers
- **WHEN** the receipt renderer builds a line item
- **THEN** it SHALL query `order_item_modifiers WHERE orderItemId = ?`
- **AND** render each modifier with its name and price delta beneath the parent line

#### Scenario: Modifier analytics
- **WHEN** a merchant queries "how many Extra Shots sold this month"
- **THEN** the system SHALL query `order_item_modifiers WHERE modifierName = 'Extra Shot'` joined to `order_items` and `orders` filtered by date
- (This query path is enabled by relational storage; JSON storage would require per-row parsing.)
