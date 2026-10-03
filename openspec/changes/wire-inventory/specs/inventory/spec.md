# Spec Delta: inventory

## ADDED Requirements

### Requirement: Stock Tracking Lifecycle

The system SHALL track stock per item per outlet using a row-exists convention: an item is stock-tracked at an outlet if and only if a stock balance row exists for that (outlet, item) pair. No product-level tracking flag exists.

#### Scenario: Tracking starts on first stock event

- **WHEN** a stock event (goods receipt line, stocktake line, or adjustment) is recorded for an item at an outlet with no existing balance row
- **THEN** a balance row is created with the event applied to a starting balance of zero
- **AND** the item is stock-tracked at that outlet from that point

#### Scenario: Explicit tracking start

- **WHEN** the user activates "Mulai Lacak Stok" for an item at an outlet
- **THEN** a balance row with zero on-hand quantity is created
- **AND** the item appears in stock lists and the stocktake picker at that outlet

#### Scenario: Tracking stops without losing history

- **WHEN** the user stops tracking an item at an outlet
- **THEN** the balance row is deleted and the item no longer appears in stock lists or decrements at checkout
- **AND** all historical event records (receipts, stocktakes, adjustments) for that item remain intact

#### Scenario: Ingredients are tracked on creation

- **WHEN** a new ingredient (bahan baku) is created
- **THEN** a zero-balance stock row for it is created at the active outlet in the same operation

### Requirement: Balance Update Rules

The system SHALL maintain on-hand quantity as the current truth per (outlet, item), updated transactionally with every stock event. Sales, goods receipts, and adjustments apply signed incremental deltas; stocktakes apply an absolute set to the counted quantity.

#### Scenario: Goods receipt increments

- **WHEN** a goods receipt line records received quantity N for a tracked item
- **THEN** the item's on-hand quantity increases by N in the same local transaction

#### Scenario: Adjustment applies signed delta

- **WHEN** an adjustment records qtyDelta D (e.g. −2 rusak) for a tracked item
- **THEN** the item's on-hand quantity changes by D in the same local transaction

#### Scenario: Stocktake sets absolute count

- **WHEN** a stocktake line records counted quantity C while the system held S
- **THEN** the on-hand quantity is set to C
- **AND** the line persists S (system before) and the variance (C − S)

#### Scenario: Concurrent cross-outlet overwrite

- **WHEN** two outlets concurrently write the same item's balance and sync later
- **THEN** last-write-wins on the balance row is accepted behavior
- **AND** the append-only event records at both outlets retain the full story

### Requirement: Reason-Tagged Corrections in the Opname Flow

The system SHALL provide a single stock-correction surface: the stock opname flow. Every opname SHALL require a reason chosen from a fixed vocabulary (Hitung fisik, Rusak, Hilang, Expired, Hadiah, Sample, Lainnya) recorded on the opname record with staff attribution. There SHALL NOT be a separate penyesuaian (adjustment) entry point in the UI — simplicity over accounting separation is an explicit product decision.

#### Scenario: Recording waste through opname

- **WHEN** the user counts an item whose recorded stock was 8, enters 6, and saves the opname with reason Rusak
- **THEN** the opname line persists system-before 8, counted 6, variance −2 with the reason on the opname
- **AND** the item's balance is set to 6

#### Scenario: Reason is mandatory

- **WHEN** the user attempts to confirm an opname with variances without choosing a reason
- **THEN** confirmation is blocked until a reason is selected

#### Scenario: Legacy adjustment rows remain readable

- **WHEN** history contains rows previously recorded via the standalone penyesuaian flow
- **THEN** they remain visible in Riwayat with their reason tags (the `stock_adjustments` table stays in the schema, dormant)

### Requirement: Real Ingredient Catalog

The system SHALL persist ingredients (name, SKU, unit, category, active state) in the synced ingredient table, editable through the ingredient form, replacing the in-memory seed data.

#### Scenario: Create and edit bahan baku

- **WHEN** the user creates or edits an ingredient
- **THEN** the change persists locally, syncs to the server, and survives app restart

#### Scenario: Inline creation during receipt

- **WHEN** the user creates a new ingredient inline in the goods receipt flow
- **THEN** the ingredient is persisted and immediately usable as a receipt line item

### Requirement: Per-Item Low Stock Threshold

The system SHALL store an optional per-item low-stock threshold and use it — with a default fallback for unset items — for stock badges, stat cards, and the dashboard's low-stock attention count.

#### Scenario: Threshold set on the form

- **WHEN** the user saves a product or ingredient with a stok minimum value
- **THEN** the threshold persists with the item's balance row and drives its low-stock badge

#### Scenario: Dashboard count reflects real thresholds

- **WHEN** any tracked item's on-hand quantity is at or below its threshold (or the fallback when unset)
- **THEN** the dashboard's "Stok menipis" count includes it

### Requirement: Stock History Feed

The system SHALL derive the Riwayat feed from the append-only event records: goods receipt lines, stocktake lines, adjustments, and product sales from completed orders — day-grouped, newest first, with the existing type labels (Penerimaan, Stock Opname, Penyesuaian, Penjualan).

#### Scenario: All four event kinds appear

- **WHEN** a day includes a receipt, a stocktake, an adjustment, and a sale
- **THEN** the history for that day lists all four entries, each with its type label, item, and quantity effect

#### Scenario: Ingredient consumption is not shown as sales

- **WHEN** an order completes
- **THEN** only product sales appear in the history feed; ingredient usage produces no history entries (recipe/BOM linkage is deferred)
