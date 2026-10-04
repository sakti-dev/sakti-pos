# Spec Delta: orders

## ADDED Requirements

### Requirement: Recipe-Based Ingredient Deduction at Checkout

When an order completes at an outlet, the system SHALL additionally decrement the on-hand quantity of each ingredient linked to the sold products by `qtyPerUnit × line quantity`, within the same local transaction as the order write, using the outlet's ingredient balance rows. Ingredient deduction SHALL be a guarded no-op when no live balance row exists, and a failure to deduct a specific ingredient SHALL NOT block or abort the sale.

#### Scenario: Recipe sale deducts bahan

- **WHEN** 2 units of a product linked to Biji Kopi 0.25 kg complete at an outlet
- **THEN** that outlet's Biji Kopi balance decreases by 0.5 in the same transaction as the order insert

#### Scenario: Untracked ingredient is a no-op

- **WHEN** a linked ingredient has no live balance row at the outlet
- **THEN** checkout succeeds and no balance row is created by the sale

#### Scenario: Recipe-less product deducts nothing extra

- **WHEN** a product with no recipe links is sold
- **THEN** only the product's own stock (when tracked) is affected

#### Scenario: Offline sale deducts ingredients

- **WHEN** an order with recipe-linked products completes offline
- **THEN** ingredient balances decrease locally and sync with the balance rows when connectivity returns
