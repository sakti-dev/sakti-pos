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

The dashboard StatusPlaque SHALL reflect real shift state: `Buka` when an open `cash_shifts` row exists for the outlet, `Tutup` otherwise. While open, the plaque SHALL show a live wallet strip — each active wallet's current balance (Tunai, QRIS) plus the total across wallets — read directly from wallet balances.

- The values SHALL be recomputed from the local database (no mock constants).
- Reboot mid-shift SHALL preserve open state (the row is local-synced data).

#### Scenario: Plaque reflects open shift with wallet strip
- **WHEN** the home screen renders with an open shift while Tunai holds Rp 450.000 and QRIS holds Rp 1.250.000
- **THEN** the plaque shows `Buka` with the Tunai, QRIS, and total rows (Rp 1.700.000)

#### Scenario: Reboot mid-shift
- **WHEN** the device reboots while a shift is open and the app relaunches
- **THEN** the plaque still shows `Buka` with the same live wallet balances

### Requirement: Close Shift (Setoran) Reconciliation

Closing a shift SHALL take expected cash from the Tunai wallet's current balance. QRIS and other wallet balances in the window SHALL be displayed informationally but excluded from expected cash.

- The cashier SHALL enter the physical count (`actualCashMinorUnits`); the app SHALL record signed `differenceMinorUnits` = actual − expected.
- The close SHALL write a `reconciliation` wallet entry applying the variance to the Tunai balance inside the close transaction, so the drawer wallet matches the physical count.
- The close screen SHALL offer an optional setoran section (default off): when enabled, the cashier enters a setoran amount (≤ physical count) and picks a destination wallet from the outlet's other wallets (with inline wallet creation when none exist); the close transaction SHALL write the linked transfer pair moving that amount out of Tunai.
- Non-zero difference SHALL NOT block closing; a note is optional.
- Close SHALL stamp `closedAt` and `closedByStaffId` (active staff session — may differ from the opener for handover).
- If a cart is in progress, close SHALL warn and discard the cart (cart is UI state only).
- After confirmation, a setoran summary screen SHALL show float context, expected, actual, difference, and — when setoran was used — the amount and destination wallet.

#### Scenario: Close with short drawer reconciles the wallet
- **WHEN** expected is Rp 2.600.000 and the cashier counts Rp 2.595.000
- **THEN** the row is updated with `actualCashMinorUnits = 2595000`, `differenceMinorUnits = -5000`, `status = 'closed'`, `closedAt` and `closedByStaffId` set
- **AND** the Tunai balance becomes Rp 2.595.000 via a reconciliation ledger entry
- **AND** a sync change is enqueued

#### Scenario: Setoran moves money out on close
- **WHEN** the cashier counts Rp 495.000, enables setoran with Rp 445.000 to Bank BCA, and confirms
- **THEN** the close writes the reconciliation entry plus a transfer pair: Tunai −445.000, Bank BCA +445.000
- **AND** Tunai ends at Rp 50.000 with the summary screen showing the setoran destination

#### Scenario: Setoran left off behaves as a plain count
- **WHEN** the cashier closes without enabling setoran
- **THEN** only the reconciliation entry is written and the counted amount stays in the drawer wallet

#### Scenario: Handover close
- **WHEN** staff B closes a shift opened by staff A
- **THEN** `closedByStaffId` records staff B while `openedByStaffId` remains staff A

#### Scenario: QRIS excluded from expected
- **WHEN** the shift window contains Rp 850.000 of QRIS orders
- **THEN** the close screen shows the QRIS wallet balance as non-cash information and expected cash excludes it
