# Settings

## ADDED Requirements

### Requirement: Payment Methods Configuration (R11)

The Settings hub SHALL provide a functional "Metode Pembayaran" section backed by `payment_settings`: a Tunai row displayed always-on without a toggle, and QRIS Statis / QRIS Dinamis toggles that read and write the synced row. The mock data array (`lib/data/payment-methods.ts`) and the dead Simpan/Batal buttons SHALL be removed — changes persist immediately on toggle.

- A QRIS toggle SHALL NOT be enabled while `qrisStaticPayload` is null — tapping it SHALL open the QRIS walkthrough instead of flipping the toggle.
- With a payload present, toggles flip instantly and persist.
- A "Ganti QRIS" (replace) action SHALL be visible when a payload exists; it re-opens the walkthrough at the Scan step without altering existing flags until the new payload is confirmed.

#### Scenario: Toggle with payload saved
- **WHEN** the merchant taps QRIS Dinamis and a payload exists
- **THEN** the flag flips in `payment_settings` immediately and the change is enqueued for sync

#### Scenario: Toggle without payload
- **WHEN** the merchant taps QRIS Statis and no payload exists
- **THEN** the toggle SHALL remain off and the walkthrough SHALL open

### Requirement: QRIS First-Enable Walkthrough (R12)

Tapping a QRIS toggle with no saved payload SHALL launch a three-step full-screen walkthrough (reusing the onboarding `wizard-shell` step pattern), powerable for either QRIS mode's first enable:

- **Step 1 (Explain):** what QRIS Statis is, that one scan powers both modes, and that QRIS Dinamis embeds each sale's total automatically.
- **Step 2 (Scan):** camera or gallery capture via the native pick pipeline → jsqr decode → `validateStaticQRIS`. Failures (not a QR / invalid CRC / already dynamic) SHALL show plain-language Indonesian errors and remain on this step.
- **Step 3 (Confirm):** display the parsed Merchant Name, City, and Merchant ID from the payload. "Ya, Simpan" SHALL persist the payload and enable the originally-tapped mode. "Bukan, Ulangi" SHALL return to Step 2.

Cancelling at any step SHALL save nothing and leave toggles unchanged.

#### Scenario: Happy path — scan and confirm
- **WHEN** the merchant scans their valid static QRIS and taps Ya, Simpan
- **THEN** `qrisStaticPayload` is stored, the originally-tapped flag is enabled, and the walkthrough closes

#### Scenario: Scan a dynamic QRIS
- **WHEN** the decoded payload has tag 01 = `12`
- **THEN** Step 2 SHALL show an "already dynamic" explanation and keep the merchant on the scan step

#### Scenario: Cancel mid-walkthrough
- **WHEN** the merchant backs out at the Confirm step
- **THEN** no payload is stored and both flags remain unchanged
