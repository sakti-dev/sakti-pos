# Spec Delta

## Purpose

A dedicated QR pay screen that carries the QRIS payment state machine — big QR
display, waiting state, live payment-event list, and evidence-based
confirmation — entered after the payment form is completed and before the
order is committed.

## ADDED Requirements

### Requirement: Multi-step QRIS payment flow

Selecting a QRIS method on the payment page SHALL open the QR pay screen instead of committing the order. Selecting a QRIS method on the payment page keeps the form hub (method,
customer details, notes, Konfirmasi) unchanged; tapping Konfirmasi with a
QRIS method opens the QR pay screen instead of committing the order. The cash
flow is unchanged.

#### Scenario: Enter the QR pay screen
- **WHEN** the cashier taps Konfirmasi on the payment page with QRIS Statis
  or QRIS Dinamis selected
- **THEN** the QR pay screen opens showing the QR and the pending total, and
  no order has been persisted yet

#### Scenario: Cash is unaffected
- **WHEN** the cashier pays with Tunai
- **THEN** Konfirmasi commits the order and shows the receipt, with no QR pay
  screen in between

#### Scenario: Backing out preserves the form
- **WHEN** the cashier navigates back from the QR pay screen
- **THEN** the payment page is restored with method, customer details, and
  notes intact, and no order was persisted

### Requirement: QR display and waiting state

The QR pay screen SHALL render the QR prominently with the pending total and a truthful waiting state. The QR pay screen renders the QR prominently (screen-width) with the pending
total clearly visible, plus a waiting indicator that reflects the actual
listening state.

#### Scenario: Display for the customer
- **WHEN** the QR pay screen is open
- **THEN** the QR and total are large enough to be scanned from across a
  counter with the device turned to face the customer

#### Scenario: Listening indicator is truthful
- **WHEN** notification listening is active
- **THEN** the screen shows a waiting-for-payment indication; and when
  listening is unavailable the screen instead indicates that notifications
  are not being monitored

### Requirement: Payment event list on the QR pay screen

The QR pay screen SHALL display parsed payment events in a list. Parsed payment events appear in a list on the QR pay screen, each showing
source app label, amount, and time. The list appears only when events exist
and never displaces the QR as the primary element.

#### Scenario: Exact-match event is highlighted and selectable
- **WHEN** an event matching the pending total is in the list
- **THEN** it is visually distinguished and pre-selected, arming the confirm
  action

#### Scenario: Mismatch event is shown but not selectable
- **WHEN** an event's amount differs from the pending total
- **THEN** it is listed with a mismatch indication and cannot be chosen as
  the payment

#### Scenario: Duplicate payment retries
- **WHEN** multiple exact-match events exist
- **THEN** the newest is pre-selected and the cashier may select a different
  exact-match event instead

### Requirement: Commit from the QR pay screen

For QRIS methods the order SHALL be committed from the QR pay screen only. The order is committed from the QR pay screen — either via the armed confirm
action or the manual "Sudah Dibayar" action — and then the receipt is shown.
Manual confirmation is always available so the cashier is never blocked by a
detection failure.

#### Scenario: Armed confirm commits with evidence
- **WHEN** the cashier taps the confirm action while it is armed by a
  matching event
- **THEN** the order is persisted with the QRIS payment method and the
  receipt is shown

#### Scenario: Manual confirm always available
- **WHEN** no event ever matched (listener off, app not selected, parse
  miss) and the customer shows they paid
- **THEN** the cashier can tap Sudah Dibayar to commit the order exactly as
  before this capability existed

#### Scenario: Arm does not commit
- **WHEN** an event arms the confirm action and the cashier takes no action
- **THEN** no order is persisted
