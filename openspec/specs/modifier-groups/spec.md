# Modifier Groups

## Purpose

Catalog-side data model for shared modifier groups ("varian"): groups with single/multi selection and a required flag, options with signed price deltas, and merchant-wide product links. Sale-side persistence is the `order_item_modifiers` snapshot (orders spec R12).

## Requirements

### Requirement: Modifier Group Data Model

The system SHALL provide merchant-scoped shared modifier groups with options and product links as synced tables: `modifier_groups` (id, merchantId, name, selectionType `single|multi`, required boolean, sortOrder, sync columns), `modifier_options` (id, groupId, label, priceDeltaMinorUnits signed default 0, sortOrder, sync columns), and `product_modifier_groups` (id, productId, groupId, sortOrder, sync columns — unique per product+group).

#### Scenario: Shared group across products
- **WHEN** the same "Size" group is linked to five drinks
- **THEN** there SHALL be one `modifier_groups` row and five `product_modifier_groups` link rows
- **AND** renaming the group or editing its options SHALL affect all five products

#### Scenario: Price delta is signed minor units
- **WHEN** an option "Large" costs Rp 5.000 more
- **THEN** its `priceDeltaMinorUnits` SHALL be `500000`
- **AND** a no-cost option ("Normal ice") SHALL store `0`, never null

### Requirement: Modifier Group CRUD

The system SHALL let merchants create, edit, and soft-delete modifier groups with an options editor (label + price delta per option) and a product attachment multi-select. All writes SHALL go through the baresync outbox pattern.

#### Scenario: Create group with options and products
- **WHEN** the merchant creates "Topping" (multi, optional) with options "Boba" (+Rp 3.000) and "Grass Jelly" (+Rp 3.000), attached to 3 products
- **THEN** the group, its options, and 3 link rows SHALL be created locally with `isSynced: false` and enqueued for sync

#### Scenario: Soft delete keeps history
- **WHEN** a group that appears on past orders is soft-deleted
- **THEN** existing `order_item_modifiers` snapshots SHALL remain unchanged
- **AND** the group SHALL no longer appear in catalog lists or POS selection for new sales

### Requirement: Modifier Group Sync

The system SHALL sync `modifier_groups`, `modifier_options`, and `product_modifier_groups` across devices via baresync, with groups pushed before options and links (parents before children) and deletes in reverse order.

#### Scenario: Cross-device group replication
- **WHEN** a group is created on device A and syncs
- **THEN** device B SHALL pull the group, its options, and its product links on the next sync
- **AND** a local edit SHALL mark `isSynced: false` and replicate on next push
