## ADDED Requirements

### Requirement: Cash Shift Drawer Control

The system SHALL maintain a `cash_shifts` table as a synced business table scoped by `outletId`, tracking cash-drawer open/close boundaries to protect the till against unaccounted cash drift. This drives the dashboard `StatusPlaque` `Buka`/`Tutup` (Open/Closed) state.

- The `cash_shifts` table SHALL carry: `id` (UUIDv7), `outletId` (scope column), `registerId` (text nullable — null for shared-drawer outlets), `openedByStaffId` (text notNull, soft-ref to `staff` — NOT `userId`, because `users` is server-only and not locally resolvable), `openedAt` (text notNull, ISO 8601 UTC), `closedAt` (text nullable), `initialFloatMinorUnits` (integer notNull, default `0`), `expectedCashMinorUnits` (integer notNull, default `0`), `actualCashMinorUnits` (integer nullable — set at close), `differenceMinorUnits` (integer nullable — `actual − expected`, signed for short/over), `status` (text enum `['open','closed']`, notNull), `note` (text nullable), plus the standard sync columns.
- All money columns use integer minor units (no float).
- `status` uses a drizzle text enum, NOT a CHECK constraint (baresync does not inspect CHECKs; a server-pushed row violating a local CHECK would fail the INSERT silently and drop out of sync).

#### Scenario: Open a cash shift
- **WHEN** a staff member opens the drawer with an initial float of Rp 500.000
- **THEN** the client SHALL insert a `cash_shifts` row with `openedByStaffId`, `openedAt`, `initialFloatMinorUnits = 500000`, `status = 'open'`, `closedAt = null`
- **AND** enqueue a sync change for server replication

#### Scenario: Close a cash shift with reconciliation
- **WHEN** the staff member closes the drawer, counting actual cash of Rp 1.250.000 against expected Rp 1.255.000
- **THEN** the client SHALL update the row: `closedAt`, `actualCashMinorUnits = 1250000`, `expectedCashMinorUnits = 1255000`, `differenceMinorUnits = -5000` (short), `status = 'closed'`
- **AND** enqueue a sync change

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
