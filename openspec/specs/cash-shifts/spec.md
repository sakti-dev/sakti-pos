# Cash Shifts

## Purpose

Cash drawer open/close boundaries per outlet/register: opening float, expected vs actual cash reconciliation, and shift status driving the dashboard's Buka/Tutup state.

## Requirements

### Requirement: Cash Shift Drawer Control

The system SHALL maintain a `cash_shifts` table as a synced business table scoped by `outletId`, tracking cash-drawer open/close boundaries to protect the till against unaccounted cash drift. This drives the dashboard `StatusPlaque` `Buka`/`Tutup` (Open/Closed) state.

- The `cash_shifts` table SHALL carry: `id` (UUIDv7), `outletId` (scope column), `registerId` (text nullable — null for shared-drawer outlets), `openedByStaffId` (text notNull, soft-ref to `staff` — NOT `userId`, because `users` is server-only and not locally resolvable), `closedByStaffId` (text nullable, soft-ref to `staff` — set at close; supports handover where opener ≠ closer), `openedAt` (text notNull, ISO 8601 UTC), `closedAt` (text nullable), `initialFloatMinorUnits` (integer notNull, default `0`), `expectedCashMinorUnits` (integer notNull, default `0`), `actualCashMinorUnits` (integer nullable — set at close), `differenceMinorUnits` (integer nullable — `actual − expected`, signed for short/over), `status` (text enum `['open','closed']`, notNull), `note` (text nullable), plus the standard sync columns.
- All money columns use integer minor units (no float).
- `status` uses a drizzle text enum, NOT a CHECK constraint (baresync does not inspect CHECKs; a server-pushed row violating a local CHECK would fail the INSERT silently and drop out of sync).
- Expected cash SHALL be derived from the Laci Kas (default cash) wallet's balance — the authoritative running drawer total — rather than by scanning the order window; the shift row persists it at close as its per-shift report snapshot.
- Shift window money totals (cash and QRIS informational) SHALL be read from the wallet transaction ledger within `[openedAt, closedAt)` instead of scanning orders.
- Closing a shift SHALL additionally write wallet ledger events inside the close transaction: one `reconciliation` entry applying the counted variance to the Laci Kas balance, and — when the cashier opts into setoran — one linked `transfer_out`/`transfer_in` pair moving the setoran amount from Laci Kas to the chosen destination wallet.
- Opening a shift SHALL reconcile the Laci Kas wallet to the declared float inside the open transaction (one `reconciliation` entry, skipped when the declared float already matches the wallet balance), so the wallet equals the physical drawer from the start of every shift.

#### Scenario: Open a cash shift
- **WHEN** a staff member opens the drawer with an initial float of Rp 500.000
- **THEN** the client SHALL insert a `cash_shifts` row with `openedByStaffId`, `openedAt`, `initialFloatMinorUnits = 500000`, `status = 'open'`, `closedAt = null`
- **AND** enqueue a sync change for server replication

#### Scenario: Close a cash shift with reconciliation
- **WHEN** the staff member closes the drawer, counting actual cash of Rp 1.250.000 against expected Rp 1.255.000
- **THEN** the client SHALL update the row: `closedAt`, `closedByStaffId`, `actualCashMinorUnits = 1250000`, `expectedCashMinorUnits = 1255000`, `differenceMinorUnits = -5000` (short), `status = 'closed'`
- **AND** write a reconciliation ledger entry decreasing the Laci Kas balance by 5.000
- **AND** enqueue a sync change

#### Scenario: Close with handover
- **WHEN** staff B closes a shift that staff A opened
- **THEN** `closedByStaffId` SHALL reference staff B while `openedByStaffId` still references staff A

#### Scenario: Query open shift for dashboard status
- **WHEN** the dashboard `StatusPlaque` renders
- **THEN** the app SHALL query `cash_shifts WHERE outletId = ? AND status = 'open' AND deletedAt IS NULL`
- **AND** display `Buka` (Open) if a row exists, `Tutup` (Closed) otherwise

#### Scenario: Soft-deleted shift excluded from open-shift check
- **WHEN** a `cash_shifts` row is soft-deleted (`deletedAt` set) but still has `status = 'open'`
- **THEN** the open-shift query SHALL exclude it via `deletedAt IS NULL`
- (This is the existing convention across all synced tables; the app must not rely on `status` alone.)

#### Scenario: Shared-drawer outlet has null registerId
- **WHEN** an outlet uses a shared drawer (not register-specific)
- **THEN** `registerId` SHALL be null on the `cash_shifts` row
- **AND** the shift SHALL be scoped to the outlet, not a specific register

#### Scenario: Expected cash reads the wallet balance
- **WHEN** the close screen loads for an outlet whose Laci Kas balance is Rp 500.000
- **THEN** expected cash shows Rp 500.000 — derived from the wallet, not from an order-window scan

#### Scenario: Opening float reconciles the wallet
- **WHEN** a shift opens with a declared float of Rp 200.000 while the Laci Kas wallet holds Rp 0 (fresh install)
- **THEN** the wallet is reconciled to Rp 200.000 with a reconciliation ledger entry referencing the shift
- **AND** a Rp 15.000 cash sale later makes expected-in-drawer Rp 215.000
