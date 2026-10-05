# Spec Delta

## MODIFIED Requirements

### Requirement: Live Drawer Status on Home

The dashboard StatusPlaque SHALL reflect real shift state: `Buka` when an open `cash_shifts` row exists for the outlet, `Tutup` otherwise. While open, the plaque SHALL show a live wallet strip — each active wallet's current balance (Laci Kas, QRIS) plus the total across wallets — read directly from wallet balances.

- The values SHALL be recomputed from the local database (no mock constants).
- Reboot mid-shift SHALL preserve open state (the row is local-synced data).

#### Scenario: Plaque reflects open shift with wallet strip
- **WHEN** the home screen renders with an open shift while Laci Kas holds Rp 450.000 and QRIS holds Rp 1.250.000
- **THEN** the plaque shows `Buka` with the Laci Kas, QRIS, and total rows (Rp 1.700.000)

#### Scenario: Reboot mid-shift
- **WHEN** the device reboots while a shift is open and the app relaunches
- **THEN** the plaque still shows `Buka` with the same live wallet balances

### Requirement: Close Shift (Setoran) Reconciliation

Closing a shift SHALL take expected cash from the Laci Kas wallet's current balance. QRIS and other wallet balances in the window SHALL be displayed informationally but excluded from expected cash.

- The cashier SHALL enter the physical count (`actualCashMinorUnits`); the app SHALL record signed `differenceMinorUnits` = actual − expected.
- The close SHALL write a `reconciliation` wallet entry applying the variance to the Laci Kas balance inside the close transaction, so the drawer wallet matches the physical count.
- The close screen SHALL offer an optional setoran section (default off): when enabled, the cashier enters a setoran amount (≤ physical count) and picks a destination wallet from the outlet's other wallets (with inline wallet creation when none exist); the close transaction SHALL write the linked transfer pair moving that amount out of Laci Kas.
- Non-zero difference SHALL NOT block closing; a note is optional.
- Close SHALL stamp `closedAt` and `closedByStaffId` (active staff session — may differ from the opener for handover).
- If a cart is in progress, close SHALL warn and discard the cart (cart is UI state only).
- After confirmation, a setoran summary screen SHALL show float context, expected, actual, difference, and — when setoran was used — the amount and destination wallet.

#### Scenario: Close with short drawer reconciles the wallet
- **WHEN** expected is Rp 2.600.000 and the cashier counts Rp 2.595.000
- **THEN** the row is updated with `actualCashMinorUnits = 2595000`, `differenceMinorUnits = -5000`, `status = 'closed'`, `closedAt` and `closedByStaffId` set
- **AND** the Laci Kas balance becomes Rp 2.595.000 via a reconciliation ledger entry
- **AND** a sync change is enqueued

#### Scenario: Setoran moves money out on close
- **WHEN** the cashier counts Rp 495.000, enables setoran with Rp 445.000 to Bank BCA, and confirms
- **THEN** the close writes the reconciliation entry plus a transfer pair: Laci Kas −445.000, Bank BCA +445.000
- **AND** Laci Kas ends at Rp 50.000 with the summary screen showing the setoran destination

#### Scenario: Setoran left off behaves as a plain count
- **WHEN** the cashier closes without enabling setoran
- **THEN** only the reconciliation entry is written and the counted amount stays in the drawer wallet

#### Scenario: Handover close
- **WHEN** staff B closes a shift opened by staff A
- **THEN** `closedByStaffId` records staff B while `openedByStaffId` remains staff A

#### Scenario: QRIS excluded from expected
- **WHEN** the shift window contains Rp 850.000 of QRIS orders
- **THEN** the close screen shows the QRIS wallet balance as non-cash information and expected cash excludes it
