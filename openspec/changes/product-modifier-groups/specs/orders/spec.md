# Spec Delta

## ADDED Requirements

### Requirement: Modifier Selection at Cart-Add

The system SHALL open a selection sheet when a cashier taps a product with at least one attached, non-deleted modifier group, and SHALL add the product directly (today's behavior) when it has none.

- Required `single` groups SHALL render as one-pick lists with the first option preselected.
- Required `multi` groups SHALL require at least one pick.
- Optional `single` groups SHALL offer a "Tanpa <group>" escape.
- Optional `multi` groups SHALL allow zero picks.
- The line price SHALL be the product price plus the sum of selected option deltas (multi picks sum each).
- On confirm, chosen options SHALL be captured per the existing Order Item Modifier Snapshot requirement (R12); the group name, option label, and price delta SHALL be snapshotted with quantity 1 per pick in v1.

#### Scenario: Product with required Size
- **WHEN** the cashier taps "Es Kopi Susu" which has required single group "Size" (Small +0, Medium +3.000, Large +5.000)
- **THEN** a sheet SHALL open with "Small" preselected
- **AND** confirming with "Large" SHALL add a line priced Rp 5.000 above base with a "Size: Large" modifier snapshot

#### Scenario: Multi-pick topping sums
- **WHEN** optional multi group "Topping" has "Boba" (+3.000) and "Grass Jelly" (+3.000) and both are picked
- **THEN** the line price SHALL include +Rp 6.000 and two modifier snapshots SHALL be written

#### Scenario: Product without groups unchanged
- **WHEN** the cashier taps a product with no attached groups
- **THEN** it SHALL enter the cart directly without a sheet

#### Scenario: Optional group skipped
- **WHEN** the cashier leaves optional group "Es" unanswered via "Tanpa Es" and confirms
- **THEN** no modifier snapshot SHALL be written for that group
