## ADDED Requirements

### Requirement: Merchant Business Type

The system SHALL record a business type on each merchant to drive feature-flag gating in the POS frontend (e.g., hiding raw-ingredient workflows for retail-only tenants).

- The `merchants` table SHALL carry a `businessType` column: `text enum ['fnb','retail','hybrid']`, `NOT NULL`, default `'hybrid'`.
- The system SHALL sync `businessType` between API and POS via the existing baresync contract (the `merchants` table is already a synced table scoped by `id`).
- The onboarding wizard collects the business type (displayed as "F&B", "Retail", "Hybrid") and SHALL persist it as the enum value `fnb`, `retail`, or `hybrid` respectively. The `&` character is not used as a stored value.
- When no business type is provided at merchant creation, the system SHALL default to `'hybrid'`.

#### Scenario: New merchant specifies F&B business type
- **WHEN** onboarding submits `business_type = 'f&b'` (display value)
- **THEN** the system SHALL store `businessType = 'fnb'` on the merchant row
- **AND** the row SHALL sync to the POS via baresync

#### Scenario: Merchant created without business type
- **WHEN** a merchant is created with no business type specified
- **THEN** the system SHALL store `businessType = 'hybrid'` (the default)

#### Scenario: Frontend reads business type for feature gating
- **WHEN** the POS app loads and the synced merchant row has `businessType = 'retail'`
- **THEN** the frontend SHALL hide ingredient/raw-material workflows that only apply to F&B tenants

### Requirement: Per-Outlet Tax Configuration

The system SHALL support per-outlet tax configuration so multi-region merchants can adapt to local tax regulations (e.g., one outlet under PPN 11%, another in a tax-free zone).

- The `outlets` table SHALL carry two columns: `useTax` (`integer boolean`, `NOT NULL`, default `false`) and `taxPercentage` (`integer`, `NOT NULL`, default `0`).
- Both columns SHALL sync between API and POS via the existing baresync contract (the `outlets` table is already a synced table scoped by `merchantId`).
- `taxPercentage` stores a whole-percent integer (e.g., `11` means 11%). The system SHALL NOT use floating-point for tax percentages.
- The onboarding wizard's preferences step collects `use_tax` and `tax_percentage` and SHALL persist them on the outlet row.
- This requirement enables tax calculation but does NOT specify how tax is applied to order totals. Order-level tax line items are out of scope (a future checkout-flow change).

#### Scenario: Onboarding persists tax preferences
- **WHEN** onboarding's preferences step submits `use_tax = true` and `tax_percentage = 11`
- **THEN** the system SHALL store `useTax = true` and `taxPercentage = 11` on the outlet row
- **AND** the row SHALL sync to the POS via baresync

#### Scenario: Outlet defaults to no tax
- **WHEN** an outlet is created with no tax configuration specified
- **THEN** the system SHALL store `useTax = false` and `taxPercentage = 0` (defaults)

#### Scenario: Per-outlet independence
- **WHEN** a merchant has two outlets, one with `useTax = true, taxPercentage = 11` and another with `useTax = false`
- **THEN** each outlet's tax configuration SHALL be independent (per-row on `outlets`)
- **AND** neither SHALL inherit from the other
