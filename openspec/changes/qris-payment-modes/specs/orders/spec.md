# Orders

## MODIFIED Requirements

### Requirement: R5: Payment Processing

The system SHALL support three payment methods: `cash`, `qris_static`, and `qris_dynamic`. Tunai is always offered; QRIS Statis and QRIS Dinamis appear only when enabled in `payment_settings`.

**WHEN** the payment method is `cash`
**THEN** the system SHALL require the cashier to enter an amount paid, validate that it is >= the cart total, and calculate change as `amountPaid - cartTotal`.

**WHEN** the payment method is `cash` and the amount paid is less than the cart total
**THEN** the system SHALL disable the confirm button.

**WHEN** the payment method is `qris_static` or `qris_dynamic`
**THEN** the system SHALL set `amountPaid` to the cart total and `changeAmount` to 0, with no amount input required, confirmed via the manual "Sudah Dibayar" action.

**WHEN** payment is confirmed
**THEN** the system SHALL record `totalMinorUnits` (cart total), `paymentMethod` (`cash` | `qris_static` | `qris_dynamic`), `amountPaidMinorUnits`, and `changeAmountMinorUnits` on the order.

**WHEN** the payment dialog is open with method `cash`
**THEN** the system SHALL display a numpad for cash amount entry (digits 0-9, 000, and delete), the running total, and the calculated change.

**WHEN** the payment dialog is open with method `qris_static` or `qris_dynamic`
**THEN** the system SHALL display the QR panel (Statis: payload as-is; Dinamis: converted with cart total embedded) and the "Sudah Dibayar" button.

#### Scenario: QRIS Statis order
- **WHEN** a sale completes via QRIS Statis
- **THEN** the order row records `payment_method = 'qris_static'`

#### Scenario: Cash order unchanged
- **WHEN** a sale completes via Tunai
- **THEN** the order row records `payment_method = 'cash'` (unchanged from today)
