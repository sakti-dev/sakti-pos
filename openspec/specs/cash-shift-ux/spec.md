# cash-shift-ux Specification

## Purpose
Cash-drawer session lifecycle: shift open gate, live drawer status, and the close (setoran) reconciliation flow — the till is accountable per shift, per staff.

## Requirements

### Requirement: Shift Gate on Sale Entry

The POS SHALL block transaction entry while no open cash shift exists for the current outlet. The gate exists at the POS route level, not at checkout, so the morning ritual (login → open shift → sell) has a single clear step.

- With no open shift, the POS screen SHALL render an "open shift" panel (initial float input + confirm) instead of the sale UI.
- The gate SHALL NOT affect non-sale routes (catalog, transactions history, settings).
- After a shift is closed, the POS SHALL return to the gated state.

#### Scenario: Cashier logs in before any shift
- **WHEN** a staff member authenticates and navigates to the POS while the outlet has no open shift
- **THEN** the POS shows the open-shift panel with a float input
- **AND** no product selection or checkout is possible

#### Scenario: Shift closes back to gate
- **WHEN** a shift is closed and confirmed
- **THEN** the POS returns to the gated open-shift panel

### Requirement: Open Shift

Opening a shift SHALL insert a `cash_shifts` row scoped to the current outlet with `openedByStaffId` from the active staff session, `openedAt` (ISO 8601 UTC), the entered `initialFloatMinorUnits`, `status: 'open'`, and enqueue it for sync.

- Float input SHALL be in Rupiah, stored as integer minor units, default 0.
- `registerId` stays null in v1 (one drawer per outlet).
- Any authenticated staff member may open a shift in v1.

#### Scenario: Open with float
- **WHEN** the cashier opens the shift with float Rp 500.000
- **THEN** a row is inserted with `initialFloatMinorUnits = 500000`, `status = 'open'`, `openedByStaffId` = current staff
- **AND** a sync change is enqueued

### Requirement: Live Drawer Status on Home

The dashboard StatusPlaque SHALL reflect real shift state: `Buka` when an open `cash_shifts` row exists for the outlet, `Tutup` otherwise. While open, the plaque SHALL show float + completed cash sales so far in the shift window (the money expected in the drawer).

- The value SHALL be recomputed from the local database (no mock constants).
- Reboot mid-shift SHALL preserve open state (the row is local-synced data).

#### Scenario: Plaque reflects open shift
- **WHEN** the home screen renders with an open shift whose float + cash sales equal Rp 2.600.000
- **THEN** the plaque shows `Buka` with Rp 2.600.000

#### Scenario: Reboot mid-shift
- **WHEN** the device reboots while a shift is open and the app relaunches
- **THEN** the plaque still shows `Buka` with the same live amount

### Requirement: Close Shift (Setoran) Reconciliation

Closing a shift SHALL compute expected cash = `initialFloatMinorUnits` + Σ `totalMinorUnits` of orders with `paymentMethod = 'cash'`, `status = 'completed'`, `createdAt` within `[openedAt, closedAt)`, and `deletedAt IS NULL`, scoped to the outlet. QRIS totals in the window SHALL be displayed informationally but excluded from expected cash.

- The cashier SHALL enter the physical count (`actualCashMinorUnits`); the app SHALL record signed `differenceMinorUnits` = actual − expected.
- Non-zero difference SHALL NOT block closing; a note is optional.
- Close SHALL stamp `closedAt` and `closedByStaffId` (active staff session — may differ from the opener for handover).
- If a cart is in progress, close SHALL warn and discard the cart (cart is UI state only).
- After confirmation, a setoran summary screen SHALL show float, cash sales, expected, actual, and difference.

#### Scenario: Close with short drawer
- **WHEN** expected is Rp 2.600.000 and the cashier counts Rp 2.595.000
- **THEN** the row is updated with `actualCashMinorUnits = 2595000`, `differenceMinorUnits = -5000`, `status = 'closed'`, `closedAt` and `closedByStaffId` set
- **AND** a sync change is enqueued

#### Scenario: Handover close
- **WHEN** staff B closes a shift opened by staff A
- **THEN** `closedByStaffId` records staff B while `openedByStaffId` remains staff A

#### Scenario: QRIS excluded from expected
- **WHEN** the shift window contains Rp 850.000 of QRIS orders
- **THEN** the close screen shows the QRIS total as non-cash information and expected cash excludes it
