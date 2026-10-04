# Spec Delta: orders

## MODIFIED Requirements

### Requirement: R11 Offline-First Order Persistence

The system SHALL persist orders and their line items locally-first (offline-capable, synced when online). When an order completes at an outlet, the system SHALL additionally decrement the on-hand quantity of each tracked product in that order by its line quantity, within the same local transaction as the order write.

#### Scenario: Checkout decrements tracked products

- **WHEN** an order containing 2 units of a stock-tracked product completes
- **THEN** that product's balance row at the order's outlet decreases by 2 in the same transaction as the order insert

#### Scenario: Untracked products are a no-op

- **WHEN** an order contains a product with no balance row at the outlet (untracked or a service)
- **THEN** checkout succeeds and no stock row is created or decremented

#### Scenario: Modifiers do not affect stock

- **WHEN** a line carries modifier selections
- **THEN** the decrement uses the line quantity only; modifiers never change the deducted amount

#### Scenario: Offline sale still decrements

- **WHEN** an order completes while offline
- **THEN** stock decrements apply locally and sync with the balance row when connectivity returns
