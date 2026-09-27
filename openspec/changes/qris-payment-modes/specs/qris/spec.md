# QRIS

## Purpose

Client-side QRIS payload handling: parse and validate static QRIS strings, derive dynamic QRIS with an embedded transaction amount, render QR codes on the payment screen, and confirm QRIS payments manually (paid = total). No acquirer/gateway integration — derivation is pure local string manipulation per the EMVCo QRIS spec subset used by [verssache/qris-dinamis](https://github.com/verssache/qris-dinamis) (MIT, core ported with attribution).

## ADDED Requirements

### Requirement: QRIS Core Library

The system SHALL provide a pure, dependency-free QRIS module at `apps/pos-app/src/lib/qris/` (ported from qris-dinamis with MIT attribution headers) exposing: TLV parsing, QRIS parsing (merchant name/city/IDs from nested account info), CRC16-CCITT calculation (poly 0x1021, init 0xFFFF), static validation, and static→dynamic conversion.

- `parseQRIS(payload)` SHALL return a structured object including `method` (static/dynamic), merchant name (tag 59), city (tag 60), and merchant account info (tags 26–51 children).
- `validateStaticQRIS(payload)` SHALL accept a payload only when: TLV parses completely, CRC16 (tag 63) verifies, Payload Format Indicator (tag 00) = `01`, and Point of Initiation (tag 01) = `11`.
- `validateStaticQRIS` SHALL return a typed rejection reason distinguishing: not-a-QR-code (undecodable), invalid CRC, and already-dynamic (tag 01 = `12`).
- `toDynamic(payload, amount)` SHALL produce a new payload with: tag 01 changed `11`→`12`, tag 54 (amount) inserted before tag 58, fee/tip tags (55–57) never injected, and tag 63 recomputed over the rebuilt string.
- Amount SHALL be serialized as a plain integer string (no decimals — IDR).

#### Scenario: Convert a valid static QRIS with amount
- **WHEN** `toDynamic` is called with a validated static payload and amount `25500`
- **THEN** the result SHALL parse back with tag 01 = `12` and tag 54 = `25500`
- **AND** the result's CRC16 SHALL verify

#### Scenario: Reject a dynamic QRIS at validation
- **WHEN** `validateStaticQRIS` receives a payload with tag 01 = `12`
- **THEN** it SHALL reject with the "already dynamic" reason, not the generic invalid reason

#### Scenario: CRC tamper detection
- **WHEN** any character of a payload is altered without recomputing tag 63
- **THEN** `validateStaticQRIS` SHALL reject with the invalid-CRC reason

### Requirement: QR Decode and QR Render

The app SHALL decode QR images using `jsqr` from a canvas fed by the existing native pick pipeline (camera or gallery; image loaded via `convertFileSrc`), and SHALL render QRIS payloads as QR codes using the `qrcode` library.

- Decode failures SHALL surface as the "not a QR code" validation reason.
- Render failure (library error) SHALL fall back to displaying the raw payload text in the QR panel alongside a warning, never a blank panel.

#### Scenario: Scan from camera
- **WHEN** the merchant captures their printed QRIS with the camera picker
- **THEN** the image SHALL be decoded locally and the string passed through `validateStaticQRIS`

### Requirement: Payment Screen QRIS Modes

The payment screen SHALL offer Tunai (always), plus QRIS Statis and QRIS Dinamis when enabled in payment settings, ordered Tunai → QRIS Statis → QRIS Dinamis. Kartu and E-Wallet SHALL NOT appear.

- QRIS Statis selected: the panel SHALL render `payment_settings.qrisStaticPayload` as-is.
- QRIS Dinamis selected: the panel SHALL render `toDynamic(payload, cart total)` — the amount the customer scans matches the total exactly.
- Confirming either QRIS mode ("Sudah Dibayar") SHALL complete the sale with `paid = total`, `change = 0`, no amount entry, and `orders.payment_method` = `qris_static` or `qris_dynamic` respectively.
- Tunai keeps the existing numpad/tendered/change flow with `payment_method = 'cash'`.
- Receipt SHALL label the methods Tunai / QRIS Statis / QRIS Dinamis.

#### Scenario: Pay via QRIS Dinamis
- **WHEN** cart total is Rp 37.500 and the cashier selects QRIS Dinamis and taps Sudah Dibayar
- **THEN** the rendered QR embeds amount 37500 (tag 54)
- **AND** the completed order records `payment_method = 'qris_dynamic'`, `paid = 37500`, `change = 0`

#### Scenario: Both QRIS modes disabled
- **WHEN** `payment_settings` has both flags false (or no row)
- **THEN** the payment screen SHALL show Tunai only
