# Spec Delta

## ADDED Requirements

### Requirement: Real Variant Tab

The catalog Variant tab SHALL list modifier groups from the local synced database (name, options summary, linked product count) instead of mock constants, with search matching group name, option label, or linked product name, and an empty state when no groups exist.

#### Scenario: List real groups
- **WHEN** the merchant opens Katalog → Varian
- **THEN** groups SHALL come from the local `modifier_groups`/`modifier_options`/`product_modifier_groups` tables
- **AND** mock variant data SHALL not be rendered

#### Scenario: Search by linked product
- **WHEN** the merchant searches "kopi"
- **THEN** groups linked to any product whose name contains "kopi" SHALL match

### Requirement: Product-Group Attachment

The product form SHALL let the merchant attach and detach modifier groups per product, with attachment order preserved.

#### Scenario: Attach group to product
- **WHEN** the merchant attaches "Size" to "Es Kopi Susu"
- **THEN** a `product_modifier_groups` link row SHALL be created and enqueued for sync
- **AND** the POS selection sheet for that product SHALL include the group

#### Scenario: Detach group
- **WHEN** the merchant detaches a group from a product
- **THEN** the link row SHALL be soft-deleted and the group SHALL disappear from that product's POS sheet
- **AND** other products using the group SHALL be unaffected
