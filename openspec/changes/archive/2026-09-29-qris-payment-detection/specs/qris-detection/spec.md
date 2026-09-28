# Spec Delta

## Purpose

Detect incoming QRIS settlement money by listening to notifications from
merchant-chosen bank/e-wallet apps, parse the Rupiah amount, and surface every
parsed payment event so the cashier can confirm orders from evidence instead
of faith.

## ADDED Requirements

### Requirement: Monitored-app allowlist configuration

The merchant SHALL be able to choose which installed apps the POS monitors. The merchant can choose which installed apps the POS monitors for payment
notifications. Only notifications from selected apps are processed; all others
are ignored without waking the app runtime.

#### Scenario: Select and persist monitored apps
- **WHEN** the merchant enables apps in the monitored-apps settings list
- **THEN** the selection persists across app restarts and device reboots, and
  the notification listener uses it immediately without requiring the app UI
  to be running

#### Scenario: Only launchable apps are offered
- **WHEN** the merchant opens the monitored-apps settings list
- **THEN** it shows user-launchable installed apps (searchable by name), and
  system services or libraries are not offered

#### Scenario: Empty allowlist monitors nothing
- **WHEN** no apps are selected and a payment notification arrives
- **THEN** the notification is ignored and no payment event is produced

### Requirement: Rupiah amount parsing from notification text

Notification text from allowlisted apps SHALL be parsed for a Rupiah amount. Notification text from allowlisted apps is parsed for a Rupiah amount. Amounts
are anchored on an explicit currency marker so bare numbers (reference codes,
phone numbers) are never parsed as money.

#### Scenario: Thousands separators
- **WHEN** the notification text contains `Rp15.000` or `Rp 15.000`
- **THEN** the parsed amount is Rp15.000

#### Scenario: Trailing cents are dropped, not multiplied
- **WHEN** the notification text contains `Rp15.000,00`
- **THEN** the parsed amount is Rp15.000 (the two-digit cents group is
  discarded, not appended as hundreds)

#### Scenario: No currency marker
- **WHEN** the notification text contains numbers without a Rupiah marker
- **THEN** no amount is parsed and the notification is dropped

### Requirement: Payment event capture and local retention

Each parsed notification SHALL become a payment event held on-device in a capped buffer. Each parsed notification becomes a payment event (source app, parsed amount,
timestamp, raw text) held on-device in a capped recent-events buffer. Events
are never sent to the server. Events captured while the app UI is not running
are available when the cashier next opens the payment flow.

#### Scenario: Event captured while app is backgrounded
- **WHEN** a payment notification arrives while the app UI is suspended or the
  app process was restarted
- **THEN** the event is still present in the recent-events list when the
  cashier opens the QR pay screen

#### Scenario: Buffer is capped
- **WHEN** more events arrive than the buffer capacity
- **THEN** the oldest events are discarded and the newest are retained

### Requirement: Three-state match outcome per event

Every payment event SHALL resolve to exactly one outcome against the pending total. Every payment event is evaluated against the pending order total and resolves
to exactly one outcome: exact match, mismatch, or no amount.

#### Scenario: Exact match
- **WHEN** an event's parsed amount equals the pending order total
- **THEN** the event is presented as a match

#### Scenario: Mismatch is visible but inert
- **WHEN** an event's parsed amount differs from the pending order total
- **THEN** the event is shown with a mismatch indication and its amount, and
  it cannot be selected as the payment for the order

#### Scenario: Underpayment exposure
- **WHEN** the customer paid less than the pending order total and the
  notification is parsed
- **THEN** the cashier sees the received amount next to the expected total
  without leaving the QR pay screen

### Requirement: Session-anchored auto-arm with human confirm

A payment event SHALL auto-arm the confirm action only within the current payment session, and a human SHALL always tap the final confirm. A payment event auto-arms the confirm action only when its timestamp falls
within the current payment session, which starts when the payment page is
opened with a pending total. Arming never confirms the order by itself; a
human always taps the confirm action.

#### Scenario: Sticker payment during form fill
- **WHEN** the customer pays by scanning the merchant's printed static QR
  while the cashier is still on the payment page, before the QR pay screen is
  opened
- **THEN** that event still arms the confirm action on the QR pay screen

#### Scenario: Stale notification does not arm
- **WHEN** an event's timestamp precedes the current payment session
- **THEN** the event may be visible in the recent list but does not arm the
  confirm action

#### Scenario: Armed state shows its evidence
- **WHEN** the confirm action is armed by an event
- **THEN** the armed state names the source app, amount, and time so the
  cashier can veto on anomaly

### Requirement: Notification access grant awareness

The app SHALL detect whether notification access is granted and degrade truthfully when not. The app detects whether notification access is granted, guides the merchant to
the system setting when it is not, and degrades truthfully when listening is
unavailable.

#### Scenario: Not granted
- **WHEN** notification access is not granted to the POS
- **THEN** the QR pay screen indicates that notifications are not being
  monitored, and manual payment confirmation remains fully available

#### Scenario: Granted after following the guide
- **WHEN** the merchant grants notification access via the linked system
  settings and returns to the app
- **THEN** the app reflects the granted state without requiring a reinstall
